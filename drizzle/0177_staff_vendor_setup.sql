-- Staff vendor setup. Hand-written; no table, column, or policy changes.
-- Forward: MMHR staff with admin.access and AAL2 list vendor organizations,
-- add a vendor organization with its vendor profile, turn on its vendor
-- portal, and invite its first organization_admin. Staff never become
-- members of the vendor organization.
-- Administration capacity: a new vendor organization starts as 'pending'.
-- r1_assert_administration_capacity checks only active organizations, so a
-- pending vendor organization with no administrator cannot block security
-- commands. The organization becomes active only inside the acceptance that
-- creates its first organization_admin membership. That acceptance needs a
-- verified MFA factor and then runs the unchanged capacity check, so an
-- active vendor organization always has a capable administrator.
-- The capacity check, the permission evaluator, and every hot helper are
-- unchanged. The new functions call them; no SET search_path helper is added
-- to an evaluator path.
-- Customers and vendors gain nothing: every new RPC needs admin.access with
-- AAL2, and the acceptance change applies only to a pending vendor
-- organization with a staff-issued organization_admin invitation.
-- No email is sent. Staff invitations create no invitation_delivery intent.
-- Recovery: see the end of this file. Do not delete organizations, profiles,
-- grants, invitations, memberships, receipts, or audit events.
SELECT mmhr_private.r1_lock_security();--> statement-breakpoint

