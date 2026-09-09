-- Correct caller synchronization evidence without widening audit summary fields.
-- The immutable action records the outcome; existing audit columns bind identity and correlation.
-- Recovery: revoke this RPC and retain all identities, receipts and audit records.
CREATE OR REPLACE FUNCTION public.mmhr_sync_my_identity(correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  claims jsonb := auth.jwt();
  checked_at timestamptz;
  request_session uuid;
  provider auth.users%ROWTYPE;
  actor public.identities%ROWTYPE;
  before_status text;
  outcome text;
  created_identity boolean := false;
  input jsonb;
  replay jsonb;
  replay_summary jsonb;
  replay_action text;
  event_id uuid;
BEGIN
  IF correlation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid synchronization input';
  END IF;
  checked_at := mmhr_private.r1_lock_security();
  IF auth.uid() IS NULL
    OR claims->>'role' IS DISTINCT FROM 'authenticated'
    OR coalesce(claims->>'aal','') NOT IN ('aal1','aal2')
    OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims->>'iat','') !~ '^[0-9]{1,12}$'
    OR lower(coalesce(claims->>'sub','')) IS DISTINCT FROM lower(auth.uid()::text)
    OR coalesce(claims->>'session_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
  THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Identity synchronization denied';
  END IF;
  request_session := (claims->>'session_id')::uuid;
  IF (claims->>'exp')::numeric <= extract(epoch FROM checked_at)
    OR (claims->>'iat')::numeric > floor(extract(epoch FROM checked_at))
    OR (claims->>'iat')::numeric >= (claims->>'exp')::numeric
    OR NOT EXISTS (
      SELECT 1 FROM auth.sessions s
      WHERE s.id=request_session AND s.user_id=auth.uid()
        AND (s.not_after IS NULL OR s.not_after>checked_at)
    )
    OR (claims->>'aal'='aal2' AND NOT mmhr_private.r1_session_is_aal2(auth.uid(),request_session,checked_at))
  THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Identity synchronization denied';
  END IF;
  SELECT * INTO provider FROM auth.users u
  WHERE u.id=auth.uid()
    AND u.email_confirmed_at IS NOT NULL
    AND nullif(lower(btrim(u.email)),'') IS NOT NULL
    AND u.deleted_at IS NULL
    AND NOT u.is_anonymous
    AND (u.banned_until IS NULL OR u.banned_until<=checked_at)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Identity synchronization denied';
  END IF;
  SELECT * INTO actor FROM public.identities i WHERE i.auth_user_id=provider.id FOR UPDATE;
  IF FOUND THEN
    IF actor.status NOT IN ('pending','active')
      OR actor.migration_review_required
      OR (actor.normalized_email IS NOT NULL AND actor.normalized_email IS DISTINCT FROM lower(btrim(provider.email)))
    THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Identity synchronization denied';
    END IF;
  ELSE
    INSERT INTO public.identities(
      auth_user_id, normalized_email, email_verified_at, status,
      synchronized_at, migration_review_required
    ) VALUES (
      provider.id, lower(btrim(provider.email)), provider.email_confirmed_at,
      'pending', checked_at, false
    ) RETURNING * INTO actor;
    created_identity := true;
  END IF;
  input := jsonb_build_object(
    'provider_subject', provider.id,
    'email_verified_at', provider.email_confirmed_at
  );
  replay := mmhr_private.r1_checked_receipt(actor.id,'identity.synchronize',correlation_id,input);
  IF replay IS NOT NULL THEN
    SELECT event.after_summary, event.action INTO replay_summary, replay_action
    FROM public.security_command_receipts receipt
    JOIN public.audit_events event ON event.id=receipt.audit_event_id
    WHERE receipt.id=(replay->>'receipt_id')::uuid
      AND event.actor_identity_id=actor.id AND event.command='identity.synchronize'
      AND event.correlation_id=mmhr_sync_my_identity.correlation_id;
    outcome := CASE replay_action
      WHEN 'identity.synchronize.created' THEN 'created'
      WHEN 'identity.synchronize.unchanged' THEN 'unchanged'
      WHEN 'identity.synchronize.synchronized' THEN 'synchronized'
      ELSE NULL END;
    IF outcome IS NULL OR replay_action IS DISTINCT FROM replay->>'action'
      OR coalesce(replay_summary->>'status','') NOT IN ('pending','active')
      OR (outcome='created' AND replay_summary->>'status'<>'pending')
    THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Identity synchronization denied'; END IF;
    RETURN jsonb_build_object('identityId',actor.id,'status',replay_summary->>'status',
      'outcome',outcome,'correlationId',correlation_id);
  END IF;
  before_status := actor.status::text;
  IF actor.normalized_email = lower(btrim(provider.email))
    AND actor.email_verified_at = provider.email_confirmed_at
    AND actor.synchronized_at IS NOT NULL THEN
    outcome := 'unchanged';
  ELSE
    outcome := 'synchronized';
    UPDATE public.identities SET normalized_email=lower(btrim(provider.email)),
      email_verified_at=provider.email_confirmed_at, synchronized_at=checked_at,
      updated_at=checked_at WHERE id=actor.id;
  END IF;
  IF created_identity THEN outcome := 'created'; END IF;
  INSERT INTO public.audit_events(
    actor_type, actor_identity_id, command, action, entity_type, entity_id,
    reason, correlation_id, idempotency_key, before_summary, after_summary, occurred_at
  ) VALUES (
    'user', actor.id, 'identity.synchronize', 'identity.synchronize.' || outcome, 'identity', actor.id::text,
    'Synchronize the verified caller identity', correlation_id, correlation_id::text,
    CASE WHEN outcome='created' THEN NULL ELSE jsonb_build_object('status',before_status) END,
    jsonb_build_object('status',actor.status),
    checked_at
  ) RETURNING id INTO event_id;
  INSERT INTO public.security_command_receipts(
    actor_identity_id, command, idempotency_key, request_digest, entity_id,
    action, audit_event_id, created_at
  ) VALUES (
    actor.id, 'identity.synchronize', correlation_id,
    encode(sha256(convert_to(input::text,'UTF8')),'hex'), actor.id,
    'identity.synchronize.' || outcome, event_id, checked_at
  );
  RETURN jsonb_build_object(
    'identityId',actor.id,'status',actor.status,'outcome',outcome,
    'correlationId',correlation_id
  );
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_sync_my_identity(uuid) FROM PUBLIC, anon, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_sync_my_identity(uuid) TO authenticated;
