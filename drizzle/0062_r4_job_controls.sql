-- R4 durable job enqueue, attempt, retry, and manual-rerun controls.

CREATE OR REPLACE FUNCTION public.mmhr_record_workflow_job(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; receipt jsonb; job public.workflow_jobs%ROWTYPE; attempt public.workflow_job_attempts%ROWTYPE; v_action text; v_id uuid; v_org uuid; v_actor uuid; v_type text; v_refs jsonb; v_max integer; v_state text; v_failure jsonb; v_attempt_number integer;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR coalesce(payload->>'action','') NOT IN ('enqueue','claim','complete','fail','rerun') OR correlation_id IS NULL OR idempotency_key IS NULL OR coalesce(payload->>'jobId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid job input'; END IF;
  v_action := payload->>'action'; v_id := (payload->>'jobId')::uuid; v_org := (payload->>'organizationId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_type := payload->>'jobType'; v_refs := payload->'payloadReferences'; v_max := coalesce((payload->>'maximumAttempts')::integer,3); v_failure := payload->'failure';
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Record workflow job', correlation_id, idempotency_key); IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.job.control', idempotency_key, payload); IF receipt IS NOT NULL THEN SELECT * INTO job FROM public.workflow_jobs j WHERE j.id = (receipt->>'entity_id')::uuid AND j.organization_id = v_org; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('jobId', job.id, 'organizationId', job.organization_id, 'state', job.state, 'attemptsInCycle', job.attempts_in_cycle, 'rerunCount', job.rerun_count, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  IF v_action = 'enqueue' THEN
    IF v_type NOT IN ('rfp_distribution','inbound_email','document_scan','content_acquisition','communication_delivery') OR v_refs IS NULL OR jsonb_typeof(v_refs) <> 'array' OR jsonb_array_length(v_refs) > 50 OR v_max NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid job enqueue'; END IF;
    INSERT INTO public.workflow_jobs(id, organization_id, job_type, correlation_id, idempotency_key, payload_references, maximum_attempts, state, created_by_identity_id) VALUES (v_id, v_org, v_type, correlation_id, idempotency_key, v_refs, v_max, 'queued', v_actor) RETURNING * INTO job;
  ELSE
    SELECT * INTO job FROM public.workflow_jobs WHERE id = v_id AND organization_id = v_org FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Job association denied'; END IF;
    IF v_action = 'claim' THEN
      IF job.state NOT IN ('queued','scheduled','retry_pending') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Job claim denied'; END IF;
      UPDATE public.workflow_jobs SET state='running', attempts_in_cycle=attempts_in_cycle+1, updated_at=clock_timestamp() WHERE id=v_id AND organization_id=v_org RETURNING * INTO job;
      v_attempt_number := job.attempts_in_cycle; INSERT INTO public.workflow_job_attempts(organization_id,job_id,attempt_number,correlation_id,trigger,requested_by,started_at,outcome) VALUES (v_org,v_id,v_attempt_number,correlation_id,'automatic',v_actor::text,clock_timestamp(),'running') RETURNING * INTO attempt;
    ELSIF v_action = 'complete' THEN
      IF job.state <> 'running' THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Job completion denied'; END IF;
      UPDATE public.workflow_jobs SET state='succeeded', updated_at=clock_timestamp() WHERE id=v_id AND organization_id=v_org RETURNING * INTO job; UPDATE public.workflow_job_attempts SET outcome='succeeded', finished_at=clock_timestamp() WHERE id=(SELECT a.id FROM public.workflow_job_attempts a WHERE a.organization_id=v_org AND a.job_id=v_id AND a.outcome='running' ORDER BY a.started_at DESC LIMIT 1);
    ELSIF v_action = 'fail' THEN
      IF job.state <> 'running' OR v_failure IS NULL OR jsonb_typeof(v_failure) <> 'object' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid job failure'; END IF;
      UPDATE public.workflow_jobs SET state=CASE WHEN attempts_in_cycle >= maximum_attempts THEN 'needs_attention' ELSE 'retry_pending' END, next_attempt_at=CASE WHEN attempts_in_cycle >= maximum_attempts THEN NULL ELSE clock_timestamp()+interval '5 minutes' END, last_failure=jsonb_build_object('code',coalesce(v_failure->>'code','unknown')), updated_at=clock_timestamp() WHERE id=v_id AND organization_id=v_org RETURNING * INTO job; UPDATE public.workflow_job_attempts SET outcome='failed', finished_at=clock_timestamp(), failure=jsonb_build_object('code',coalesce(v_failure->>'code','unknown')) WHERE id=(SELECT a.id FROM public.workflow_job_attempts a WHERE a.organization_id=v_org AND a.job_id=v_id AND a.outcome='running' ORDER BY a.started_at DESC LIMIT 1);
    ELSE
      IF job.state NOT IN ('failed','needs_attention','cancelled') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Job rerun denied'; END IF;
      UPDATE public.workflow_jobs SET state='queued', attempts_in_cycle=0, rerun_count=rerun_count+1, next_attempt_at=NULL, last_failure=NULL, updated_at=clock_timestamp() WHERE id=v_id AND organization_id=v_org RETURNING * INTO job;
    END IF;
  END IF;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.job.control', 'job.' || v_action, 'workflow_job', job.id, v_org, 'Record workflow job', correlation_id, idempotency_key, payload, jsonb_build_object('status','completed'), jsonb_build_object('status','completed'), context.authorization_time);
  RETURN jsonb_build_object('jobId',job.id,'organizationId',job.organization_id,'state',job.state,'attemptsInCycle',job.attempts_in_cycle,'rerunCount',job.rerun_count,'outcomeCode','recorded','correlationId',correlation_id);
END;
$$;
REVOKE ALL ON FUNCTION public.mmhr_record_workflow_job(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_workflow_job(jsonb, uuid, uuid) TO authenticated;
