-- Recovery never uses the ordinary active-identity permission path. These fixed
-- functions prove the completed reset and the original bound session directly.
CREATE FUNCTION mmhr_private.r1_recovery_mfa_context(
  authorization_time timestamptz, require_aal2 boolean, permit_completed boolean
)
RETURNS TABLE(actor_id uuid, subject_id uuid, session_id uuid, presence_id uuid,
  request_id uuid, intent_id uuid, expected_factor_id uuid, reset_completed_at timestamptz,
  recovery_completed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE claims jsonb := auth.jwt(); current_session uuid;
BEGIN
  IF authorization_time IS NULL OR NOT isfinite(authorization_time)
    OR require_aal2 IS NULL OR permit_completed IS NULL
    OR claims ->> 'role' IS DISTINCT FROM 'authenticated'
    OR coalesce(claims ->> 'aal','') NOT IN ('aal1','aal2')
    OR NOT mmhr_private.r1_worker_uuid_is_valid(claims ->> 'sub')
    OR NOT mmhr_private.r1_worker_uuid_is_valid(claims ->> 'session_id')
    OR coalesce(claims ->> 'exp','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims ->> 'iat','') !~ '^[0-9]{1,12}$'
  THEN RETURN; END IF;
  current_session := (claims ->> 'session_id')::uuid;
  IF (claims ->> 'exp')::numeric <= extract(epoch FROM authorization_time)
    OR (claims ->> 'iat')::numeric > floor(extract(epoch FROM authorization_time))
    OR (claims ->> 'iat')::numeric >= (claims ->> 'exp')::numeric
    OR require_aal2 AND claims ->> 'aal' <> 'aal2'
    OR claims ->> 'aal' = 'aal2' AND NOT mmhr_private.r1_session_is_aal2(auth.uid(),current_session,authorization_time)
    OR NOT mmhr_private.r1_recovery_policy_is_prepared()
  THEN RETURN; END IF;
  RETURN QUERY
  SELECT i.id,i.auth_user_id,s.id,p.id,r.id,intent.id,
    CASE WHEN mmhr_private.r1_worker_uuid_is_valid(p.expected_replacement_factor_id)
      THEN p.expected_replacement_factor_id::uuid END,
    intent.completed_at,p.state = 'completed'
  FROM public.identities i
  JOIN auth.users u ON u.id = i.auth_user_id
  JOIN auth.sessions s ON s.user_id = u.id AND s.id = current_session
  JOIN public.identity_recovery_presence p ON p.target_identity_id = i.id
    AND p.auth_subject_id = u.id AND p.auth_session_id = s.id::text
  JOIN public.identity_recovery_requests r ON r.id = p.linked_request_id AND r.recovery_presence_id = p.id
  JOIN public.identity_recovery_approvals a ON a.request_id = r.id
  JOIN public.security_bootstrap_state b ON b.singleton_key = 1
  JOIN public.identity_admin_intents intent ON intent.recovery_request_id = r.id
  JOIN public.identity_intent_attempts first_attempt ON first_attempt.intent_id = intent.id
    AND first_attempt.attempt_number = 1 AND first_attempt.mode = 'dispatch'
  WHERE u.id = auth.uid() AND NOT i.migration_review_required AND i.email_verified_at IS NOT NULL
    AND u.deleted_at IS NULL AND NOT u.is_anonymous AND u.email_confirmed_at IS NOT NULL
    AND lower(btrim(u.email)) = i.normalized_email
    AND (u.banned_until IS NULL OR u.banned_until <= authorization_time)
    AND (s.not_after IS NULL OR s.not_after > authorization_time) AND s.created_at <= p.created_at
    AND i.authorization_not_before IS NOT NULL
    AND (claims ->> 'iat')::numeric > floor(extract(epoch FROM i.authorization_not_before))
    AND first_attempt.started_at = i.authorization_not_before
    AND p.linked_at = r.created_at AND p.linked_at >= p.created_at AND p.linked_at < p.expires_at
    AND r.target_identity_id = i.id AND r.state = 'completed' AND r.action = 'mfa_enrollment_reset'
    -- Prove the immutable approval that preceded dispatch. Current approver
    -- authority and the original deadline must not block later MFA completion.
    AND a.decision = 'approved' AND a.assurance = 'aal2' AND a.pre_existing_contact_attested
    AND a.phone_check_result = 'confirmed' AND mmhr_private.r1_worker_uuid_is_valid(a.evidence_reference)
    AND a.approver_identity_id <> r.initiated_by_identity_id AND a.approver_identity_id <> r.target_identity_id
    AND a.approver_identity_id IN (b.target_identity_id,b.second_target_identity_id)
    AND r.initiated_by_identity_id IN (b.target_identity_id,b.second_target_identity_id)
    AND (r.target_identity_id NOT IN (b.target_identity_id,b.second_target_identity_id)
      OR r.target_identity_id = r.initiated_by_identity_id)
    AND a.checked_at BETWEEN r.created_at AND r.approved_at AND a.created_at = r.approved_at
    AND r.created_at <= r.approved_at AND r.approved_at <= intent.created_at
    AND intent.created_at <= first_attempt.started_at AND first_attempt.started_at < r.expires_at
    AND first_attempt.started_at <= r.completed_at
    AND r.completed_at = intent.completed_at AND r.completed_at <= authorization_time
    AND intent.target_identity_id = i.id AND intent.auth_subject_id = u.id
    AND intent.initiated_by_identity_id = r.initiated_by_identity_id
    AND intent.operation = 'mfa_enrollment_reset' AND intent.state = 'succeeded'
    AND intent.result_code = 'mfa_zero_factors' AND intent.confirmed_factor_count = 0 AND intent.dispatch_count = 1
    AND mmhr_private.r1_identity_intent_context_is_valid(intent)
    AND mmhr_private.r1_identity_intent_history_is_valid(intent)
    AND (p.expected_replacement_factor_id IS NULL OR mmhr_private.r1_worker_uuid_is_valid(p.expected_replacement_factor_id))
    AND NOT EXISTS (SELECT 1 FROM public.identities other WHERE other.status = 'recovery_pending' AND other.id <> i.id)
    AND (i.status = 'recovery_pending' AND p.state = 'linked'
      OR permit_completed AND i.status = 'active' AND p.state = 'completed'
        AND p.completed_at >= r.completed_at AND p.completed_at <= authorization_time
        AND claims ->> 'aal' = 'aal2' AND s.factor_id::text = p.expected_replacement_factor_id);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_get_recovery_mfa_context()
RETURNS TABLE(recovery_request_id uuid, recovery_presence_id uuid, expected_factor_id uuid, state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT c.request_id,c.presence_id,c.expected_factor_id,
    CASE WHEN c.recovery_completed THEN 'completed'
      WHEN c.expected_factor_id IS NULL AND NOT EXISTS (
        SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = c.subject_id
      ) THEN 'enrollment_required'
      WHEN c.expected_factor_id IS NOT NULL AND (SELECT count(*) FROM auth.mfa_factors f WHERE f.user_id = c.subject_id) = 1
        AND EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = c.subject_id
          AND f.id = c.expected_factor_id AND f.factor_type = 'totp' AND f.created_at >= c.reset_completed_at)
        THEN 'verification_required'
      ELSE 'needs_review' END
  FROM mmhr_private.r1_recovery_mfa_context(statement_timestamp(),false,true) c
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_register_recovery_factor(factor_id uuid, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; checked_at timestamptz; input jsonb; receipt jsonb; event_id uuid; receipt_id uuid;
BEGIN
  IF NOT mmhr_private.r1_worker_uuid_is_valid(factor_id::text)
    OR NOT mmhr_private.r1_worker_uuid_is_valid(correlation_id::text)
    OR NOT mmhr_private.r1_worker_uuid_is_valid(idempotency_key::text)
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input'; END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  checked_at := mmhr_private.r1_lock_security();
  SELECT * INTO context FROM mmhr_private.r1_recovery_mfa_context(checked_at,false,true);
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  PERFORM 1 FROM auth.users u WHERE u.id = context.subject_id FOR UPDATE;
  PERFORM 1 FROM auth.sessions s WHERE s.id = context.session_id AND s.user_id = context.subject_id FOR UPDATE;
  PERFORM 1 FROM auth.mfa_factors f WHERE f.user_id = context.subject_id ORDER BY f.id FOR UPDATE;
  checked_at := clock_timestamp();
  SELECT * INTO context FROM mmhr_private.r1_recovery_mfa_context(checked_at,false,true);
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  input := jsonb_build_object('factor_id',factor_id,'presence_id',context.presence_id,'request_id',context.request_id);
  receipt := mmhr_private.r1_checked_receipt(context.actor_id,'identity.recovery.factor.register',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  IF context.recovery_completed OR context.expected_factor_id IS NOT NULL
    OR (SELECT count(*) FROM auth.mfa_factors f WHERE f.user_id = context.subject_id) <> 1
    OR NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.id = factor_id AND f.user_id = context.subject_id
      AND f.factor_type = 'totp' AND f.status = 'unverified' AND f.created_at >= context.reset_completed_at
      AND f.created_at <= checked_at)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  UPDATE public.identity_recovery_presence SET expected_replacement_factor_id = factor_id::text,updated_at = checked_at
    WHERE id = context.presence_id AND state = 'linked' AND expected_replacement_factor_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  -- This fixed enrollment exception retains containment; normal command
  -- completion cannot run until both named administrators are active again.
  INSERT INTO public.audit_events(actor_type,actor_identity_id,command,action,entity_type,entity_id,
    reason,correlation_id,idempotency_key,after_summary,occurred_at)
  VALUES('user',context.actor_id,'identity.recovery.factor.register','identity.recovery.factor.register',
    'identity_recovery_presence',context.presence_id::text,'Bind the replacement factor without restoring access',
    correlation_id,idempotency_key::text,jsonb_build_object('state','linked'),checked_at) RETURNING id INTO event_id;
  INSERT INTO public.security_command_receipts(actor_identity_id,command,idempotency_key,request_digest,
    entity_id,action,audit_event_id,created_at)
  VALUES(context.actor_id,'identity.recovery.factor.register',idempotency_key,
    encode(sha256(convert_to(input::text,'UTF8')),'hex'),context.presence_id,
    'identity.recovery.factor.register',event_id,checked_at) RETURNING id INTO receipt_id;
  RETURN jsonb_build_object('receipt_id',receipt_id,'entity_id',context.presence_id,'action','identity.recovery.factor.register');
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_reactivate_recovered_identity(correlation_id uuid, idempotency_key uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; checked_at timestamptz; input jsonb; receipt jsonb;
BEGIN
  IF NOT mmhr_private.r1_worker_uuid_is_valid(correlation_id::text)
    OR NOT mmhr_private.r1_worker_uuid_is_valid(idempotency_key::text)
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input'; END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  checked_at := mmhr_private.r1_lock_security();
  SELECT * INTO context FROM mmhr_private.r1_recovery_mfa_context(checked_at,true,true);
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  PERFORM 1 FROM auth.users u WHERE u.id = context.subject_id FOR UPDATE;
  PERFORM 1 FROM auth.sessions s WHERE s.id = context.session_id AND s.user_id = context.subject_id FOR UPDATE;
  PERFORM 1 FROM auth.mfa_factors f WHERE f.user_id = context.subject_id ORDER BY f.id FOR UPDATE;
  checked_at := clock_timestamp();
  SELECT * INTO context FROM mmhr_private.r1_recovery_mfa_context(checked_at,true,true);
  IF NOT FOUND OR context.expected_factor_id IS NULL
    OR (SELECT count(*) FROM auth.mfa_factors f WHERE f.user_id = context.subject_id) <> 1
    OR NOT EXISTS (SELECT 1 FROM auth.mfa_factors f JOIN auth.sessions s ON s.factor_id = f.id
      WHERE f.id = context.expected_factor_id AND f.user_id = context.subject_id AND f.status = 'verified'
        AND f.factor_type = 'totp' AND f.created_at >= context.reset_completed_at
        AND f.created_at <= checked_at AND s.id = context.session_id AND s.user_id = context.subject_id)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  input := jsonb_build_object('presence_id',context.presence_id,'request_id',context.request_id,
    'factor_id',context.expected_factor_id);
  receipt := mmhr_private.r1_checked_receipt(context.actor_id,'identity.recovery.reactivate',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  IF context.recovery_completed THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  UPDATE public.identities SET status = 'active',updated_at = checked_at WHERE id = context.actor_id AND status = 'recovery_pending';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  UPDATE public.identity_recovery_presence SET state = 'completed',completed_at = checked_at,updated_at = checked_at
    WHERE id = context.presence_id AND state = 'linked';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  INSERT INTO public.audit_events(actor_type,actor_identity_id,command,action,entity_type,entity_id,
    reason,correlation_id,idempotency_key,before_summary,after_summary,occurred_at)
  VALUES('user',context.actor_id,'identity.recovery.reactivate','identity.recovery.presence.complete',
    'identity_recovery_presence',context.presence_id::text,'Complete the verified bound recovery session',
    correlation_id,idempotency_key::text,jsonb_build_object('state','linked'),jsonb_build_object('state','completed'),checked_at);
  RETURN mmhr_private.r1_finish_security_command(context.actor_id,'identity.recovery.reactivate',
    'identity.recovery.reactivate','identity',context.actor_id,NULL::uuid,
    'Restore access after the bound replacement factor verifies',correlation_id,idempotency_key,input,
    jsonb_build_object('status','recovery_pending'),jsonb_build_object('status','active'),checked_at);
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION mmhr_private.r1_recovery_mfa_context(timestamptz,boolean,boolean),
  public.mmhr_get_recovery_mfa_context(),public.mmhr_register_recovery_factor(uuid,uuid,uuid),
  public.mmhr_reactivate_recovered_identity(uuid,uuid)
FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_get_recovery_mfa_context(),
  public.mmhr_register_recovery_factor(uuid,uuid,uuid),public.mmhr_reactivate_recovered_identity(uuid,uuid)
TO authenticated;
