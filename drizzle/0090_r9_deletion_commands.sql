-- R9 audited deletion request and reviewer-decision commands.
ALTER TABLE public.deletion_requests
  ADD COLUMN IF NOT EXISTS requested_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.mmhr_record_deletion(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  context record;
  receipt jsonb;
  request public.deletion_requests%ROWTYPE;
  v_action text;
  v_id uuid;
  v_org uuid;
  v_actor uuid;
  v_status text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'action','') NOT IN ('create','decide')
    OR coalesce(payload->>'requestId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid deletion input'; END IF;
  v_action := payload->>'action';
  v_id := (payload->>'requestId')::uuid;
  v_org := (payload->>'organizationId')::uuid;
  v_actor := (payload->>'actorIdentityId')::uuid;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access',v_org,'Record deletion request',correlation_id,idempotency_key);
  IF context.actor_identity_id <> v_actor THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'r9.deletion.' || v_action,idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO request FROM public.deletion_requests WHERE id=v_id AND organization_id=v_org;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Deletion replay denied'; END IF;
    RETURN jsonb_build_object('requestId',request.id,'organizationId',request.organization_id,'status',request.status,'outcomeCode','replayed','correlationId',correlation_id);
  END IF;
  IF v_action = 'create' THEN
    IF coalesce(payload->>'subjectId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'requestedAt','') = '' OR coalesce(payload->>'dueAt','') = ''
      OR coalesce(payload->>'legalHold','') NOT IN ('true','false') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid deletion request';
    END IF;
    INSERT INTO public.deletion_requests (id,organization_id,subject_id,requested_by_identity_id,requested_at,due_at,legal_hold,retention_until,status)
    VALUES (v_id,v_org,(payload->>'subjectId')::uuid,v_actor,(payload->>'requestedAt')::timestamptz,(payload->>'dueAt')::timestamptz,(payload->>'legalHold')::boolean,NULLIF(payload->>'retentionUntil','')::timestamptz,'requested')
    RETURNING * INTO request;
    v_status := request.status;
  ELSE
    IF coalesce(payload->>'decidedAt','') = '' OR payload->>'decision' NOT IN ('approved','held','rejected')
      OR coalesce(payload->>'auditReference','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid deletion decision';
    END IF;
    SELECT * INTO request FROM public.deletion_requests WHERE id=v_id AND organization_id=v_org FOR UPDATE;
    IF NOT FOUND OR request.status <> 'requested' OR request.requested_by_identity_id = v_actor THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Deletion decision denied';
    END IF;
    INSERT INTO public.deletion_decisions (organization_id,request_id,decided_at,decision,audit_reference)
    VALUES (v_org,v_id,(payload->>'decidedAt')::timestamptz,payload->>'decision',payload->>'auditReference');
    UPDATE public.deletion_requests SET status=payload->>'decision' WHERE id=v_id AND organization_id=v_org RETURNING * INTO request;
    v_status := request.status;
  END IF;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r9.deletion.' || v_action,'deletion.' || v_action,'deletion_request',request.id,v_org,'Record deletion request',correlation_id,idempotency_key,payload,CASE WHEN v_action='create' THEN NULL ELSE jsonb_build_object('state','pending') END,jsonb_build_object('state',CASE WHEN v_status='held' OR v_status='requested' THEN 'pending' ELSE v_status END),context.authorization_time);
  RETURN jsonb_build_object('requestId',request.id,'organizationId',request.organization_id,'status',request.status,'outcomeCode','recorded','correlationId',correlation_id);
END; $$;

REVOKE ALL ON FUNCTION public.mmhr_record_deletion(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_deletion(jsonb,uuid,uuid) TO authenticated;
