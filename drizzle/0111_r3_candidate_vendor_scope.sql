-- Separate the customer's intake scope from the product owner's scope.
-- The old FK proves every existing candidate has a matching same-org product.
-- Keep that FK until the new relation is backfilled and validated. Preserve all
-- existing IDs, revisions, timestamps, masks, scorecards, audits and receipts.
ALTER TABLE public.evaluation_candidates ADD COLUMN vendor_organization_id uuid;
--> statement-breakpoint
UPDATE public.evaluation_candidates AS candidate
SET vendor_organization_id = product.organization_id
FROM public.products AS product
WHERE product.id = candidate.product_id;
--> statement-breakpoint
ALTER TABLE public.evaluation_candidates ALTER COLUMN vendor_organization_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.evaluation_candidates
  ADD CONSTRAINT evaluation_candidates_product_vendor_scope_fk
  FOREIGN KEY (vendor_organization_id, product_id)
  REFERENCES public.products (organization_id, id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE public.evaluation_candidates DROP CONSTRAINT evaluation_candidates_product_scope_fk;
--> statement-breakpoint
COMMENT ON COLUMN public.evaluation_candidates.vendor_organization_id IS
  'Private product-owner join. Organization_id remains the customer authorization scope.';
--> statement-breakpoint
-- Preserve the legacy input, receipt namespace, output and same-org restriction.
-- Customer masked selection must resolve an approved publication in a new command.
CREATE OR REPLACE FUNCTION public.mmhr_add_evaluation_candidate(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  intake public.intakes%ROWTYPE;
  candidate public.evaluation_candidates%ROWTYPE;
  candidate_id uuid := gen_random_uuid();
  organization_id uuid;
  intake_id uuid;
  product_id uuid;
  actor_id uuid;
  source text;
  receipt jsonb;
  initial_count integer;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'productId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'source','') NOT IN ('initial','review_addition')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid candidate add input'; END IF;
  organization_id := (payload->>'organizationId')::uuid;
  intake_id := (payload->>'intakeId')::uuid;
  product_id := (payload->>'productId')::uuid;
  actor_id := (payload->>'actorIdentityId')::uuid;
  source := payload->>'source';

  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', organization_id, 'Add evaluation candidate', correlation_id, idempotency_key);
  IF actor_id <> context.actor_identity_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.candidate.add', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO candidate FROM public.evaluation_candidates AS ec
    WHERE ec.id = (receipt->>'entity_id')::uuid AND ec.organization_id = organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    RETURN mmhr_private.r3_candidate_add_result(candidate.id, candidate.organization_id, candidate.intake_id,
      candidate.product_id, candidate.source, candidate.state, candidate.revision, 'replayed', correlation_id);
  END IF;

  SELECT * INTO intake FROM public.intakes AS i
  WHERE i.id = intake_id AND i.organization_id = organization_id FOR UPDATE;
  IF NOT FOUND OR intake.status = 'archived' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Candidate scope denied';
  END IF;
  IF source = 'review_addition' AND intake.status NOT IN ('under_review', 'completed') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Candidate addition requires review';
  END IF;
  SELECT count(*)::integer INTO initial_count FROM public.evaluation_candidates AS ec
  WHERE ec.organization_id = organization_id AND ec.intake_id = intake_id AND ec.source = 'initial';
  IF source = 'initial' AND initial_count >= 5 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Initial candidate limit reached';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products AS p WHERE p.id = product_id AND p.organization_id = organization_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Candidate scope denied';
  END IF;
  INSERT INTO public.evaluation_candidates (
    id, organization_id, intake_id, product_id, vendor_organization_id, source, created_by_identity_id, updated_by_identity_id
  ) VALUES (
    candidate_id, organization_id, intake_id, product_id, organization_id, source,
    context.actor_identity_id, context.actor_identity_id
  ) RETURNING * INTO candidate;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'r3.candidate.add', 'candidate.add',
    'evaluation_candidate', candidate.id, organization_id, 'Add evaluation candidate',
    correlation_id, idempotency_key, payload, jsonb_build_object('version', 1),
    jsonb_build_object('version', 1), context.authorization_time);
  RETURN mmhr_private.r3_candidate_add_result(candidate.id, organization_id, intake_id, product_id,
    source, candidate.state, candidate.revision, 'created', correlation_id);
END
$$;

REVOKE ALL ON FUNCTION public.mmhr_add_evaluation_candidate(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_add_evaluation_candidate(jsonb,uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_add_evaluation_candidate(jsonb,uuid,uuid)
  IS 'R3 organization-scoped candidate creation with an initial five-candidate cap.';
--> statement-breakpoint
-- Requirements, rules, runs and authorization stay customer-scoped. Only the
-- approved vendor fact lookup follows the stored product-owner relationship.
CREATE OR REPLACE FUNCTION public.mmhr_run_deterministic_matching(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; intake public.intakes%ROWTYPE; rule_set public.matching_rule_sets%ROWTYPE;
  candidate public.evaluation_candidates%ROWTYPE; run_id uuid := gen_random_uuid(); receipt jsonb;
  v_organization_id uuid; v_intake_id uuid; v_actor_id uuid; v_rule_version integer;
  candidate_count integer := 0; total_weight integer; matched_weight integer; score integer;
  must_missing boolean; v_reasons jsonb; v_limitations jsonb; v_evidence_fresh_at timestamptz;
  snapshot jsonb := '[]'::jsonb; outcome text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'ruleVersion','') !~ '^[1-9][0-9]*$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid matching input'; END IF;
  v_organization_id := (payload->>'organizationId')::uuid; v_intake_id := (payload->>'intakeId')::uuid;
  v_actor_id := (payload->>'actorIdentityId')::uuid; v_rule_version := (payload->>'ruleVersion')::integer;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Run deterministic matching', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.matching.run', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT mr.id, mr.candidate_count INTO run_id, candidate_count FROM public.matching_runs AS mr
      WHERE mr.id = (receipt->>'entity_id')::uuid AND mr.organization_id = v_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    outcome := 'replayed';
  ELSE
    SELECT * INTO intake FROM public.intakes AS i WHERE i.id = v_intake_id AND i.organization_id = v_organization_id FOR UPDATE;
    IF NOT FOUND OR intake.status NOT IN ('submitted','under_review','completed') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Matching intake denied'; END IF;
    SELECT * INTO rule_set FROM public.matching_rule_sets AS rs WHERE rs.organization_id = v_organization_id AND rs.version = v_rule_version AND rs.status = 'approved';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Matching rule denied'; END IF;
    FOR candidate IN SELECT ec.* FROM public.evaluation_candidates AS ec WHERE ec.organization_id = v_organization_id AND ec.intake_id = v_intake_id AND ec.state <> 'archived' ORDER BY ec.id FOR UPDATE LOOP
      total_weight := 0; matched_weight := 0; must_missing := false; v_reasons := '[]'::jsonb; v_limitations := '[]'::jsonb; v_evidence_fresh_at := NULL;
      SELECT coalesce(sum(ir.weight),0)::integer INTO total_weight FROM public.intake_requirements AS ir WHERE ir.organization_id=v_organization_id AND ir.intake_id=v_intake_id AND ir.status='active' AND ir.response IS NOT NULL;
      SELECT coalesce(sum(ir.weight),0)::integer INTO matched_weight FROM public.intake_requirements AS ir WHERE ir.organization_id=v_organization_id AND ir.intake_id=v_intake_id AND ir.status='active' AND ir.response IS NOT NULL AND EXISTS (SELECT 1 FROM public.vendor_facts AS vf WHERE vf.organization_id=candidate.vendor_organization_id AND vf.product_id=candidate.product_id AND vf.field_key=ir.stable_key AND vf.status='published' AND lower(btrim(vf.value)) = lower(btrim(ir.response #>> '{}')));
      SELECT bool_or(ir.importance='must' AND NOT EXISTS (SELECT 1 FROM public.vendor_facts AS vf WHERE vf.organization_id=candidate.vendor_organization_id AND vf.product_id=candidate.product_id AND vf.field_key=ir.stable_key AND vf.status='published' AND lower(btrim(vf.value)) = lower(btrim(ir.response #>> '{}')))) INTO must_missing FROM public.intake_requirements AS ir WHERE ir.organization_id=v_organization_id AND ir.intake_id=v_intake_id AND ir.status='active' AND ir.response IS NOT NULL;
      SELECT jsonb_agg(ir.stable_key ORDER BY ir.stable_key) FILTER (WHERE EXISTS (SELECT 1 FROM public.vendor_facts AS vf WHERE vf.organization_id=candidate.vendor_organization_id AND vf.product_id=candidate.product_id AND vf.field_key=ir.stable_key AND vf.status='published' AND lower(btrim(vf.value)) = lower(btrim(ir.response #>> '{}')))), jsonb_agg(ir.stable_key ORDER BY ir.stable_key) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.vendor_facts AS vf WHERE vf.organization_id=candidate.vendor_organization_id AND vf.product_id=candidate.product_id AND vf.field_key=ir.stable_key AND vf.status='published' AND lower(btrim(vf.value)) = lower(btrim(ir.response #>> '{}')))) INTO v_reasons, v_limitations FROM public.intake_requirements AS ir WHERE ir.organization_id=v_organization_id AND ir.intake_id=v_intake_id AND ir.status='active' AND ir.response IS NOT NULL;
      SELECT max(vf.observed_at) INTO v_evidence_fresh_at FROM public.vendor_facts AS vf WHERE vf.organization_id=candidate.vendor_organization_id AND vf.product_id=candidate.product_id AND vf.status='published';
      score := CASE WHEN total_weight = 0 THEN 0 ELSE round((matched_weight::numeric / total_weight::numeric) * 10000)::integer END;
      UPDATE public.evaluation_candidates AS ec SET eligibility=CASE WHEN total_weight=0 THEN 'unknown' WHEN coalesce(must_missing,false) THEN 'ineligible' ELSE 'eligible' END, deterministic_score=score, scoring_configuration_version=v_rule_version, fit_reasons=coalesce(v_reasons,'[]'::jsonb), limitations=coalesce(v_limitations,'[]'::jsonb), evidence_fresh_at=v_evidence_fresh_at, revision=ec.revision+1, updated_by_identity_id=context.actor_identity_id, updated_at=clock_timestamp() WHERE ec.id=candidate.id AND ec.organization_id=v_organization_id;
      candidate_count := candidate_count + 1;
      snapshot := snapshot || jsonb_build_array(jsonb_build_object('candidateId',candidate.id,'eligibility',CASE WHEN total_weight=0 THEN 'unknown' WHEN coalesce(must_missing,false) THEN 'ineligible' ELSE 'eligible' END,'deterministicScore',score,'scoringConfigurationVersion',v_rule_version,'fitReasons',coalesce(v_reasons,'[]'::jsonb),'limitations',coalesce(v_limitations,'[]'::jsonb),'evidenceFreshAt',v_evidence_fresh_at));
    END LOOP;
    INSERT INTO public.matching_runs (id, organization_id, intake_id, rule_set_id, rule_version, candidate_count, candidate_snapshot, created_by_identity_id, correlation_id) VALUES (run_id, v_organization_id, v_intake_id, rule_set.id, v_rule_version, candidate_count, snapshot, context.actor_identity_id, correlation_id);
    PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r3.matching.run', 'matching.run', 'matching_run', run_id, v_organization_id, 'Run deterministic matching', correlation_id, idempotency_key, payload, jsonb_build_object('version',v_rule_version), jsonb_build_object('version',v_rule_version,'state','completed'), context.authorization_time);
    outcome := 'computed';
  END IF;
  RETURN jsonb_build_object('matchingRunId', run_id, 'organizationId', v_organization_id, 'intakeId', v_intake_id, 'ruleVersion', v_rule_version, 'candidateCount', candidate_count, 'outcomeCode', outcome, 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_run_deterministic_matching(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_run_deterministic_matching(jsonb,uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_run_deterministic_matching(jsonb,uuid,uuid) IS 'R3 approved-rule deterministic matching with evidence-backed explanations and commercial-independent scoring.';
