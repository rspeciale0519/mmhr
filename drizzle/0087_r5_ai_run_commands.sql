-- R5 audited AI run recording and human approval.
-- Raw prompts and provider payloads remain outside the database.
ALTER TABLE public.ai_runs
  ADD COLUMN created_by_identity_id uuid
    REFERENCES public.identities(id) ON DELETE RESTRICT;

CREATE INDEX ai_runs_created_by_idx ON public.ai_runs (created_by_identity_id);

CREATE OR REPLACE FUNCTION public.mmhr_record_ai_run(
  payload jsonb,
  correlation_id uuid,
  idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  context record;
  receipt jsonb;
  run public.ai_runs%ROWTYPE;
  v_action text;
  v_run_id text;
  v_org uuid;
  v_actor uuid;
  v_decision text;
  v_revision integer;
  v_correlation_id uuid := correlation_id;
  v_idempotency_key uuid := idempotency_key;
BEGIN
  IF jsonb_typeof(payload) <> 'object'
    OR v_correlation_id IS NULL
    OR v_idempotency_key IS NULL
    OR coalesce(payload->>'action', '') NOT IN ('create', 'decide')
    OR coalesce(payload->>'runId', '') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
    OR coalesce(payload->>'organizationId', '') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId', '') !~ '^[0-9a-fA-F-]{36}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid AI run input';
  END IF;

  v_action := payload->>'action';
  v_run_id := payload->>'runId';
  v_org := (payload->>'organizationId')::uuid;
  v_actor := (payload->>'actorIdentityId')::uuid;

  SELECT * INTO context
  FROM mmhr_private.r1_start_security_command(
    'workspace.access', v_org, 'Record AI run', v_correlation_id, v_idempotency_key
  );
  IF context.actor_identity_id <> v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;

  receipt := mmhr_private.r1_checked_receipt(
    context.actor_identity_id, 'r5.ai_run.' || v_action, v_idempotency_key, payload
  );
  IF receipt IS NOT NULL THEN
    SELECT * INTO run
    FROM public.ai_runs
    WHERE run_id = v_run_id AND organization_id = v_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI run replay denied';
    END IF;
    RETURN jsonb_build_object(
      'runId', run.run_id,
      'organizationId', run.organization_id,
      'status', run.status,
      'revision', run.revision,
      'outcomeCode', 'replayed',
      'correlationId', v_correlation_id
    );
  END IF;

  IF v_action = 'create' THEN
    IF coalesce(payload->>'capability', '') NOT IN
      ('draft', 'summarize', 'extract_vendor_evidence', 'normalize_response', 'suggest_follow_up', 'identify_risk')
      OR coalesce(payload->>'dataClass', '') NOT IN ('public', 'internal', 'confidential', 'restricted')
      OR coalesce(payload->>'adapterId', '') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
      OR coalesce(payload->>'modelId', '') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
      OR coalesce(payload->>'templateVersion', '') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
      OR coalesce(payload->>'schemaVersion', '') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
      OR jsonb_typeof(payload->'inputArtifacts') <> 'array'
      OR jsonb_array_length(payload->'inputArtifacts') > 100
      OR jsonb_typeof(payload->'sourceReferences') <> 'array'
      OR jsonb_array_length(payload->'sourceReferences') > 100
      OR coalesce(payload->>'status', '') NOT IN ('queued', 'running', 'validating', 'review_required', 'failed')
      OR coalesce(payload->'review'->>'decision', 'pending') <> 'pending'
      OR coalesce(payload->>'createdAt', '') = ''
      OR jsonb_typeof(payload->'usage') <> 'object'
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid AI run create';
    END IF;

    INSERT INTO public.ai_runs (
      run_id, organization_id, created_by_identity_id, capability, data_class,
      adapter_id, model_id, template_version, schema_version, input_artifacts,
      output_artifact, output_hash, source_references, input_tokens, output_tokens,
      total_tokens, cost_cents, latency_ms, status, failure_code, failure_retryable,
      review_decision, reviewer_id, approval_reference, decided_at, review_reason,
      created_at, completed_at, revision, correlation_id
    ) VALUES (
      v_run_id, v_org, v_actor, payload->>'capability', payload->>'dataClass',
      payload->>'adapterId', payload->>'modelId', payload->>'templateVersion',
      payload->>'schemaVersion', payload->'inputArtifacts', payload->'outputArtifact',
      NULLIF(payload->>'outputHash', '') , payload->'sourceReferences',
      NULLIF(payload->'usage'->>'inputTokens', '')::integer,
      NULLIF(payload->'usage'->>'outputTokens', '')::integer,
      NULLIF(payload->'usage'->>'totalTokens', '')::integer,
      coalesce(NULLIF(payload->'usage'->>'costCents', '')::integer, 0),
      coalesce(NULLIF(payload->'usage'->>'latencyMs', '')::integer, 0),
      payload->>'status', NULLIF(payload->'failure'->>'code', ''),
      NULLIF(payload->'failure'->>'retryable', '')::boolean,
      'pending', NULL, NULL, NULL, NULL,
      (payload->>'createdAt')::timestamptz,
      NULLIF(payload->>'completedAt', '')::timestamptz,
      1, v_correlation_id
    ) RETURNING * INTO run;

    INSERT INTO public.ai_run_history (
      run_id, organization_id, revision, status, review_decision, correlation_id
    ) VALUES (run.run_id, run.organization_id, run.revision, run.status, 'pending', v_correlation_id);
  ELSE
    v_decision := payload->>'decision';
    IF v_decision NOT IN ('approved', 'rejected')
      OR coalesce(payload->>'approvalReference', '') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
      OR coalesce(payload->>'decidedAt', '') = ''
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid AI run decision';
    END IF;

    SELECT * INTO run
    FROM public.ai_runs
    WHERE run_id = v_run_id AND organization_id = v_org
    FOR UPDATE;
    IF NOT FOUND OR run.status <> 'review_required' OR run.review_decision <> 'pending'
      OR run.created_by_identity_id = v_actor
    THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI run approval denied';
    END IF;
    v_revision := run.revision + 1;
    UPDATE public.ai_runs
    SET status = v_decision,
        review_decision = v_decision,
        reviewer_id = v_actor::text,
        approval_reference = payload->>'approvalReference',
        decided_at = (payload->>'decidedAt')::timestamptz,
        review_reason = NULLIF(payload->>'reason', ''),
        revision = v_revision,
        correlation_id = v_correlation_id
    WHERE run_id = v_run_id AND organization_id = v_org
    RETURNING * INTO run;
    INSERT INTO public.ai_run_history (
      run_id, organization_id, revision, status, review_decision, reviewer_id,
      approval_reference, decided_at, correlation_id
    ) VALUES (
      run.run_id, run.organization_id, run.revision, run.status, run.review_decision,
      run.reviewer_id, run.approval_reference, run.decided_at, v_correlation_id
    );
  END IF;

  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'r5.ai_run.' || v_action, 'ai_run.' || v_action, 'ai_run',
    v_correlation_id, v_org, 'Record AI run', v_correlation_id, v_idempotency_key, payload,
    jsonb_build_object('state', 'active', 'version', run.revision),
    jsonb_build_object('state', 'active', 'version', run.revision),
    context.authorization_time
  );
  RETURN jsonb_build_object(
    'runId', run.run_id,
    'organizationId', run.organization_id,
    'status', run.status,
    'revision', run.revision,
    'outcomeCode', 'recorded',
    'correlationId', v_correlation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mmhr_record_ai_run(jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_ai_run(jsonb, uuid, uuid) TO authenticated;