-- Vendor organizations for the staff setup page. Invitation email addresses
-- are shown to staff only. No customer, RFP, response, or commission data.
CREATE FUNCTION public.mmhr_get_staff_vendor_directory(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid; v_checked_at timestamptz := statement_timestamp(); v_rows jsonb; v_limit integer := 200;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR payload <> '{}'::jsonb
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Vendor directory fields are invalid'; END IF;
  v_actor := mmhr_private.r1_request_identity_id();
  IF v_actor IS NULL OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2'
    OR NOT coalesce(mmhr_private.r1_request_has_permission('admin.access',NULL::uuid),false)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Vendor directory is unavailable'; END IF;

  WITH vendors AS (
    SELECT o.id, o.name, o.status FROM public.orgs o
    WHERE o.type = 'vendor' AND o.status IN ('pending','active','suspended') AND NOT o.migration_review_required
    ORDER BY lower(o.name), o.id LIMIT v_limit + 1
  ) SELECT coalesce(jsonb_agg(jsonb_build_object(
      'organizationId', v.id, 'name', v.name, 'status', v.status,
      'profileStatus', (SELECT p.status FROM public.vendor_profiles p WHERE p.organization_id = v.id),
      'portalOn', EXISTS (SELECT 1 FROM public.portal_access_grants g WHERE g.organization_id = v.id
        AND g.portal = 'vendor' AND g.state = 'active'),
      'activeMembers', (SELECT count(*)::integer FROM public.org_members m
        WHERE m.org_id = v.id AND m.status = 'active'),
      'pendingInvitations', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'invitationId', i.id, 'email', i.normalized_email,
          'expiresAt', pg_catalog.to_char(i.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          'expired', i.expires_at <= v_checked_at
        ) ORDER BY i.expires_at, i.id), '[]'::jsonb)
        FROM (SELECT * FROM public.invitations i0 WHERE i0.org_id = v.id AND i0.status = 'pending'
          AND NOT i0.migration_review_required ORDER BY i0.expires_at, i0.id LIMIT 20) i)
    ) ORDER BY lower(v.name), v.id), '[]'::jsonb) INTO v_rows FROM vendors v;
  RETURN jsonb_build_object('version', 1, 'items', v_rows - v_limit,
    'truncated', jsonb_array_length(v_rows) > v_limit);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_staff_vendor_directory(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_get_staff_vendor_directory(jsonb) TO authenticated;--> statement-breakpoint

-- Adds one pending vendor organization and its prospect vendor profile.
-- A repeated request replays. A second vendor with the same name is refused.
CREATE FUNCTION public.mmhr_create_staff_vendor(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; receipt jsonb; v_name text; v_org uuid; v_profile uuid;
  v_reason text := 'Add a vendor organization for MMHR onboarding';
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR NOT payload ? 'name'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE k <> 'name')
    OR jsonb_typeof(payload->'name') <> 'string'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid staff vendor input'; END IF;
  v_name := btrim(payload->>'name');
  IF length(v_name) NOT BETWEEN 1 AND 200 OR v_name ~ '[[:cntrl:]]'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid staff vendor input'; END IF;
  -- Locks security writes, checks AAL2, the live session, and admin.access.
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'admin.access', NULL::uuid, v_reason, correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'staff.vendor.create', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT o.id, p.id INTO v_org, v_profile FROM public.orgs o
    JOIN public.vendor_profiles p ON p.organization_id = o.id
    WHERE o.id = (receipt->>'entity_id')::uuid AND o.type = 'vendor';
    IF v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('organizationId', v_org, 'profileId', v_profile,
      'outcomeCode', 'replayed', 'correlationId', correlation_id);
  END IF;
  IF EXISTS (SELECT 1 FROM public.orgs o WHERE o.type = 'vendor' AND o.status <> 'archived'
    AND lower(btrim(o.name)) = lower(v_name))
  THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='Vendor name already exists'; END IF;

  INSERT INTO public.orgs(name, type, status, migration_review_required, created_at, updated_at)
    VALUES (v_name, 'vendor', 'pending', false, context.authorization_time, context.authorization_time)
    RETURNING id INTO v_org;
  INSERT INTO public.vendor_profiles(organization_id, status, created_by_identity_id, updated_by_identity_id,
    correlation_id, created_at, updated_at)
  VALUES (v_org, 'prospect', context.actor_identity_id, context.actor_identity_id,
    correlation_id, context.authorization_time, context.authorization_time) RETURNING id INTO v_profile;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'staff.vendor.create', 'staff.vendor.create', 'organization', v_org,
    v_org, v_reason, correlation_id, idempotency_key, payload, NULL::jsonb,
    jsonb_build_object('record_id', v_org, 'type', 'vendor', 'status', 'pending'),
    context.authorization_time);
  RETURN jsonb_build_object('organizationId', v_org, 'profileId', v_profile,
    'outcomeCode', 'created', 'correlationId', correlation_id);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_create_staff_vendor(jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_create_staff_vendor(jsonb, uuid, uuid) TO authenticated;--> statement-breakpoint

-- Turns on the vendor portal for one pending or active vendor organization.
-- An active grant is kept and returned; it is never duplicated.
CREATE FUNCTION public.mmhr_enable_staff_vendor_portal(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; receipt jsonb; v_org uuid; v_grant uuid;
  v_reason text := 'Turn on the vendor portal for MMHR vendor onboarding';
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR NOT payload ? 'organizationId'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE k <> 'organizationId')
    OR jsonb_typeof(payload->'organizationId') <> 'string'
    OR payload->>'organizationId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid staff vendor input'; END IF;
  v_org := (payload->>'organizationId')::uuid;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'admin.access', NULL::uuid, v_reason, correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'staff.vendor.portal.enable', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT g.id INTO v_grant FROM public.portal_access_grants g
    WHERE g.id = (receipt->>'entity_id')::uuid AND g.organization_id = v_org AND g.portal = 'vendor';
    IF v_grant IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('organizationId', v_org, 'grantId', v_grant,
      'outcomeCode', 'replayed', 'correlationId', correlation_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orgs o WHERE o.id = v_org AND o.type = 'vendor'
    AND o.status IN ('pending','active') AND NOT o.migration_review_required)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  SELECT g.id INTO v_grant FROM public.portal_access_grants g
  WHERE g.organization_id = v_org AND g.portal = 'vendor' AND g.state = 'active'
  ORDER BY g.created_at, g.id LIMIT 1;
  IF v_grant IS NOT NULL THEN
    RETURN jsonb_build_object('organizationId', v_org, 'grantId', v_grant,
      'outcomeCode', 'existing', 'correlationId', correlation_id);
  END IF;

  INSERT INTO public.portal_access_grants(organization_id, portal, issued_by_identity_id, issue_reason, created_at)
    VALUES (v_org, 'vendor', context.actor_identity_id, v_reason, context.authorization_time)
    RETURNING id INTO v_grant;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'staff.vendor.portal.enable', 'portal_access.grant', 'portal_access_grant', v_grant,
    v_org, v_reason, correlation_id, idempotency_key, payload, NULL::jsonb,
    jsonb_build_object('organization_id', v_org, 'portal', 'vendor', 'state', 'active'),
    context.authorization_time);
  RETURN jsonb_build_object('organizationId', v_org, 'grantId', v_grant,
    'outcomeCode', 'enabled', 'correlationId', correlation_id);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_enable_staff_vendor_portal(jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_enable_staff_vendor_portal(jsonb, uuid, uuid) TO authenticated;--> statement-breakpoint

-- Invites one organization_admin to a pending or active vendor organization.
-- Same expiry and invitation row shape as mmhr_create_invitation. A live
-- pending invitation for the same email is returned, not duplicated. An
-- expired pending one is marked expired before the new one is created.
-- Staff accounts cannot be invited, and nobody becomes a member here.
CREATE FUNCTION public.mmhr_invite_staff_vendor_admin(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; receipt jsonb; v_org uuid; v_email text; v_before jsonb := NULL;
  v_reason text := 'Invite the first vendor administrator for MMHR onboarding';
  invitation public.invitations%ROWTYPE;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR NOT payload ?& ARRAY['organizationId','email']
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE k <> ALL(ARRAY['organizationId','email']))
    OR jsonb_typeof(payload->'organizationId') <> 'string' OR jsonb_typeof(payload->'email') <> 'string'
    OR payload->>'organizationId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid staff vendor input'; END IF;
  v_org := (payload->>'organizationId')::uuid;
  v_email := lower(btrim(payload->>'email'));
  IF length(v_email) NOT BETWEEN 1 AND 254
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid staff vendor input'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'admin.access', NULL::uuid, v_reason, correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'staff.vendor.invite', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO invitation FROM public.invitations i
    WHERE i.id = (receipt->>'entity_id')::uuid AND i.org_id = v_org
      AND i.created_by_identity_id = context.actor_identity_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('organizationId', v_org, 'invitationId', invitation.id,
      'email', invitation.normalized_email,
      'expiresAt', pg_catalog.to_char(invitation.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'outcomeCode', 'replayed', 'correlationId', correlation_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orgs o WHERE o.id = v_org AND o.type = 'vendor'
    AND o.status IN ('pending','active') AND NOT o.migration_review_required)
    OR EXISTS (SELECT 1 FROM public.identities i JOIN public.platform_role_assignments a ON a.identity_id = i.id
      WHERE i.normalized_email = v_email)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  IF EXISTS (SELECT 1 FROM public.org_members m JOIN public.identities i ON i.id = m.identity_id
    WHERE m.org_id = v_org AND i.normalized_email = v_email AND m.status IN ('active','suspended'))
  THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='Vendor user is already a member'; END IF;

  SELECT * INTO invitation FROM public.invitations i
  WHERE i.org_id = v_org AND i.normalized_email = v_email
    AND i.status = 'pending' AND NOT i.migration_review_required
  FOR UPDATE;
  IF FOUND AND invitation.expires_at > context.authorization_time THEN
    RETURN jsonb_build_object('organizationId', v_org, 'invitationId', invitation.id,
      'email', invitation.normalized_email,
      'expiresAt', pg_catalog.to_char(invitation.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'outcomeCode', 'existing', 'correlationId', correlation_id);
  ELSIF FOUND THEN
    UPDATE public.invitations SET status = 'expired', updated_at = context.authorization_time
    WHERE id = invitation.id;
    v_before := jsonb_build_object('status', 'pending', 'record_id', invitation.id);
  END IF;

  INSERT INTO public.invitations (
    org_id, email, normalized_email, role, role_key, token, status,
    created_by_identity_id, expires_at, migration_review_required, created_at, updated_at
  ) VALUES (
    v_org, v_email, v_email, 'admin'::public.org_role, 'organization_admin', NULL, 'pending',
    context.actor_identity_id, context.authorization_time + interval '72 hours', false,
    context.authorization_time, context.authorization_time
  ) RETURNING * INTO invitation;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'staff.vendor.invite', 'staff.vendor.invite', 'invitation', invitation.id,
    v_org, v_reason, correlation_id, idempotency_key, payload, v_before,
    jsonb_build_object('status', 'pending', 'stable_key', 'organization_admin', 'record_id', invitation.id),
    context.authorization_time);
  RETURN jsonb_build_object('organizationId', v_org, 'invitationId', invitation.id,
    'email', invitation.normalized_email,
    'expiresAt', pg_catalog.to_char(invitation.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'outcomeCode', 'invited', 'correlationId', correlation_id);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_invite_staff_vendor_admin(jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_invite_staff_vendor_admin(jsonb, uuid, uuid) TO authenticated;--> statement-breakpoint

-- Copied from 0097 without change, except the organization status gate: a
-- pending vendor organization also lists a staff-issued first-admin invitation.
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
  INNER JOIN public.orgs AS organization ON organization.id = invitation.org_id
  WHERE invitation.normalized_email = (
      SELECT identity.normalized_email
      FROM public.identities AS identity
      WHERE identity.id = mmhr_private.r1_invitation_identity_id()
    )
    AND invitation.status = 'pending'
    AND NOT invitation.migration_review_required
    AND invitation.expires_at > CURRENT_TIMESTAMP
    AND (organization.status = 'active' OR organization.status = 'pending'
      AND organization.type = 'vendor' AND invitation.role_key = 'organization_admin'
      AND EXISTS (
        SELECT 1 FROM public.audit_events AS event
        WHERE event.entity_type = 'invitation' AND event.entity_id = invitation.id::text
          AND event.action = 'staff.vendor.invite' AND event.organization_id = organization.id
      ))
    AND NOT organization.migration_review_required
    AND NOT EXISTS (
      SELECT 1 FROM public.org_members AS membership
      WHERE membership.org_id = invitation.org_id
        AND membership.identity_id = mmhr_private.r1_invitation_identity_id()
        AND membership.status IN ('active', 'suspended')
    )
  ORDER BY invitation.expires_at, invitation.id
  LIMIT 100
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_my_invitations() FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_get_my_invitations() TO authenticated;--> statement-breakpoint

-- Copied from 0096 without change, except the first vendor administrator
-- path: a staff-issued organization_admin invitation to a pending vendor
-- organization is accepted only with a verified MFA factor, then activates
-- the organization in the same transaction, records the activation, and runs
-- the unchanged administration capacity check.
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
  activate_vendor boolean := false;
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
      AND (o.status <> 'active' OR o.migration_review_required)
      AND NOT (o.status = 'pending' AND o.type = 'vendor' AND NOT o.migration_review_required
        AND invitation.role_key = 'organization_admin' AND EXISTS (
          SELECT 1 FROM public.audit_events e WHERE e.entity_type = 'invitation'
            AND e.entity_id = invitation.id::text AND e.action = 'staff.vendor.invite'
            AND e.organization_id = o.id)))
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = invitation.org_id
      AND m.identity_id = actor AND m.status IN ('active','suspended'))
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  SELECT o.status = 'pending' INTO activate_vendor FROM public.orgs o WHERE o.id = invitation.org_id;
  IF activate_vendor AND NOT EXISTS (
    SELECT 1 FROM public.identities i JOIN auth.mfa_factors f ON f.user_id = i.auth_user_id
    WHERE i.id = actor AND f.status = 'verified'
  ) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Two-step sign-in required'; END IF;
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
  IF activate_vendor THEN
    UPDATE public.orgs SET status = 'active', activated_at = checked_at, updated_at = checked_at
    WHERE id = invitation.org_id AND status = 'pending';
    INSERT INTO public.audit_events (
      actor_type, actor_identity_id, organization_id, command, action, entity_type, entity_id,
      reason, correlation_id, idempotency_key, before_summary, after_summary, occurred_at
    ) VALUES (
      'user', actor, invitation.org_id, 'invitation.accept', 'organization.activate', 'organization',
      invitation.org_id::text, 'Activate the vendor organization with its first administrator',
      correlation_id, idempotency_key::text, jsonb_build_object('status','pending','type','vendor'),
      jsonb_build_object('status','active','type','vendor','record_id',member_id), checked_at
    );
    -- The new organization is now active. The unchanged check proves that its
    -- first administrator holds every required permission, or rolls back.
    PERFORM mmhr_private.r1_assert_administration_capacity(checked_at);
  END IF;
  RETURN mmhr_private.r1_invitation_result(invitation.id, 'accepted', 'accepted', correlation_id);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_accept_invitation(uuid,text,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_accept_invitation(uuid,text,uuid,uuid) TO authenticated;--> statement-breakpoint

-- Refuse a populated migration that breaks current administration capacity.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.security_bootstrap_state b
    WHERE b.state = 'consumed' AND b.second_target_identity_id IS NOT NULL)
  THEN PERFORM mmhr_private.r1_assert_administration_capacity(clock_timestamp()); END IF;
END
$$;
-- Recovery (forward repair; keep every row):
-- 1. REVOKE EXECUTE ON FUNCTION public.mmhr_get_staff_vendor_directory(jsonb),
--    public.mmhr_create_staff_vendor(jsonb,uuid,uuid),
--    public.mmhr_enable_staff_vendor_portal(jsonb,uuid,uuid),
--    public.mmhr_invite_staff_vendor_admin(jsonb,uuid,uuid) FROM authenticated;
-- 2. To stop the first-administrator path, apply a new migration that restores
--    the 0096 mmhr_accept_invitation body and the 0097 mmhr_get_my_invitations
--    body. Pending vendor organizations then stay pending and are not counted
--    by the capacity check.
-- 3. To withdraw one vendor setup, in a reviewed transaction: revoke its
--    pending invitations (status 'revoked' with revoked_at,
--    revoked_by_identity_id, and revoked_reason), revoke its vendor portal
--    grant, and archive the pending organization (status 'archived' with
--    archived_at). An organization that is already active follows the normal
--    organization status command instead.
-- 4. If an activated vendor organization loses its last capable
--    administrator, every security command fails the capacity check. Repair
--    it forward: suspend that organization through a reviewed transaction, or
--    restore a verified administrator with MFA. Never weaken the check.
