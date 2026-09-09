ALTER TABLE "matching_runs" ADD COLUMN "vendor_input_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "matching_runs" ADD CONSTRAINT "matching_runs_vendor_inputs_ck" CHECK (jsonb_typeof("matching_runs"."vendor_input_snapshot") = 'array' and jsonb_array_length("matching_runs"."vendor_input_snapshot") <= 100 and pg_column_size("matching_runs"."vendor_input_snapshot") <= 4000000);
--> statement-breakpoint
-- Legacy runs keep their empty evidence field. Do not invent historical proof.
COMMENT ON COLUMN public.matching_runs.vendor_input_snapshot IS
  'Private approved inputs used by this run. Empty on legacy runs; never a customer read field.';
--> statement-breakpoint
CREATE TRIGGER matching_runs_append_only BEFORE UPDATE OR DELETE ON public.matching_runs
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint
CREATE TRIGGER matching_runs_append_only_truncate BEFORE TRUNCATE ON public.matching_runs
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint

-- Preserve the existing command/receipt contract and formula. Resolve approved
-- evidence once per candidate, then use that exact private snapshot for every
-- calculation and explanation. A published flag alone is no longer sufficient.
CREATE OR REPLACE FUNCTION public.mmhr_run_deterministic_matching(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  intake public.intakes%ROWTYPE;
  rule_set public.matching_rule_sets%ROWTYPE;
  candidate public.evaluation_candidates%ROWTYPE;
  run_id uuid := gen_random_uuid();
  receipt jsonb;
  v_organization_id uuid;
  v_intake_id uuid;
  v_actor_id uuid;
  v_rule_version integer;
  candidate_count integer := 0;
  total_weight integer;
  matched_weight integer;
  score integer;
  must_missing boolean;
  v_reasons jsonb;
  v_limitations jsonb;
  v_evidence_fresh_at timestamptz;
  snapshot jsonb := '[]'::jsonb;
  vendor_snapshot jsonb := '[]'::jsonb;
  candidate_inputs jsonb;
  v_as_of timestamptz;
  outcome text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'ruleVersion','') !~ '^[1-9][0-9]*$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid matching input'; END IF;
  v_organization_id := (payload->>'organizationId')::uuid;
  v_intake_id := (payload->>'intakeId')::uuid;
  v_actor_id := (payload->>'actorIdentityId')::uuid;
  v_rule_version := (payload->>'ruleVersion')::integer;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', v_organization_id, 'Run deterministic matching', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied';
  END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.matching.run', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT mr.id, mr.candidate_count INTO run_id, candidate_count
      FROM public.matching_runs AS mr
      WHERE mr.id = (receipt->>'entity_id')::uuid AND mr.organization_id = v_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    outcome := 'replayed';
  ELSE
    SELECT * INTO intake FROM public.intakes AS i
      WHERE i.id = v_intake_id AND i.organization_id = v_organization_id FOR UPDATE;
    IF NOT FOUND OR intake.status NOT IN ('submitted','under_review','completed') THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Matching intake denied';
    END IF;
    SELECT * INTO rule_set FROM public.matching_rule_sets AS rs
      WHERE rs.organization_id = v_organization_id AND rs.version = v_rule_version AND rs.status = 'approved';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Matching rule denied'; END IF;
    v_as_of := clock_timestamp();
    FOR candidate IN
      SELECT ec.* FROM public.evaluation_candidates AS ec
      WHERE ec.organization_id = v_organization_id AND ec.intake_id = v_intake_id
        AND ec.state <> 'archived' ORDER BY ec.id FOR UPDATE
    LOOP
      SELECT coalesce(jsonb_agg(to_jsonb(vf) ORDER BY vf.field_key, vf.fact_id), '[]'::jsonb)
        INTO candidate_inputs
        FROM mmhr_private.r3_approved_vendor_inputs(candidate.vendor_organization_id, candidate.product_id, v_as_of) AS vf;
      vendor_snapshot := vendor_snapshot || jsonb_build_array(jsonb_build_object(
        'candidateId', candidate.id, 'asOf', v_as_of, 'inputs', candidate_inputs));
      -- Reject oversize evidence atomically. Never truncate facts or provenance.
      IF octet_length(vendor_snapshot::text) > 4000000 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Matching input evidence exceeds the supported size';
      END IF;
      SELECT coalesce(sum(ir.weight), 0)::integer INTO total_weight
        FROM public.intake_requirements AS ir
        WHERE ir.organization_id = v_organization_id AND ir.intake_id = v_intake_id
          AND ir.status = 'active' AND ir.response IS NOT NULL;
      SELECT coalesce(sum(ir.weight), 0)::integer INTO matched_weight
        FROM public.intake_requirements AS ir
        WHERE ir.organization_id = v_organization_id AND ir.intake_id = v_intake_id
          AND ir.status = 'active' AND ir.response IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(candidate_inputs) AS vf
            WHERE vf->>'field_key' = ir.stable_key
              AND lower(btrim(vf->>'value')) = lower(btrim(ir.response #>> '{}')));
      SELECT bool_or(ir.importance = 'must' AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(candidate_inputs) AS vf
          WHERE vf->>'field_key' = ir.stable_key
            AND lower(btrim(vf->>'value')) = lower(btrim(ir.response #>> '{}'))))
        INTO must_missing FROM public.intake_requirements AS ir
        WHERE ir.organization_id = v_organization_id AND ir.intake_id = v_intake_id
          AND ir.status = 'active' AND ir.response IS NOT NULL;
      SELECT jsonb_agg(ir.stable_key ORDER BY ir.stable_key) FILTER (WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements(candidate_inputs) AS vf
          WHERE vf->>'field_key' = ir.stable_key
            AND lower(btrim(vf->>'value')) = lower(btrim(ir.response #>> '{}')))),
        jsonb_agg(ir.stable_key ORDER BY ir.stable_key) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(candidate_inputs) AS vf
          WHERE vf->>'field_key' = ir.stable_key
            AND lower(btrim(vf->>'value')) = lower(btrim(ir.response #>> '{}'))))
        INTO v_reasons, v_limitations FROM public.intake_requirements AS ir
        WHERE ir.organization_id = v_organization_id AND ir.intake_id = v_intake_id
          AND ir.status = 'active' AND ir.response IS NOT NULL;
      SELECT min((vf->>'captured_at')::timestamptz) INTO v_evidence_fresh_at
        FROM jsonb_array_elements(candidate_inputs) AS vf;
      score := CASE WHEN total_weight = 0 THEN 0
        ELSE round((matched_weight::numeric / total_weight::numeric) * 10000)::integer END;
      UPDATE public.evaluation_candidates AS ec SET
        eligibility = CASE WHEN total_weight = 0 THEN 'unknown'
          WHEN coalesce(must_missing, false) THEN 'ineligible' ELSE 'eligible' END,
        deterministic_score = score, scoring_configuration_version = v_rule_version,
        fit_reasons = coalesce(v_reasons, '[]'::jsonb), limitations = coalesce(v_limitations, '[]'::jsonb),
        evidence_fresh_at = v_evidence_fresh_at, revision = ec.revision + 1,
        updated_by_identity_id = context.actor_identity_id, updated_at = clock_timestamp()
        WHERE ec.id = candidate.id AND ec.organization_id = v_organization_id;
      candidate_count := candidate_count + 1;
      snapshot := snapshot || jsonb_build_array(jsonb_build_object(
        'candidateId', candidate.id,
        'eligibility', CASE WHEN total_weight = 0 THEN 'unknown'
          WHEN coalesce(must_missing, false) THEN 'ineligible' ELSE 'eligible' END,
        'deterministicScore', score, 'scoringConfigurationVersion', v_rule_version,
        'fitReasons', coalesce(v_reasons, '[]'::jsonb), 'limitations', coalesce(v_limitations, '[]'::jsonb),
        'evidenceFreshAt', v_evidence_fresh_at));
    END LOOP;
    INSERT INTO public.matching_runs (
      id, organization_id, intake_id, rule_set_id, rule_version, candidate_count,
      candidate_snapshot, vendor_input_snapshot, created_by_identity_id, correlation_id
    ) VALUES (
      run_id, v_organization_id, v_intake_id, rule_set.id, v_rule_version, candidate_count,
      snapshot, vendor_snapshot, context.actor_identity_id, correlation_id);
    PERFORM mmhr_private.r1_finish_security_command(
      context.actor_identity_id, 'r3.matching.run', 'matching.run', 'matching_run', run_id,
      v_organization_id, 'Run deterministic matching', correlation_id, idempotency_key, payload,
      jsonb_build_object('version', v_rule_version),
      jsonb_build_object('version', v_rule_version, 'state', 'completed'), context.authorization_time);
    outcome := 'computed';
  END IF;
  RETURN jsonb_build_object(
    'matchingRunId', run_id, 'organizationId', v_organization_id, 'intakeId', v_intake_id,
    'ruleVersion', v_rule_version, 'candidateCount', candidate_count,
    'outcomeCode', outcome, 'correlationId', correlation_id);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_run_deterministic_matching(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_run_deterministic_matching(jsonb,uuid,uuid) TO authenticated;
