-- Fixed caller-bound recovery commands. No function accepts an Auth subject,
-- session, phone number, free-form call notes, or a provider operation.
CREATE FUNCTION mmhr_private.r1_start_recovery_presence_command(correlation_id uuid, idempotency_key uuid)
RETURNS TABLE(actor_identity_id uuid, auth_session_id text, authorization_time timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE claims jsonb := auth.jwt();
BEGIN
  IF NOT mmhr_private.r1_worker_uuid_is_valid(correlation_id::text)
    OR NOT mmhr_private.r1_worker_uuid_is_valid(idempotency_key::text) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input';
  END IF;
  authorization_time := mmhr_private.r1_lock_security();
  actor_identity_id := mmhr_private.r1_request_identity_id();
  IF actor_identity_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  IF NOT mmhr_private.r1_recovery_policy_is_prepared()
    OR EXISTS (SELECT 1 FROM public.identities i WHERE i.status = 'recovery_pending')
    OR (claims ->> 'exp')::numeric <= extract(epoch FROM authorization_time)
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id::text = claims ->> 'session_id'
      AND s.user_id = auth.uid() AND (s.not_after IS NULL OR s.not_after > authorization_time))
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  PERFORM mmhr_private.r1_assert_administration_capacity(authorization_time);
  auth_session_id := claims ->> 'session_id';
  RETURN NEXT;
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_end_recovery_before_dispatch(
  request_id uuid, target_state text, actor_id uuid, correlation_id uuid,
  idempotency_key uuid, checked_at timestamptz
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE request public.identity_recovery_requests%ROWTYPE; intent public.identity_admin_intents%ROWTYPE;
BEGIN
  SELECT * INTO request FROM public.identity_recovery_requests r WHERE r.id = request_id FOR UPDATE;
  IF NOT FOUND OR target_state NOT IN ('cancelled','expired') OR target_state IS NULL
    OR request.state NOT IN ('pending','approved')
    OR target_state = 'expired' AND request.expires_at > checked_at
    OR EXISTS (SELECT 1 FROM public.identity_admin_intents i WHERE i.recovery_request_id = request.id
      AND (i.state NOT IN ('pending','cancelled') OR i.attempt_count <> 0 OR i.dispatch_count <> 0))
    OR EXISTS (SELECT 1 FROM public.identity_intent_attempts a
      JOIN public.identity_admin_intents i ON i.id = a.intent_id WHERE i.recovery_request_id = request.id)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  FOR intent IN SELECT i.* FROM public.identity_admin_intents i
    WHERE i.recovery_request_id = request.id AND i.state = 'pending' FOR UPDATE
  LOOP
    UPDATE public.identity_admin_intents SET state = 'cancelled',completed_at = checked_at,updated_at = checked_at
      WHERE id = intent.id;
    INSERT INTO public.audit_events(actor_type,actor_identity_id,command,action,entity_type,entity_id,
      reason,correlation_id,idempotency_key,before_summary,after_summary,occurred_at)
    VALUES('user',actor_id,'identity.recovery.end','identity.intent.cancel','identity_intent',intent.id::text,
      'Cancel the reset before any provider dispatch',correlation_id,idempotency_key::text,
      jsonb_build_object('state','pending'),jsonb_build_object('state','cancelled'),checked_at);
  END LOOP;
  UPDATE public.identity_recovery_presence p SET state = 'cancelled',cancelled_at = checked_at,updated_at = checked_at
    WHERE p.id = request.recovery_presence_id AND p.state = 'linked' AND p.linked_request_id = request.id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  INSERT INTO public.audit_events(actor_type,actor_identity_id,command,action,entity_type,entity_id,
    reason,correlation_id,idempotency_key,before_summary,after_summary,occurred_at)
  VALUES('user',actor_id,'identity.recovery.end','identity.recovery.presence.cancel','identity_recovery_presence',
    request.recovery_presence_id::text,'Consume the cancelled or expired recovery presence',correlation_id,
    idempotency_key::text,jsonb_build_object('state','linked'),jsonb_build_object('state','cancelled'),checked_at);
  UPDATE public.identity_recovery_requests r SET state = target_state::public.recovery_request_state,
    cancelled_at = CASE WHEN target_state = 'cancelled' THEN checked_at ELSE NULL END,updated_at = checked_at
    WHERE r.id = request.id;
END
$$;--> statement-breakpoint

-- The server generates a 256-bit random reference and supplies only its SHA-256
-- digest here. The returned receipt contains no reference, token, or session.
CREATE FUNCTION public.mmhr_create_recovery_presence(reference_hash text, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; prior public.identity_recovery_presence%ROWTYPE; prior_request public.identity_recovery_requests%ROWTYPE;
  target_id uuid; input jsonb; receipt jsonb; prior_end text;
BEGIN
  IF reference_hash IS NULL OR reference_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input';
  END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_recovery_presence_command(correlation_id,idempotency_key);
  input := jsonb_build_object('reference_hash',reference_hash,'session_id',context.auth_session_id);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'identity.recovery.presence.create',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  SELECT * INTO prior FROM public.identity_recovery_presence p WHERE p.target_identity_id = context.actor_identity_id
    AND p.auth_session_id = context.auth_session_id AND p.state IN ('pending','linked') FOR UPDATE;
  IF FOUND THEN
    IF prior.state = 'linked' THEN
      SELECT * INTO prior_request FROM public.identity_recovery_requests r
        WHERE r.id = prior.linked_request_id AND r.recovery_presence_id = prior.id
          AND r.target_identity_id = context.actor_identity_id AND r.created_at = prior.linked_at
          AND r.action = 'mfa_enrollment_reset' FOR UPDATE;
      IF NOT FOUND OR prior.auth_subject_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
      END IF;
      -- Only expiry before dispatch can release this session's linked presence.
      -- This does not give an AAL1 caller the general cancellation command.
      PERFORM mmhr_private.r1_end_recovery_before_dispatch(prior_request.id,'expired',context.actor_identity_id,
        correlation_id,idempotency_key,context.authorization_time);
      INSERT INTO public.audit_events(actor_type,actor_identity_id,command,action,entity_type,entity_id,
        reason,correlation_id,idempotency_key,before_summary,after_summary,occurred_at)
      VALUES('user',context.actor_identity_id,'identity.recovery.presence.create','identity.recovery.expire',
        'identity_recovery_request',prior_request.id::text,'Expire prior work in the same verified recovery session',
        correlation_id,idempotency_key::text,jsonb_build_object('state',prior_request.state),
        jsonb_build_object('state','expired'),context.authorization_time);
    ELSE
      prior_end := CASE WHEN prior.expires_at <= context.authorization_time THEN 'expired' ELSE 'cancelled' END;
      UPDATE public.identity_recovery_presence SET state = prior_end::public.recovery_presence_state,
        cancelled_at = CASE WHEN prior_end = 'cancelled' THEN context.authorization_time ELSE NULL END,
        updated_at = context.authorization_time WHERE id = prior.id;
      INSERT INTO public.audit_events(actor_type,actor_identity_id,command,action,entity_type,entity_id,
        reason,correlation_id,idempotency_key,before_summary,after_summary,occurred_at)
      VALUES('user',context.actor_identity_id,'identity.recovery.presence.create','identity.recovery.presence.replace',
        'identity_recovery_presence',prior.id::text,'Replace an unlinked reference in the same verified session',
        correlation_id,idempotency_key::text,jsonb_build_object('state','pending'),jsonb_build_object('state',prior_end),context.authorization_time);
    END IF;
  END IF;
  INSERT INTO public.identity_recovery_presence(target_identity_id,auth_session_id,auth_subject_id,
    opaque_reference_hash,expires_at,created_at,updated_at)
  VALUES(context.actor_identity_id,context.auth_session_id,auth.uid(),reference_hash,
    context.authorization_time + interval '30 minutes',context.authorization_time,context.authorization_time)
  RETURNING id INTO target_id;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'identity.recovery.presence.create',
    'identity.recovery.presence.create','identity_recovery_presence',target_id,NULL::uuid,
    'Create a bound recovery reference',correlation_id,idempotency_key,input,NULL::jsonb,
    jsonb_build_object('state','pending'),context.authorization_time);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_request_identity_recovery(
  opaque_reference text, reason_code text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; presence public.identity_recovery_presence%ROWTYPE; bootstrap public.security_bootstrap_state%ROWTYPE;
  stale_request public.identity_recovery_requests%ROWTYPE; input jsonb; receipt jsonb; target_id uuid; reference_hash text;
BEGIN
  IF opaque_reference IS NULL OR opaque_reference !~ '^[0-9a-f]{64}$'
    OR reason_code IS NULL OR reason_code NOT IN ('lost_factor','compromised_factor','replace_device')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_recovery_presence_command(correlation_id,idempotency_key);
  reference_hash := encode(sha256(convert_to(opaque_reference,'UTF8')),'hex');
  SELECT * INTO presence FROM public.identity_recovery_presence p WHERE p.opaque_reference_hash = reference_hash FOR UPDATE;
  SELECT * INTO bootstrap FROM public.security_bootstrap_state b WHERE b.singleton_key = 1;
  IF presence.id IS NULL OR context.actor_identity_id NOT IN (bootstrap.target_identity_id,bootstrap.second_target_identity_id)
    OR NOT mmhr_private.r1_evaluate_permission(context.actor_identity_id,'identity.recovery.request',NULL::uuid,
      'aal2',context.authorization_time,false)
    OR presence.target_identity_id IN (bootstrap.target_identity_id,bootstrap.second_target_identity_id)
      AND presence.target_identity_id <> context.actor_identity_id
    OR presence.target_identity_id = context.actor_identity_id AND presence.auth_session_id <> context.auth_session_id
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  IF presence.target_identity_id <> context.actor_identity_id THEN
    PERFORM mmhr_private.r1_security_actor('identity.recovery.request',NULL::uuid,context.authorization_time);
  END IF;
  input := jsonb_build_object('reference_hash',reference_hash,'reason',reason_code,'presence_id',presence.id);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'identity.recovery.request',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  IF presence.state <> 'pending' OR presence.created_at > context.authorization_time
    OR presence.expires_at <= context.authorization_time OR presence.auth_subject_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.identities i WHERE i.id = presence.target_identity_id
      AND i.auth_user_id = presence.auth_subject_id AND mmhr_private.r1_verified_identity(i.id,false)
      AND (i.authorization_not_before IS NULL OR presence.created_at > i.authorization_not_before))
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id::text = presence.auth_session_id
      AND s.user_id = presence.auth_subject_id AND (s.not_after IS NULL OR s.not_after > context.authorization_time))
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  -- Expired work cannot retain a live approval or prevent a fresh self-request.
  -- This cleanup is limited to this already-authorized target before dispatch.
  FOR stale_request IN SELECT r.* FROM public.identity_recovery_requests r
    WHERE r.target_identity_id = presence.target_identity_id AND r.state IN ('pending','approved')
      AND r.expires_at <= context.authorization_time FOR UPDATE
  LOOP
    PERFORM mmhr_private.r1_end_recovery_before_dispatch(stale_request.id,'expired',context.actor_identity_id,
      correlation_id,idempotency_key,context.authorization_time);
    INSERT INTO public.audit_events(actor_type,actor_identity_id,command,action,entity_type,entity_id,
      reason,correlation_id,idempotency_key,before_summary,after_summary,occurred_at)
    VALUES('user',context.actor_identity_id,'identity.recovery.request','identity.recovery.expire',
      'identity_recovery_request',stale_request.id::text,'Expire prior work before a new authorized request',correlation_id,
      idempotency_key::text,jsonb_build_object('state',stale_request.state),jsonb_build_object('state','expired'),context.authorization_time);
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.identity_recovery_requests r WHERE r.target_identity_id = presence.target_identity_id
    AND r.state IN ('pending','approved'))
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  INSERT INTO public.identity_recovery_requests(target_identity_id,recovery_presence_id,initiated_by_identity_id,
    action,reason,expires_at,created_at,updated_at)
  VALUES(presence.target_identity_id,presence.id,context.actor_identity_id,'mfa_enrollment_reset',reason_code,
    context.authorization_time + interval '30 minutes',context.authorization_time,context.authorization_time)
  RETURNING id INTO target_id;
  UPDATE public.identity_recovery_presence SET state = 'linked',linked_request_id = target_id,
    linked_at = context.authorization_time,updated_at = context.authorization_time WHERE id = presence.id;
  INSERT INTO public.audit_events(actor_type,actor_identity_id,command,action,entity_type,entity_id,
    reason,correlation_id,idempotency_key,before_summary,after_summary,occurred_at)
  VALUES('user',context.actor_identity_id,'identity.recovery.request','identity.recovery.presence.link',
    'identity_recovery_presence',presence.id::text,'Consume one verified presence for one recovery request',correlation_id,
    idempotency_key::text,jsonb_build_object('state','pending'),jsonb_build_object('state','linked'),context.authorization_time);
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'identity.recovery.request',
    'identity.recovery.request','identity_recovery_request',target_id,NULL::uuid,reason_code,
    correlation_id,idempotency_key,input,NULL::jsonb,jsonb_build_object('state','pending'),context.authorization_time);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_decide_identity_recovery(
  request_id uuid, phone_result text, preexisting_contact_attested boolean, phone_checked_at timestamptz,
  evidence_reference uuid, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; request public.identity_recovery_requests%ROWTYPE; bootstrap public.security_bootstrap_state%ROWTYPE;
  intent public.identity_admin_intents%ROWTYPE; input jsonb; receipt jsonb; approved boolean; decision_reason text;
BEGIN
  IF NOT mmhr_private.r1_worker_uuid_is_valid(request_id::text)
    OR NOT mmhr_private.r1_worker_uuid_is_valid(correlation_id::text)
    OR NOT mmhr_private.r1_worker_uuid_is_valid(idempotency_key::text)
    OR evidence_reference IS NOT NULL AND NOT mmhr_private.r1_worker_uuid_is_valid(evidence_reference::text)
    OR preexisting_contact_attested IS NULL OR phone_result IS NULL
    OR phone_result NOT IN ('confirmed','no_preexisting_number','no_answer','not_confirmed','failed')
    OR phone_checked_at IS NULL OR NOT isfinite(phone_checked_at)
    OR phone_result = 'confirmed' AND preexisting_contact_attested AND evidence_reference IS NULL
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('identity.recovery.approve',NULL::uuid,
    'Record the fixed phone identity check',correlation_id,idempotency_key);
  SELECT * INTO bootstrap FROM public.security_bootstrap_state b WHERE b.singleton_key = 1;
  SELECT * INTO request FROM public.identity_recovery_requests r WHERE r.id = request_id FOR UPDATE;
  IF request.id IS NULL OR NOT mmhr_private.r1_recovery_policy_is_prepared()
    OR context.actor_identity_id NOT IN (bootstrap.target_identity_id,bootstrap.second_target_identity_id)
    OR request.initiated_by_identity_id NOT IN (bootstrap.target_identity_id,bootstrap.second_target_identity_id)
    OR context.actor_identity_id IN (request.initiated_by_identity_id,request.target_identity_id)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  input := jsonb_build_object('request_id',request_id,'phone_result',phone_result,
    'preexisting_contact_attested',preexisting_contact_attested,'phone_checked_at',extract(epoch FROM phone_checked_at),
    'evidence_reference',evidence_reference);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'identity.recovery.decide',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  IF request.state <> 'pending' OR request.expires_at <= context.authorization_time
    OR phone_checked_at < request.created_at OR phone_checked_at > context.authorization_time
    OR EXISTS (SELECT 1 FROM public.identity_recovery_approvals a WHERE a.request_id = request.id)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  approved := phone_result = 'confirmed' AND preexisting_contact_attested;
  decision_reason := CASE WHEN approved THEN 'phone_confirmed' ELSE 'phone_check_failed' END;
  INSERT INTO public.identity_recovery_approvals(request_id,approver_identity_id,decision,assurance,
    pre_existing_contact_attested,phone_check_result,checked_at,evidence_reference,decision_reason,created_at)
  VALUES(request.id,context.actor_identity_id,CASE WHEN approved THEN 'approved'::public.recovery_decision
    ELSE 'denied'::public.recovery_decision END,'aal2',preexisting_contact_attested,
    phone_result::public.phone_check_result,phone_checked_at,evidence_reference::text,decision_reason,context.authorization_time);
  IF approved THEN
    UPDATE public.identity_recovery_requests SET state = 'approved',approved_at = context.authorization_time,
      updated_at = context.authorization_time WHERE id = request.id;
    INSERT INTO public.identity_admin_intents(operation,target_identity_id,recovery_request_id,idempotency_key,
      correlation_id,initiated_by_identity_id,auth_subject_id,maximum_attempts,created_at,updated_at)
    SELECT 'mfa_enrollment_reset',request.target_identity_id,request.id,
      encode(sha256(convert_to('identity.recovery.reset:' || request.id::text,'UTF8')),'hex'),
      correlation_id,request.initiated_by_identity_id,p.auth_subject_id,5,context.authorization_time,context.authorization_time
    FROM public.identity_recovery_presence p WHERE p.id = request.recovery_presence_id
    RETURNING * INTO intent;
    IF intent.id IS NULL OR NOT mmhr_private.r1_recovery_intent_is_ready(intent,context.authorization_time)
    THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    INSERT INTO public.audit_events(actor_type,actor_identity_id,command,action,entity_type,entity_id,
      reason,correlation_id,idempotency_key,after_summary,occurred_at)
    VALUES('user',context.actor_identity_id,'identity.recovery.decide','identity.intent.create','identity_intent',intent.id::text,
      'Queue the approved single MFA reset',correlation_id,idempotency_key::text,
      jsonb_build_object('state','pending'),context.authorization_time);
  ELSE
    PERFORM mmhr_private.r1_end_recovery_before_dispatch(request.id,'cancelled',context.actor_identity_id,
      correlation_id,idempotency_key,context.authorization_time);
  END IF;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'identity.recovery.decide',
    CASE WHEN approved THEN 'identity.recovery.approve' ELSE 'identity.recovery.deny' END,
    'identity_recovery_request',request.id,NULL::uuid,decision_reason,correlation_id,idempotency_key,input,
    jsonb_build_object('state','pending'),jsonb_build_object('state',CASE WHEN approved THEN 'approved' ELSE 'cancelled' END),
    context.authorization_time);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_end_identity_recovery(
  request_id uuid, end_state text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; request public.identity_recovery_requests%ROWTYPE; input jsonb; receipt jsonb; command_key text;
BEGIN
  IF NOT mmhr_private.r1_worker_uuid_is_valid(request_id::text)
    OR NOT mmhr_private.r1_worker_uuid_is_valid(correlation_id::text)
    OR NOT mmhr_private.r1_worker_uuid_is_valid(idempotency_key::text)
    OR end_state IS NULL OR end_state NOT IN ('cancelled','expired') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input';
  END IF;
  command_key := CASE WHEN end_state = 'cancelled' THEN 'identity.recovery.cancel' ELSE 'identity.recovery.expire' END;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('identity.recovery.request',NULL::uuid,
    'End recovery before provider dispatch',correlation_id,idempotency_key);
  IF NOT mmhr_private.r1_recovery_policy_is_prepared() OR NOT EXISTS (
    SELECT 1 FROM public.security_bootstrap_state b WHERE b.singleton_key = 1
      AND context.actor_identity_id IN (b.target_identity_id,b.second_target_identity_id)
  ) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  input := jsonb_build_object('request_id',request_id,'end_state',end_state);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,command_key,idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  SELECT * INTO request FROM public.identity_recovery_requests r WHERE r.id = request_id FOR UPDATE;
  IF request.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  PERFORM mmhr_private.r1_end_recovery_before_dispatch(request.id,end_state,context.actor_identity_id,
    correlation_id,idempotency_key,context.authorization_time);
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,command_key,command_key,
    'identity_recovery_request',request.id,NULL::uuid,'End recovery before provider dispatch',correlation_id,
    idempotency_key,input,jsonb_build_object('state',request.state),jsonb_build_object('state',end_state),context.authorization_time);
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION mmhr_private.r1_start_recovery_presence_command(uuid,uuid),
  mmhr_private.r1_end_recovery_before_dispatch(uuid,text,uuid,uuid,uuid,timestamptz),
  public.mmhr_create_recovery_presence(text,uuid,uuid),public.mmhr_request_identity_recovery(text,text,uuid,uuid),
  public.mmhr_decide_identity_recovery(uuid,text,boolean,timestamptz,uuid,uuid,uuid),
  public.mmhr_end_identity_recovery(uuid,text,uuid,uuid)
FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_create_recovery_presence(text,uuid,uuid),
  public.mmhr_request_identity_recovery(text,text,uuid,uuid),
  public.mmhr_decide_identity_recovery(uuid,text,boolean,timestamptz,uuid,uuid,uuid),
  public.mmhr_end_identity_recovery(uuid,text,uuid,uuid) TO authenticated;
