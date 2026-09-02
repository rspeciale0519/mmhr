-- R3 initial masked evaluation snapshot. The snapshot never includes vendor identity fields.

CREATE TABLE public.evaluation_assessments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  intake_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'masked',
  candidate_snapshot jsonb NOT NULL,
  created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evaluation_assessments_scope_fk FOREIGN KEY (organization_id, intake_id) REFERENCES public.intakes (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT evaluation_assessments_scope_uq UNIQUE (organization_id, id),
  CONSTRAINT evaluation_assessments_intake_uq UNIQUE (organization_id, intake_id),
  CONSTRAINT evaluation_assessments_state_ck CHECK (state = 'masked'),
  CONSTRAINT evaluation_assessments_snapshot_ck CHECK (jsonb_typeof(candidate_snapshot) = 'array' AND jsonb_array_length(candidate_snapshot) BETWEEN 1 AND 5)
);
ALTER TABLE public.evaluation_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evaluation_assessments FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r3_deny_anon_authenticated_evaluation_assessments ON public.evaluation_assessments AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.mmhr_create_initial_evaluation(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; receipt jsonb; v_assessment_id uuid; v_organization_id uuid; v_intake_id uuid; v_actor_id uuid; v_candidate_count integer; v_snapshot jsonb;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL OR coalesce(payload->>'assessmentId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid initial evaluation input'; END IF;
  v_assessment_id := (payload->>'assessmentId')::uuid; v_organization_id := (payload->>'organizationId')::uuid; v_intake_id := (payload->>'intakeId')::uuid; v_actor_id := (payload->>'actorIdentityId')::uuid;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Create initial evaluation', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.initial.evaluation.create', idempotency_key, payload);
  IF receipt IS NOT NULL THEN SELECT ea.candidate_snapshot INTO v_snapshot FROM public.evaluation_assessments AS ea WHERE ea.id=(receipt->>'entity_id')::uuid AND ea.organization_id=v_organization_id; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('assessmentId',(receipt->>'entity_id')::uuid,'organizationId',v_organization_id,'intakeId',v_intake_id,'state','masked','candidateCount',jsonb_array_length(v_snapshot),'outcomeCode','replayed','correlationId',correlation_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.intakes AS i WHERE i.id=v_intake_id AND i.organization_id=v_organization_id AND i.status IN ('submitted','under_review','completed')) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Initial evaluation denied'; END IF;
  SELECT count(*)::integer INTO v_candidate_count FROM public.evaluation_candidates AS ec WHERE ec.organization_id=v_organization_id AND ec.intake_id=v_intake_id AND ec.source='initial' AND ec.state <> 'archived';
  IF v_candidate_count < 1 OR v_candidate_count > 5 THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Initial candidate boundary denied'; END IF;
  INSERT INTO public.evaluation_candidate_masks (organization_id, candidate_id, masked_label, created_by_identity_id, updated_by_identity_id)
    SELECT ec.organization_id, ec.id, 'Candidate-' || substr(md5(ec.id::text),1,8), context.actor_identity_id, context.actor_identity_id FROM public.evaluation_candidates AS ec WHERE ec.organization_id=v_organization_id AND ec.intake_id=v_intake_id AND ec.source='initial' AND ec.state <> 'archived' ON CONFLICT (organization_id,candidate_id) DO NOTHING;
  SELECT jsonb_agg(jsonb_build_object('candidateId',ec.id,'maskedLabel',m.masked_label,'state',ec.state,'eligibility',ec.eligibility,'deterministicScore',ec.deterministic_score,'limitations',coalesce(ec.limitations,'[]'::jsonb),'evidenceFreshAt',ec.evidence_fresh_at) ORDER BY ec.id) INTO v_snapshot FROM public.evaluation_candidates AS ec JOIN public.evaluation_candidate_masks AS m ON m.organization_id=ec.organization_id AND m.candidate_id=ec.id WHERE ec.organization_id=v_organization_id AND ec.intake_id=v_intake_id AND ec.source='initial' AND ec.state <> 'archived' AND m.state='masked';
  IF v_snapshot IS NULL OR jsonb_array_length(v_snapshot) <> v_candidate_count THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Initial masking denied'; END IF;
  INSERT INTO public.evaluation_assessments (id, organization_id, intake_id, candidate_snapshot, created_by_identity_id, correlation_id) VALUES (v_assessment_id,v_organization_id,v_intake_id,v_snapshot,context.actor_identity_id,correlation_id);
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r3.initial.evaluation.create','initial.evaluation.create','evaluation_assessment',v_assessment_id,v_organization_id,'Create initial evaluation',correlation_id,idempotency_key,payload,jsonb_build_object('version',1),jsonb_build_object('version',1,'state','completed'),context.authorization_time);
  RETURN jsonb_build_object('assessmentId',v_assessment_id,'organizationId',v_organization_id,'intakeId',v_intake_id,'state','masked','candidateCount',v_candidate_count,'outcomeCode','created','correlationId',correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_create_initial_evaluation(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_create_initial_evaluation(jsonb,uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_create_initial_evaluation(jsonb,uuid,uuid) IS 'R3 initial organization-scoped masked evaluation snapshot capped at five initial candidates.';
