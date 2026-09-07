-- R4 audited clarification lifecycle for approved and distributed RFP versions.

CREATE TABLE public.rfp_clarifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  rfp_version_id uuid NOT NULL,
  question text NOT NULL,
  answer text,
  change_summary text,
  decision text NOT NULL DEFAULT 'pending',
  status text NOT NULL DEFAULT 'pending',
  asked_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  answered_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  approved_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  approval_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfp_clarifications_version_scope_fk FOREIGN KEY (organization_id, rfp_version_id) REFERENCES public.rfp_versions (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT rfp_clarifications_decision_ck CHECK (decision IN ('pending', 'accepted', 'rejected', 'deferred')),
  CONSTRAINT rfp_clarifications_status_ck CHECK (status IN ('pending', 'answered', 'approved', 'rejected')),
  CONSTRAINT rfp_clarifications_question_ck CHECK (length(btrim(question)) BETWEEN 1 AND 5000),
  CONSTRAINT rfp_clarifications_answer_ck CHECK (answer IS NULL OR length(btrim(answer)) BETWEEN 1 AND 5000),
  CONSTRAINT rfp_clarifications_change_ck CHECK (change_summary IS NULL OR length(btrim(change_summary)) BETWEEN 1 AND 5000),
  CONSTRAINT rfp_clarifications_approval_ck CHECK ((status <> 'approved' AND approved_by_identity_id IS NULL AND approved_at IS NULL AND approval_reference IS NULL) OR (status = 'approved' AND answer IS NOT NULL AND approved_by_identity_id IS NOT NULL AND approved_at IS NOT NULL AND approval_reference IS NOT NULL)),
  CONSTRAINT rfp_clarifications_reference_ck CHECK (approval_reference IS NULL OR approval_reference ~ '^approval:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$')
);
CREATE UNIQUE INDEX rfp_clarifications_organization_id_uq ON public.rfp_clarifications (organization_id, id);
CREATE INDEX rfp_clarifications_version_status_idx ON public.rfp_clarifications (organization_id, rfp_version_id, status);
ALTER TABLE public.rfp_clarifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rfp_clarifications FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r1_deny_anon_authenticated_rfp_clarifications ON public.rfp_clarifications AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.mmhr_record_rfp_clarification(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  receipt jsonb;
  clarification public.rfp_clarifications%ROWTYPE;
  version_row public.rfp_versions%ROWTYPE;
  v_action text;
  v_id uuid;
  v_org uuid;
  v_actor uuid;
  v_rfp_id uuid;
  v_version integer;
  v_question text;
  v_answer text;
  v_change text;
  v_decision text;
  v_reference text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'clarificationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'rfpId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'version','') !~ '^[1-9][0-9]{0,3}$'
    OR payload->>'action' NOT IN ('ask', 'answer', 'approve')
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP clarification input'; END IF;
  v_action := payload->>'action'; v_id := (payload->>'clarificationId')::uuid; v_rfp_id := (payload->>'rfpId')::uuid; v_org := (payload->>'organizationId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_version := (payload->>'version')::integer;
  v_question := CASE WHEN payload ? 'question' THEN btrim(payload->>'question') ELSE NULL END;
  v_answer := CASE WHEN payload ? 'answer' AND jsonb_typeof(payload->'answer') <> 'null' THEN btrim(payload->>'answer') ELSE NULL END;
  v_change := CASE WHEN payload ? 'changeSummary' AND jsonb_typeof(payload->'changeSummary') <> 'null' THEN btrim(payload->>'changeSummary') ELSE NULL END;
  v_decision := CASE WHEN payload ? 'decision' THEN payload->>'decision' ELSE 'pending' END;
  v_reference := CASE WHEN payload ? 'approvalReference' AND jsonb_typeof(payload->'approvalReference') <> 'null' THEN btrim(payload->>'approvalReference') ELSE NULL END;
  IF v_action = 'ask' AND (v_question IS NULL OR length(v_question) NOT BETWEEN 1 AND 5000) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP clarification question'; END IF;
  IF v_action = 'answer' AND (v_answer IS NULL OR length(v_answer) NOT BETWEEN 1 AND 5000 OR v_decision NOT IN ('accepted','rejected','deferred')) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP clarification answer'; END IF;
  IF v_action = 'approve' AND (v_reference IS NULL OR v_reference !~ '^approval:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP clarification approval'; END IF;
  IF v_answer IS NOT NULL AND length(v_answer) > 5000 OR v_change IS NOT NULL AND length(v_change) > 5000 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP clarification content'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Record RFP clarification', correlation_id, idempotency_key);
  IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rfp.clarification.' || v_action, idempotency_key, payload);
  IF receipt IS NOT NULL THEN SELECT * INTO clarification FROM public.rfp_clarifications c WHERE c.id = (receipt->>'entity_id')::uuid AND c.organization_id = v_org; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('clarificationId', clarification.id, 'rfpId', (SELECT r.rfp_id FROM public.rfp_versions r WHERE r.id = clarification.rfp_version_id), 'organizationId', clarification.organization_id, 'version', (SELECT r.version FROM public.rfp_versions r WHERE r.id = clarification.rfp_version_id), 'question', clarification.question, 'answer', clarification.answer, 'changeSummary', clarification.change_summary, 'decision', clarification.decision, 'status', clarification.status, 'askedByIdentityId', clarification.asked_by_identity_id, 'answeredByIdentityId', clarification.answered_by_identity_id, 'approvedByIdentityId', clarification.approved_by_identity_id, 'approvedAt', clarification.approved_at, 'approvalReference', clarification.approval_reference, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  SELECT * INTO version_row FROM public.rfp_versions r WHERE r.rfp_id = v_rfp_id AND r.organization_id = v_org AND r.version = v_version FOR UPDATE;
  IF NOT FOUND OR version_row.status NOT IN ('approved','distributed') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP clarification denied'; END IF;
  IF v_action = 'ask' THEN
    INSERT INTO public.rfp_clarifications (id, organization_id, rfp_version_id, question, asked_by_identity_id) VALUES (v_id, v_org, version_row.id, v_question, v_actor) RETURNING * INTO clarification;
  ELSE
    SELECT * INTO clarification FROM public.rfp_clarifications c WHERE c.id = v_id AND c.organization_id = v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP clarification denied'; END IF;
    IF v_action = 'answer' THEN
      IF clarification.status <> 'pending' THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP clarification denied'; END IF;
      UPDATE public.rfp_clarifications SET answer = v_answer, change_summary = v_change, decision = v_decision, status = 'answered', answered_by_identity_id = v_actor, updated_at = clock_timestamp() WHERE id = clarification.id RETURNING * INTO clarification;
    ELSIF clarification.status <> 'answered' OR clarification.answer IS NULL OR clarification.answered_by_identity_id = v_actor THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP clarification approval denied';
    ELSE
      UPDATE public.rfp_clarifications SET status = 'approved', approved_by_identity_id = v_actor, approved_at = clock_timestamp(), approval_reference = v_reference, updated_at = clock_timestamp() WHERE id = clarification.id RETURNING * INTO clarification;
    END IF;
  END IF;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.rfp.clarification.' || v_action, 'rfp.clarification.' || v_action, 'rfp_clarification', clarification.id, v_org, 'Record RFP clarification', correlation_id, idempotency_key, payload, jsonb_build_object('state', CASE WHEN v_action = 'ask' THEN 'pending' ELSE 'completed' END, 'version', version_row.version), jsonb_build_object('state', CASE WHEN v_action = 'approve' THEN 'completed' ELSE 'pending' END, 'version', version_row.version), context.authorization_time);
  RETURN jsonb_build_object('clarificationId', clarification.id, 'rfpId', version_row.rfp_id, 'organizationId', clarification.organization_id, 'version', version_row.version, 'question', clarification.question, 'answer', clarification.answer, 'changeSummary', clarification.change_summary, 'decision', clarification.decision, 'status', clarification.status, 'askedByIdentityId', clarification.asked_by_identity_id, 'answeredByIdentityId', clarification.answered_by_identity_id, 'approvedByIdentityId', clarification.approved_by_identity_id, 'approvedAt', clarification.approved_at, 'approvalReference', clarification.approval_reference, 'outcomeCode', 'recorded', 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_record_rfp_clarification(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_rfp_clarification(jsonb, uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_record_rfp_clarification(jsonb, uuid, uuid) IS 'R4 audited question, answer, decision, and MMHR approval lifecycle for RFP clarifications.';
