-- R5 immutable provider-evaluation records. Reports contain hashes and counts only.
CREATE TABLE public.ai_evaluation_runs (
  evaluation_id uuid PRIMARY KEY,
  capability text NOT NULL,
  data_class text NOT NULL,
  adapter_id text NOT NULL,
  model_id text NOT NULL,
  schema_version text NOT NULL,
  fixture_set_version text NOT NULL,
  fixture_count integer NOT NULL,
  passed boolean NOT NULL,
  report_hash text NOT NULL,
  status text NOT NULL,
  created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  reviewed_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  approval_reference text,
  reviewed_at timestamptz,
  review_reason text,
  evaluated_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL,
  CONSTRAINT ai_evaluation_runs_capability_ck CHECK (capability IN ('draft','summarize','extract_vendor_evidence','normalize_response','suggest_follow_up','identify_risk')),
  CONSTRAINT ai_evaluation_runs_data_class_ck CHECK (data_class IN ('public','internal','confidential','restricted')),
  CONSTRAINT ai_evaluation_runs_identifier_ck CHECK (adapter_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' AND model_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' AND schema_version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' AND fixture_set_version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'),
  CONSTRAINT ai_evaluation_runs_fixture_count_ck CHECK (fixture_count BETWEEN 1 AND 1000),
  CONSTRAINT ai_evaluation_runs_hash_ck CHECK (report_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT ai_evaluation_runs_status_ck CHECK (status IN ('pending','approved','rejected','failed')),
  CONSTRAINT ai_evaluation_runs_approval_ck CHECK ((status IN ('pending','failed') AND reviewed_by_identity_id IS NULL AND approval_reference IS NULL AND reviewed_at IS NULL) OR (status IN ('approved','rejected') AND reviewed_by_identity_id IS NOT NULL AND approval_reference IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT ai_evaluation_runs_revision_ck CHECK (revision > 0)
);
CREATE INDEX ai_evaluation_runs_adapter_idx ON public.ai_evaluation_runs (adapter_id, model_id, evaluated_at);
ALTER TABLE public.ai_evaluation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY r5_deny_anon_authenticated_ai_evaluation_runs ON public.ai_evaluation_runs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.ai_evaluation_runs FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

CREATE OR REPLACE FUNCTION public.mmhr_record_ai_evaluation(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  context record;
  receipt jsonb;
  evaluation public.ai_evaluation_runs%ROWTYPE;
  v_action text;
  v_id uuid;
  v_actor uuid;
  v_correlation_id uuid := correlation_id;
  v_idempotency_key uuid := idempotency_key;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR v_correlation_id IS NULL OR v_idempotency_key IS NULL
    OR coalesce(payload->>'action','') NOT IN ('record','decide')
    OR coalesce(payload->>'evaluationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid AI evaluation input'; END IF;
  v_action := payload->>'action'; v_id := (payload->>'evaluationId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('admin.access', NULL::uuid, 'Record AI evaluation', v_correlation_id, v_idempotency_key);
  IF context.actor_identity_id <> v_actor THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r5.ai.evaluation.' || v_action, v_idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO evaluation FROM public.ai_evaluation_runs WHERE evaluation_id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AI evaluation replay denied'; END IF;
    RETURN jsonb_build_object('evaluationId',evaluation.evaluation_id,'status',evaluation.status,'revision',evaluation.revision,'outcomeCode','replayed','correlationId',v_correlation_id);
  END IF;
  IF v_action = 'record' THEN
    IF coalesce(payload->>'capability','') NOT IN ('draft','summarize','extract_vendor_evidence','normalize_response','suggest_follow_up','identify_risk')
      OR coalesce(payload->>'dataClass','') NOT IN ('public','internal','confidential','restricted')
      OR coalesce(payload->>'adapterId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
      OR coalesce(payload->>'modelId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
      OR coalesce(payload->>'schemaVersion','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
      OR coalesce(payload->>'fixtureSetVersion','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
      OR coalesce(payload->>'fixtureCount','') !~ '^[1-9][0-9]{0,3}$'
      OR coalesce(payload->>'reportHash','') !~ '^[a-f0-9]{64}$'
      OR coalesce(payload->>'evaluatedAt','') = ''
      OR coalesce(payload->>'status','') NOT IN ('pending','failed')
      OR (payload->>'status' = 'pending' AND coalesce(payload->>'passed','false') <> 'true')
    THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid AI evaluation record'; END IF;
    INSERT INTO public.ai_evaluation_runs (evaluation_id,capability,data_class,adapter_id,model_id,schema_version,fixture_set_version,fixture_count,passed,report_hash,status,created_by_identity_id,evaluated_at,revision,correlation_id)
    VALUES (v_id,payload->>'capability',payload->>'dataClass',payload->>'adapterId',payload->>'modelId',payload->>'schemaVersion',payload->>'fixtureSetVersion',(payload->>'fixtureCount')::integer,(payload->>'passed')::boolean,payload->>'reportHash',payload->>'status',v_actor,(payload->>'evaluatedAt')::timestamptz,1,v_correlation_id)
    RETURNING * INTO evaluation;
  ELSE
    IF payload->>'decision' NOT IN ('approved','rejected') OR coalesce(payload->>'approvalReference','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' OR coalesce(payload->>'reviewedAt','') = '' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid AI evaluation decision';
    END IF;
    SELECT * INTO evaluation FROM public.ai_evaluation_runs WHERE evaluation_id = v_id FOR UPDATE;
    IF NOT FOUND OR evaluation.status <> 'pending' OR NOT evaluation.passed OR evaluation.created_by_identity_id = v_actor THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AI evaluation approval denied';
    END IF;
    UPDATE public.ai_evaluation_runs SET status=payload->>'decision', reviewed_by_identity_id=v_actor, approval_reference=payload->>'approvalReference', reviewed_at=(payload->>'reviewedAt')::timestamptz, review_reason=NULLIF(payload->>'reason',''), revision=evaluation.revision+1, correlation_id=v_correlation_id WHERE evaluation_id=v_id RETURNING * INTO evaluation;
  END IF;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r5.ai.evaluation.' || v_action,'ai.evaluation.' || v_action,'ai_evaluation',evaluation.evaluation_id,NULL::uuid,'Record AI evaluation',v_correlation_id,v_idempotency_key,payload,jsonb_build_object('state','active','version',evaluation.revision),jsonb_build_object('state','active','version',evaluation.revision),context.authorization_time);
  RETURN jsonb_build_object('evaluationId',evaluation.evaluation_id,'status',evaluation.status,'revision',evaluation.revision,'outcomeCode','recorded','correlationId',v_correlation_id);
END; $$;
REVOKE ALL ON FUNCTION public.mmhr_record_ai_evaluation(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_ai_evaluation(jsonb,uuid,uuid) TO authenticated;
