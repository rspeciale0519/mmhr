-- Fix an ambiguous PL/pgSQL local variable without changing invitation data.
-- Use existing stable_key and record_id audit fields; do not weaken the audit validator.
-- Keep fixed command authorization, audit coupling, receipts, and delivery intent rules.
-- Recovery: revoke command EXECUTE until a reviewed forward correction is available.
CREATE OR REPLACE FUNCTION public.mmhr_create_invitation(
  organization_id uuid, email text, role_key text, reason text,
  correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  receipt jsonb;
  invitation public.invitations%ROWTYPE;
  v_normalized_email text := lower(btrim(email));
  input jsonb;
  delivery_key text;
BEGIN
  IF organization_id IS NULL OR v_normalized_email IS NULL
    OR length(v_normalized_email) = 0 OR length(v_normalized_email) > 254
    OR v_normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    OR coalesce(role_key,'') NOT IN ('organization_admin','contributor','viewer')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid invitation input'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'org.members.invite', organization_id, reason, correlation_id, idempotency_key);
  input := jsonb_build_object(
    'organization_id', organization_id, 'email', v_normalized_email, 'role_key', role_key,
    'reason', btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(
    context.actor_identity_id, 'invitation.create', idempotency_key, input);
  IF receipt IS NOT NULL THEN
    SELECT * INTO invitation FROM public.invitations i WHERE i.id = (receipt ->> 'entity_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    RETURN mmhr_private.r1_invitation_result(invitation.id, invitation.status::text, 'replayed', correlation_id);
  END IF;
  SELECT * INTO invitation FROM public.invitations i
  WHERE i.org_id = organization_id AND i.normalized_email = v_normalized_email
    AND i.status = 'pending' AND NOT i.migration_review_required
  FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.orgs o
    WHERE o.id = organization_id AND o.status = 'active' AND NOT o.migration_review_required
  ) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  INSERT INTO public.invitations (
    org_id, email, normalized_email, role, role_key, token, status,
    created_by_identity_id, expires_at, migration_review_required, created_at, updated_at
  ) VALUES (
    organization_id, v_normalized_email, v_normalized_email,
    CASE role_key WHEN 'organization_admin' THEN 'admin'::public.org_role
      WHEN 'contributor' THEN 'contributor'::public.org_role
      ELSE 'viewer'::public.org_role END,
    role_key, NULL, 'pending', context.actor_identity_id,
    context.authorization_time + interval '72 hours', false,
    context.authorization_time, context.authorization_time
  ) RETURNING * INTO invitation;
  IF NOT EXISTS (
    SELECT 1 FROM public.identities i JOIN auth.users u ON u.id = i.auth_user_id
    WHERE i.normalized_email = v_normalized_email AND i.status <> 'archived'
      AND i.email_verified_at IS NOT NULL AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL AND NOT u.is_anonymous
  ) THEN
    delivery_key := encode(sha256(convert_to('invitation_delivery:' || invitation.id::text, 'UTF8')), 'hex');
    INSERT INTO public.identity_admin_intents (
      operation, invitation_id, idempotency_key, correlation_id,
      initiated_by_identity_id, maximum_attempts
    ) VALUES (
      'invitation_delivery', invitation.id, delivery_key, correlation_id,
      context.actor_identity_id, 5
    );
  END IF;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'invitation.create', 'invitation.create', 'invitation',
    invitation.id, organization_id, reason, correlation_id, idempotency_key,
    input, NULL, jsonb_build_object('status','pending','stable_key',role_key), context.authorization_time
  );
  RETURN mmhr_private.r1_invitation_result(invitation.id, 'pending', 'created', correlation_id);
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.mmhr_create_invitation(uuid,text,text,text,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_create_invitation(uuid,text,text,text,uuid,uuid) TO authenticated;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_resend_invitation(
  organization_id uuid, invitation_id uuid, reason text,
  correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  receipt jsonb;
  old_invitation public.invitations%ROWTYPE;
  replacement public.invitations%ROWTYPE;
  input jsonb;
  delivery_key text;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'org.members.invite', organization_id, reason, correlation_id, idempotency_key);
  input := jsonb_build_object('organization_id',organization_id,'invitation_id',invitation_id,'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(
    context.actor_identity_id, 'invitation.resend', idempotency_key, input);
  IF receipt IS NOT NULL THEN
    RETURN mmhr_private.r1_invitation_result((receipt ->> 'entity_id')::uuid, 'pending', 'replayed', correlation_id);
  END IF;
  SELECT * INTO old_invitation FROM public.invitations i
  WHERE i.id = invitation_id AND i.org_id = organization_id FOR UPDATE;
  IF NOT FOUND OR old_invitation.status <> 'pending' OR old_invitation.migration_review_required
    OR old_invitation.expires_at <= context.authorization_time
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  UPDATE public.invitations SET status = 'revoked', revoked_by_identity_id = context.actor_identity_id,
    revoked_at = context.authorization_time, revoked_reason = btrim(reason), updated_at = context.authorization_time
  WHERE id = old_invitation.id;
  INSERT INTO public.invitations (
    org_id, email, normalized_email, role, role_key, token, status,
    created_by_identity_id, expires_at, migration_review_required, created_at, updated_at
  ) VALUES (
    old_invitation.org_id, old_invitation.email, old_invitation.normalized_email,
    old_invitation.role, old_invitation.role_key, NULL, 'pending', context.actor_identity_id,
    context.authorization_time + interval '72 hours', false,
    context.authorization_time, context.authorization_time
  ) RETURNING * INTO replacement;
  IF NOT EXISTS (
    SELECT 1 FROM public.identities i JOIN auth.users u ON u.id = i.auth_user_id
    WHERE i.normalized_email = replacement.normalized_email AND i.status <> 'archived'
      AND i.email_verified_at IS NOT NULL AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL AND NOT u.is_anonymous
  ) THEN
    delivery_key := encode(sha256(convert_to('invitation_delivery:' || replacement.id::text, 'UTF8')), 'hex');
    INSERT INTO public.identity_admin_intents (
      operation, invitation_id, idempotency_key, correlation_id,
      initiated_by_identity_id, maximum_attempts
    ) VALUES (
      'invitation_delivery', replacement.id, delivery_key, correlation_id,
      context.actor_identity_id, 5
    );
  END IF;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'invitation.resend', 'invitation.resend', 'invitation',
    replacement.id, organization_id, reason, correlation_id, idempotency_key,
    input, jsonb_build_object('status','pending','record_id',old_invitation.id),
    jsonb_build_object('status','pending','record_id',replacement.id), context.authorization_time
  );
  RETURN mmhr_private.r1_invitation_result(replacement.id, 'pending', 'replaced', correlation_id);
END
$$;--> statement-breakpoint

--> statement-breakpoint
-- Pending invitees need identity-only access without granting workspace authority.
CREATE FUNCTION mmhr_private.r1_invitation_identity_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  claims jsonb := auth.jwt();
  checked_at timestamptz := statement_timestamp();
  request_session uuid;
  actor uuid;
BEGIN
  IF claims->>'role' IS DISTINCT FROM 'authenticated'
    OR coalesce(claims->>'aal','') NOT IN ('aal1','aal2')
    OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims->>'iat','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims->>'sub','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR coalesce(claims->>'session_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
  THEN RETURN NULL; END IF;
  request_session := (claims->>'session_id')::uuid;
  IF (claims->>'exp')::numeric <= extract(epoch FROM checked_at)
    OR (claims->>'iat')::numeric > floor(extract(epoch FROM checked_at))
    OR (claims->>'iat')::numeric >= (claims->>'exp')::numeric
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=request_session AND s.user_id=auth.uid()
      AND (s.not_after IS NULL OR s.not_after > checked_at))
  THEN RETURN NULL; END IF;
  IF claims->>'aal'='aal2' AND NOT mmhr_private.r1_session_is_aal2(auth.uid(),request_session,checked_at)
  THEN RETURN NULL; END IF;
  SELECT i.id INTO actor FROM public.identities i JOIN auth.users u ON u.id=i.auth_user_id
  WHERE i.auth_user_id=auth.uid() AND i.status IN ('pending','active')
    AND NOT i.migration_review_required AND i.email_verified_at IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
    AND (u.banned_until IS NULL OR u.banned_until <= checked_at)
    AND i.normalized_email=lower(btrim(u.email))
    AND (i.authorization_not_before IS NULL OR i.id=mmhr_private.r1_request_identity_id());
  RETURN actor;
END
$$;
REVOKE ALL ON FUNCTION mmhr_private.r1_invitation_identity_id()
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_accept_invitation(
  invitation_id uuid, verified_email text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  claims jsonb := auth.jwt();
  checked_at timestamptz;
  actor uuid;
  invitation public.invitations%ROWTYPE;
  input jsonb;
  receipt jsonb;
  member_id uuid;
  role_value public.org_role;
  event_id uuid;
BEGIN
  IF claims ->> 'role' IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
    OR invitation_id IS NULL OR correlation_id IS NULL OR idempotency_key IS NULL
    OR lower(btrim(verified_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  checked_at := mmhr_private.r1_lock_security();
  SELECT i.id INTO actor FROM public.identities i JOIN auth.users u ON u.id = i.auth_user_id
  WHERE i.id = mmhr_private.r1_invitation_identity_id() AND i.status IN ('pending','active')
    AND NOT i.migration_review_required AND i.email_verified_at IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
    AND i.normalized_email = lower(btrim(u.email))
    AND i.normalized_email = lower(btrim(verified_email));
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  input := jsonb_build_object('invitation_id',invitation_id,'verified_email',lower(btrim(verified_email)));
  receipt := mmhr_private.r1_checked_receipt(actor, 'invitation.accept', idempotency_key, input);
  IF receipt IS NOT NULL THEN
    RETURN mmhr_private.r1_invitation_result((receipt ->> 'entity_id')::uuid, 'accepted', 'replayed', correlation_id);
  END IF;
  SELECT * INTO invitation FROM public.invitations i WHERE i.id = invitation_id FOR UPDATE;
  IF NOT FOUND OR invitation.status <> 'pending' OR invitation.migration_review_required
    OR invitation.expires_at <= checked_at OR invitation.normalized_email <> lower(btrim(verified_email))
    OR EXISTS (SELECT 1 FROM public.orgs o WHERE o.id = invitation.org_id
      AND (o.status <> 'active' OR o.migration_review_required))
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = invitation.org_id
      AND m.identity_id = actor AND m.status IN ('active','suspended'))
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  role_value := CASE invitation.role_key WHEN 'organization_admin' THEN 'admin'::public.org_role
    WHEN 'contributor' THEN 'contributor'::public.org_role ELSE 'viewer'::public.org_role END;
  IF EXISTS (SELECT 1 FROM public.identities i WHERE i.id = actor AND i.status = 'pending') THEN
    UPDATE public.identities SET status = 'active', activated_at = checked_at, updated_at = checked_at WHERE id = actor;
  END IF;
  INSERT INTO public.org_members (
    org_id, identity_id, user_id, role, role_key, status, activated_at,
    migration_review_required, created_at, updated_at
  ) VALUES (
    invitation.org_id, actor, auth.uid(), role_value, invitation.role_key, 'active', checked_at,
    false, checked_at, checked_at
  ) RETURNING id INTO member_id;
  UPDATE public.invitations SET status = 'accepted', accepted_by_identity_id = actor,
    accepted_at = checked_at, updated_at = checked_at WHERE id = invitation.id;
  INSERT INTO public.audit_events (
    actor_type, actor_identity_id, organization_id, command, action, entity_type, entity_id,
    reason, correlation_id, idempotency_key, before_summary, after_summary, occurred_at
  ) VALUES (
    'user', actor, invitation.org_id, 'invitation.accept', 'invitation.accept', 'invitation', invitation.id::text,
    'Accept invitation after verified identity and email match', correlation_id, idempotency_key::text,
    jsonb_build_object('status','pending'), jsonb_build_object('status','accepted','record_id',member_id), checked_at
  ) RETURNING id INTO event_id;
  INSERT INTO public.security_command_receipts (
    actor_identity_id, command, idempotency_key, request_digest, entity_id,
    action, audit_event_id, created_at
  ) VALUES (
    actor, 'invitation.accept', idempotency_key,
    encode(sha256(convert_to(input::text,'UTF8')),'hex'), invitation.id,
    'invitation.accept', event_id, checked_at
  );
  RETURN mmhr_private.r1_invitation_result(invitation.id, 'accepted', 'accepted', correlation_id);
END
$$;--> statement-breakpoint


--> statement-breakpoint
-- R1.6 fixed read for pending invitations belonging to the verified caller.
-- It returns no invitation token or email address.
CREATE OR REPLACE FUNCTION public.mmhr_get_my_invitations()
RETURNS TABLE (
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
  role_key text,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT invitation.id, organization.id, organization.name,
    invitation.role_key, invitation.expires_at
  FROM public.invitations AS invitation
  INNER JOIN public.orgs AS organization
    ON organization.id = invitation.org_id
  WHERE invitation.normalized_email = (
      SELECT identity.normalized_email
      FROM public.identities AS identity
      WHERE identity.id = mmhr_private.r1_invitation_identity_id()
    )
    AND invitation.status = 'pending'
    AND invitation.expires_at > CURRENT_TIMESTAMP
    AND organization.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.org_members AS membership
      WHERE membership.org_id = invitation.org_id
        AND membership.identity_id = mmhr_private.r1_invitation_identity_id()
        AND membership.status IN ('active', 'suspended')
    )
  ORDER BY invitation.expires_at, invitation.id
  LIMIT 100
$$;

REVOKE ALL ON FUNCTION public.mmhr_get_my_invitations() FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_my_invitations() TO authenticated;
