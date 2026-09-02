-- R3 saved intake command with immutable revision history.
CREATE TABLE public.intake_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, intake_id uuid NOT NULL,
  revision integer NOT NULL, snapshot jsonb NOT NULL, changed_by_identity_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(), correlation_id uuid NOT NULL,
  CONSTRAINT intake_history_scope_fk FOREIGN KEY (organization_id, intake_id) REFERENCES public.intakes (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT intake_history_revision_uq UNIQUE (organization_id, intake_id, revision),
  CONSTRAINT intake_history_snapshot_ck CHECK (jsonb_typeof(snapshot) = 'object' AND pg_column_size(snapshot) <= 100000),
  CONSTRAINT intake_history_revision_ck CHECK (revision > 0)
);
CREATE INDEX intake_history_scope_time_idx ON public.intake_history (organization_id, intake_id, changed_at);
ALTER TABLE public.intake_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.intake_history FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r1_deny_anon_authenticated_intake_history ON public.intake_history AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.mmhr_save_intake(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; intake public.intakes%ROWTYPE; v_organization_id uuid; v_intake_id uuid; v_actor_id uuid; v_expected_revision integer; v_status text; v_data jsonb; receipt jsonb; v_outcome text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'expectedRevision','') !~ '^[0-9]+$' OR jsonb_typeof(payload->'data') <> 'object'
    OR coalesce(payload->>'status','') NOT IN ('draft','in_progress','submitted') OR pg_column_size(payload->'data') > 100000
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid intake input'; END IF;
  v_organization_id := (payload->>'organizationId')::uuid; v_actor_id := (payload->>'actorIdentityId')::uuid; v_expected_revision := (payload->>'expectedRevision')::integer; v_status := payload->>'status'; v_data := payload->'data';
  IF payload ? 'intakeId' AND jsonb_typeof(payload->'intakeId') <> 'null' THEN v_intake_id := (payload->>'intakeId')::uuid; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Save intake', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.intake.save', idempotency_key, payload);
  IF receipt IS NOT NULL THEN SELECT i.* INTO intake FROM public.intakes AS i WHERE i.id = (receipt->>'entity_id')::uuid AND i.organization_id = v_organization_id; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; v_outcome := 'replayed'; ELSE
    IF v_intake_id IS NULL THEN
      IF v_expected_revision <> 0 THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Intake revision denied'; END IF;
      INSERT INTO public.intakes (organization_id, status, company_context, current_systems, compliance_needs, budget, timeline, stakeholders, decision_process, submitted_at, created_by_identity_id, updated_by_identity_id)
      VALUES (v_organization_id, v_status, v_data->'companyContext', v_data->'currentSystems', v_data->'complianceNeeds', v_data->'budget', v_data->'timeline', v_data->'stakeholders', v_data->'decisionProcess', CASE WHEN v_status='submitted' THEN clock_timestamp() ELSE NULL END, context.actor_identity_id, context.actor_identity_id) RETURNING * INTO intake;
    ELSE
      SELECT i.* INTO intake FROM public.intakes AS i WHERE i.id=v_intake_id AND i.organization_id=v_organization_id FOR UPDATE;
      IF NOT FOUND OR intake.revision <> v_expected_revision OR intake.status='archived' THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Intake revision denied'; END IF;
      UPDATE public.intakes AS i SET status=v_status, company_context=CASE WHEN v_data ? 'companyContext' THEN v_data->'companyContext' ELSE i.company_context END, current_systems=CASE WHEN v_data ? 'currentSystems' THEN v_data->'currentSystems' ELSE i.current_systems END, compliance_needs=CASE WHEN v_data ? 'complianceNeeds' THEN v_data->'complianceNeeds' ELSE i.compliance_needs END, budget=CASE WHEN v_data ? 'budget' THEN v_data->'budget' ELSE i.budget END, timeline=CASE WHEN v_data ? 'timeline' THEN v_data->'timeline' ELSE i.timeline END, stakeholders=CASE WHEN v_data ? 'stakeholders' THEN v_data->'stakeholders' ELSE i.stakeholders END, decision_process=CASE WHEN v_data ? 'decisionProcess' THEN v_data->'decisionProcess' ELSE i.decision_process END, submitted_at=CASE WHEN v_status='submitted' THEN coalesce(i.submitted_at, clock_timestamp()) WHEN v_status IN ('draft','in_progress') THEN NULL ELSE i.submitted_at END, revision=i.revision+1, updated_by_identity_id=context.actor_identity_id, updated_at=clock_timestamp() WHERE i.id=v_intake_id AND i.organization_id=v_organization_id RETURNING * INTO intake;
    END IF;
    INSERT INTO public.intake_history (organization_id, intake_id, revision, snapshot, changed_by_identity_id, correlation_id)
    VALUES (v_organization_id, intake.id, intake.revision, jsonb_build_object('status', intake.status, 'companyContext', intake.company_context, 'currentSystems', intake.current_systems, 'complianceNeeds', intake.compliance_needs, 'budget', intake.budget, 'timeline', intake.timeline, 'stakeholders', intake.stakeholders, 'decisionProcess', intake.decision_process), context.actor_identity_id, correlation_id);
    PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r3.intake.save', 'intake.save', 'intake', intake.id, v_organization_id, 'Save intake', correlation_id, idempotency_key, payload, jsonb_build_object('version',1), jsonb_build_object('version',1), context.authorization_time); v_outcome := CASE WHEN intake.revision=1 THEN 'created' ELSE 'updated' END;
  END IF;
  RETURN jsonb_build_object('intakeId', intake.id, 'organizationId', intake.organization_id, 'status', intake.status, 'revision', intake.revision, 'outcomeCode', v_outcome, 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_save_intake(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_save_intake(jsonb,uuid,uuid) TO authenticated;
