-- R3 controlled comparison exports. Exports require a separate audit decision.

CREATE TABLE public.evaluation_comparison_exports (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  intake_id uuid NOT NULL,
  requested_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  candidate_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  purpose text NOT NULL,
  requested_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  decision_id uuid,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evaluation_comparison_exports_intake_scope_fk FOREIGN KEY (organization_id, intake_id)
    REFERENCES public.intakes (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT evaluation_comparison_exports_candidate_ids_ck CHECK (jsonb_typeof(candidate_ids) = 'array' AND jsonb_array_length(candidate_ids) <= 20),
  CONSTRAINT evaluation_comparison_exports_purpose_ck CHECK (length(btrim(purpose)) BETWEEN 1 AND 300),
  CONSTRAINT evaluation_comparison_exports_state_ck CHECK (state IN ('pending', 'approved', 'denied')),
  CONSTRAINT evaluation_comparison_exports_scope_uq UNIQUE (organization_id, id)
);
CREATE INDEX evaluation_comparison_exports_org_state_idx ON public.evaluation_comparison_exports (organization_id, state, requested_at);
ALTER TABLE public.evaluation_comparison_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evaluation_comparison_exports FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r1_deny_anon_authenticated_evaluation_comparison_exports ON public.evaluation_comparison_exports
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.evaluation_comparison_export_decisions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  export_id uuid NOT NULL,
  reviewer_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  decision text NOT NULL,
  decided_at timestamptz NOT NULL,
  reason text,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evaluation_comparison_export_decisions_export_scope_fk FOREIGN KEY (organization_id, export_id)
    REFERENCES public.evaluation_comparison_exports (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT evaluation_comparison_export_decisions_decision_ck CHECK (decision IN ('approved', 'denied')),
  CONSTRAINT evaluation_comparison_export_decisions_reason_ck CHECK (reason IS NULL OR length(reason) <= 500),
  CONSTRAINT evaluation_comparison_export_decisions_scope_uq UNIQUE (organization_id, id),
  CONSTRAINT evaluation_comparison_export_decisions_export_uq UNIQUE (organization_id, export_id)
);
CREATE INDEX evaluation_comparison_export_decisions_org_time_idx ON public.evaluation_comparison_export_decisions (organization_id, decided_at);
ALTER TABLE public.evaluation_comparison_export_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evaluation_comparison_export_decisions FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r1_deny_anon_authenticated_evaluation_comparison_export_decisions ON public.evaluation_comparison_export_decisions
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.mmhr_create_evaluation_comparison_export(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; request public.evaluation_comparison_exports%ROWTYPE; receipt jsonb; v_export_id uuid; v_organization_id uuid; v_intake_id uuid; v_requester_id uuid; v_candidate_ids jsonb; v_purpose text; v_requested_at timestamptz;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'exportId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'requestedByIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR jsonb_typeof(payload->'candidateIds') <> 'array' OR jsonb_array_length(payload->'candidateIds') > 20
    OR coalesce(payload->>'purpose','') = '' OR coalesce(payload->>'requestedAt','') = ''
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid comparison export input'; END IF;
  v_export_id := (payload->>'exportId')::uuid; v_organization_id := (payload->>'organizationId')::uuid; v_intake_id := (payload->>'intakeId')::uuid; v_requester_id := (payload->>'requestedByIdentityId')::uuid; v_candidate_ids := payload->'candidateIds'; v_purpose := btrim(payload->>'purpose'); v_requested_at := (payload->>'requestedAt')::timestamptz;
  IF length(v_purpose) > 300 OR v_requested_at IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_candidate_ids) AS item WHERE jsonb_typeof(item) <> 'string' OR item #>> '{}' !~ '^[0-9a-fA-F-]{36}$') OR jsonb_array_length(v_candidate_ids) <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(v_candidate_ids) AS value) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid comparison export input'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Create comparison export request', correlation_id, idempotency_key);
  IF v_requester_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.comparison.export.request', idempotency_key, payload);
  IF receipt IS NOT NULL THEN SELECT * INTO request FROM public.evaluation_comparison_exports AS e WHERE e.id=(receipt->>'entity_id')::uuid AND e.organization_id=v_organization_id; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('exportId',request.id,'organizationId',request.organization_id,'state',request.state,'decisionId',request.decision_id,'outcomeCode','replayed','correlationId',correlation_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.intakes AS i WHERE i.id=v_intake_id AND i.organization_id=v_organization_id AND i.status <> 'archived') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Comparison export scope denied'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_candidate_ids) AS item WHERE NOT EXISTS (SELECT 1 FROM public.evaluation_candidates AS c WHERE c.id=item::uuid AND c.organization_id=v_organization_id AND c.intake_id=v_intake_id AND c.state <> 'archived')) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Comparison export scope denied'; END IF;
  INSERT INTO public.evaluation_comparison_exports (id, organization_id, intake_id, requested_by_identity_id, candidate_ids, purpose, requested_at, correlation_id) VALUES (v_export_id, v_organization_id, v_intake_id, v_requester_id, v_candidate_ids, v_purpose, v_requested_at, correlation_id) RETURNING * INTO request;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r3.comparison.export.request', 'comparison.export.request', 'comparison_export', request.id, v_organization_id, 'Create comparison export request', correlation_id, idempotency_key, payload, NULL, jsonb_build_object('state',request.state), context.authorization_time);
  RETURN jsonb_build_object('exportId',request.id,'organizationId',request.organization_id,'state',request.state,'decisionId',NULL,'outcomeCode','created','correlationId',correlation_id);
END
$$;

CREATE OR REPLACE FUNCTION public.mmhr_decide_evaluation_comparison_export(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; request public.evaluation_comparison_exports%ROWTYPE; decision_row public.evaluation_comparison_export_decisions%ROWTYPE; receipt jsonb; v_export_id uuid; v_organization_id uuid; v_decision_id uuid; v_reviewer_id uuid; v_decision text; v_reason text; v_decided_at timestamptz;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'decisionId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'exportId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'reviewerIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'decision','') NOT IN ('approved','denied') OR coalesce(payload->>'decidedAt','') = ''
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid comparison export decision'; END IF;
  v_export_id := (payload->>'exportId')::uuid; v_organization_id := (payload->>'organizationId')::uuid; v_decision_id := (payload->>'decisionId')::uuid; v_reviewer_id := (payload->>'reviewerIdentityId')::uuid; v_decision := payload->>'decision'; v_reason := CASE WHEN payload ? 'reason' AND jsonb_typeof(payload->'reason') <> 'null' THEN btrim(payload->>'reason') ELSE NULL END; v_decided_at := (payload->>'decidedAt')::timestamptz;
  IF v_decided_at IS NULL OR (v_reason IS NOT NULL AND length(v_reason) > 500) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid comparison export decision'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('audit.export', v_organization_id, 'Decide comparison export request', correlation_id, idempotency_key);
  IF v_reviewer_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.comparison.export.decision', idempotency_key, payload);
  IF receipt IS NOT NULL THEN SELECT * INTO decision_row FROM public.evaluation_comparison_export_decisions AS d WHERE d.id=(receipt->>'entity_id')::uuid AND d.organization_id=v_organization_id; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('exportId',decision_row.export_id,'organizationId',decision_row.organization_id,'state',decision_row.decision,'decisionId',decision_row.id,'outcomeCode','replayed','correlationId',correlation_id); END IF;
  SELECT * INTO request FROM public.evaluation_comparison_exports AS e WHERE e.id=v_export_id AND e.organization_id=v_organization_id FOR UPDATE;
  IF NOT FOUND OR request.state <> 'pending' OR request.requested_by_identity_id = v_reviewer_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  INSERT INTO public.evaluation_comparison_export_decisions (id, organization_id, export_id, reviewer_identity_id, decision, decided_at, reason, correlation_id) VALUES (v_decision_id, v_organization_id, v_export_id, v_reviewer_id, v_decision, v_decided_at, v_reason, correlation_id) RETURNING * INTO decision_row;
  UPDATE public.evaluation_comparison_exports AS e SET state=v_decision, decision_id=decision_row.id WHERE e.id=v_export_id AND e.organization_id=v_organization_id;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r3.comparison.export.decision', 'comparison.export.decision', 'comparison_export_decision', decision_row.id, v_organization_id, 'Decide comparison export request', correlation_id, idempotency_key, payload, jsonb_build_object('state',request.state), jsonb_build_object('state',v_decision), context.authorization_time);
  RETURN jsonb_build_object('exportId',v_export_id,'organizationId',v_organization_id,'state',v_decision,'decisionId',decision_row.id,'outcomeCode','decided','correlationId',correlation_id);
END
$$;

REVOKE ALL ON FUNCTION public.mmhr_create_evaluation_comparison_export(jsonb,uuid,uuid), public.mmhr_decide_evaluation_comparison_export(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_create_evaluation_comparison_export(jsonb,uuid,uuid), public.mmhr_decide_evaluation_comparison_export(jsonb,uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_create_evaluation_comparison_export(jsonb,uuid,uuid) IS 'R3 organization-scoped audited comparison export request.';
COMMENT ON FUNCTION public.mmhr_decide_evaluation_comparison_export(jsonb,uuid,uuid) IS 'R3 separate audit decision for masked comparison export.';
