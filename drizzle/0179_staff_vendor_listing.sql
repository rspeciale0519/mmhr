ALTER TABLE "mmhr_private"."staff_case_access_grants" ALTER COLUMN "intake_id" DROP NOT NULL;--> statement-breakpoint
-- Staff vendor listing. Hand-written after the generated column change.
-- Product decision (owner, 2026-11-16): MMHR staff enter vendors. A vendor can
-- appear in customer comparisons before any vendor user signs in. Vendor users
-- join later, to read and answer an RFP.
-- Forward:
-- 1. mmhr_list_staff_vendor: an independent Super Admin with AAL2 and
--    audit.export moves one pending vendor organization to active, with a
--    reason. No vendor user is needed. The listing is audited and replays.
-- 2. mmhr_open_staff_vendor_workspace: staff with admin.access and AAL2 open an
--    audited viewer membership and grant on one active vendor organization,
--    like mmhr_open_staff_case. A vendor grant row has no intake.
-- 3. r1_evaluate_permission and r1_staff_case_access_is_active accept that
--    grant on customer and vendor organizations only, never internal ones. A
--    vendor grant never gives a portal permission (required_portal), so staff
--    are never vendor portal users, RFP notice recipients, or responders.
-- 4. r1_assert_administration_capacity exempts a listed vendor until a vendor
--    user joins: only staff vendor grant viewers may be members, in any status.
-- 5. mmhr_accept_invitation sends the first vendor user of a listed vendor
--    through the 0177 first-administrator path: staff-issued
--    organization_admin invitation, verified MFA factor, then the unchanged
--    capacity check. Later vendor users join through the normal path.
-- 6. mmhr_get_staff_vendor_directory counts only vendor users as members and
--    reports caller access and listing authority.
-- Catalog eligibility (r3_approved_vendor_inputs) is unchanged: the vendor must
-- be active with activated_at <= as_of, and the profile, product, evidence, and
-- review approvals still apply.
-- Customers and vendors gain nothing: every changed evaluator branch needs an
-- active platform role, and every new RPC needs admin.access with AAL2.
-- No email is sent.
-- Recovery: see the end of this file. Do not delete organizations, grants,
-- memberships, invitations, receipts, or audit events.
SELECT mmhr_private.r1_lock_security();--> statement-breakpoint

-- Copied from 0175 without change, except the organization gate: a customer
-- grant names an intake, a vendor grant has none.
CREATE OR REPLACE FUNCTION mmhr_private.r1_staff_case_access_is_active(p_identity_id uuid, p_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM mmhr_private.staff_case_access_grants g
    JOIN public.org_members m ON m.id = g.membership_id AND m.org_id = g.organization_id
      AND m.identity_id = g.identity_id AND m.status = 'active' AND m.role_key = 'viewer'
    JOIN public.orgs o ON o.id = g.organization_id
      AND (o.type = 'customer' AND g.intake_id IS NOT NULL OR o.type = 'vendor' AND g.intake_id IS NULL)
    WHERE g.identity_id = $1 AND g.organization_id = $2 AND g.state = 'active'
  )
$$;--> statement-breakpoint

-- Copied from 0176 without change, except the staff grant gate: it also
-- accepts a vendor grant on a vendor organization, never for a portal
-- permission, and binds the grant kind to the organization type.
CREATE OR REPLACE FUNCTION mmhr_private.r1_evaluate_permission(
  target_identity_id uuid, requested_permission_key text, selected_organization_id uuid,
  current_assurance text, authorization_time timestamptz, durable boolean DEFAULT false,
  visited uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  definition public.permission_definitions%ROWTYPE;
  platform_role_id uuid;
  platform_assignment_id uuid;
  organization_role_id uuid;
  organization_type text;
  matching_deny boolean;
  matching_allow boolean;
BEGIN
  IF authorization_time IS NULL OR durable IS NULL OR visited IS NULL
    OR current_assurance IS NULL OR current_assurance NOT IN ('aal1','aal2')
    OR NOT mmhr_private.r1_verified_identity(target_identity_id, false)
    OR NOT mmhr_private.r1_scope_supported(requested_permission_key, selected_organization_id)
  THEN RETURN false; END IF;
  SELECT * INTO definition FROM public.permission_definitions d WHERE d.key = requested_permission_key;
  IF definition.minimum_assurance = 'aal2' AND (
    current_assurance <> 'aal2' OR NOT mmhr_private.r1_verified_identity(target_identity_id, true)
  ) THEN RETURN false; END IF;

  SELECT r.id,a.id INTO platform_role_id,platform_assignment_id
  FROM public.platform_role_assignments a JOIN public.role_definitions r
    ON r.stable_key = a.role_key AND r.kind = 'platform' AND r.state = 'active'
  WHERE a.identity_id = target_identity_id AND a.state = 'active';
  IF platform_role_id IS NULL AND EXISTS (
    SELECT 1 FROM public.platform_role_assignments a WHERE a.identity_id = target_identity_id
  ) THEN RETURN false; END IF;
  IF definition.internal_only AND platform_role_id IS NULL THEN RETURN false; END IF;

  -- Unsupported legacy records remain visible to owner review. They cannot
  -- become a new grant through role fallback or by silently dropping a deny.
  IF EXISTS (
    SELECT 1 FROM public.user_permission_overrides o
    WHERE o.identity_id = target_identity_id AND o.permission_key = requested_permission_key
      AND o.state = 'active' AND (o.expires_at IS NULL OR o.expires_at > authorization_time)
      AND NOT mmhr_private.r1_scope_supported(o.permission_key, o.organization_id)
  ) THEN RETURN false; END IF;

  IF selected_organization_id IS NULL THEN
    IF platform_role_id IS NULL THEN RETURN false; END IF;
  ELSE
    SELECT org.type::text, r.id INTO organization_type, organization_role_id
    FROM public.org_members m JOIN public.orgs org ON org.id = m.org_id
      AND org.status = 'active' AND NOT org.migration_review_required
    LEFT JOIN public.role_definitions r ON r.stable_key = m.role_key
      AND r.kind = 'organization' AND r.state = 'active'
    WHERE m.identity_id = target_identity_id AND m.org_id = selected_organization_id
      AND m.status = 'active' AND NOT m.migration_review_required;
    IF NOT FOUND OR (organization_type = 'internal' AND platform_role_id IS NULL) THEN RETURN false; END IF;
    IF organization_type <> 'internal' AND platform_role_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.user_permission_overrides o
      WHERE o.identity_id = target_identity_id AND o.permission_key = 'workspace.access'
        AND o.organization_id = selected_organization_id AND o.scope_kind = 'organization'
        AND mmhr_private.r1_override_allow_is_valid(o.id, authorization_time, durable, visited)
    ) THEN
      -- Read only after the override check fails. Same rule as
      -- mmhr_private.r1_staff_case_access_is_active, written inline.
      -- A vendor grant never gives a portal permission, so staff never act
      -- as the vendor, receive its RFP notices, or answer its RFPs.
      IF NOT (organization_type = 'customer'
          OR organization_type = 'vendor' AND definition.required_portal IS NULL) OR NOT EXISTS (
        SELECT 1 FROM mmhr_private.staff_case_access_grants g
        JOIN public.org_members gm ON gm.id = g.membership_id AND gm.org_id = g.organization_id
          AND gm.identity_id = g.identity_id AND gm.status = 'active' AND gm.role_key = 'viewer'
        WHERE g.identity_id = target_identity_id AND g.organization_id = selected_organization_id
          AND g.state = 'active' AND (g.intake_id IS NULL) = (organization_type = 'vendor')
      ) THEN RETURN false; END IF;
    END IF;
    -- A staff member bound to a vendor workspace grant is never the vendor,
    -- even with a workspace.access override on the same organization.
    IF organization_type = 'vendor' AND platform_role_id IS NOT NULL
      AND definition.required_portal IS NOT NULL AND EXISTS (
        SELECT 1 FROM mmhr_private.staff_case_access_grants g
        WHERE g.identity_id = target_identity_id AND g.organization_id = selected_organization_id
          AND g.intake_id IS NULL
      ) THEN RETURN false; END IF;
    IF definition.required_portal IS NOT NULL AND (
      organization_type <> definition.required_portal::text OR NOT EXISTS (
        SELECT 1 FROM public.portal_access_grants g WHERE g.organization_id = selected_organization_id
          AND g.portal = definition.required_portal AND g.state = 'active'
      )
    ) THEN RETURN false; END IF;
  END IF;

  IF selected_organization_id IS NOT NULL THEN
    IF requested_permission_key <> 'workspace.access' AND NOT
      mmhr_private.r1_evaluate_permission(target_identity_id, 'workspace.access',
        selected_organization_id, current_assurance, authorization_time, durable, visited)
    THEN RETURN false; END IF;
    IF definition.internal_only AND NOT
      mmhr_private.r1_evaluate_permission(target_identity_id, 'admin.access',
        NULL::uuid, current_assurance, authorization_time, durable, visited)
    THEN RETURN false; END IF;
  ELSIF requested_permission_key = 'admin.access' THEN
    IF NOT mmhr_private.r1_evaluate_permission(target_identity_id, 'workspace.access',
      NULL::uuid, current_assurance, authorization_time, durable, visited)
    THEN RETURN false; END IF;
  ELSIF requested_permission_key <> 'workspace.access' THEN
    IF NOT mmhr_private.r1_evaluate_permission(target_identity_id, 'admin.access',
      NULL::uuid, current_assurance, authorization_time, durable, visited)
    THEN RETURN false; END IF;
  END IF;

  IF NOT mmhr_private.r1_override_deny_guards_are_valid(target_identity_id,requested_permission_key,
    selected_organization_id,authorization_time,durable,visited)
  THEN RETURN false; END IF;

  SELECT bool_or(o.effect = 'deny'), bool_or(
    o.effect = 'allow' AND o.organization_id IS NOT DISTINCT FROM selected_organization_id
    AND mmhr_private.r1_override_allow_is_valid(o.id, authorization_time, durable, visited)
  ) INTO matching_deny, matching_allow
  FROM public.user_permission_overrides o
  WHERE o.identity_id = target_identity_id AND o.permission_key = requested_permission_key
    AND o.state = 'active' AND (o.expires_at IS NULL OR o.expires_at > authorization_time)
    AND (o.scope_kind = 'platform' OR o.organization_id = selected_organization_id);
  IF coalesce(matching_deny, false) THEN RETURN false; END IF;
  IF coalesce(matching_allow, false) THEN RETURN true; END IF;
  IF NOT mmhr_private.r1_role_revocation_guards_are_valid(target_identity_id,requested_permission_key,
    selected_organization_id,authorization_time,durable,visited)
  THEN RETURN false; END IF;
  IF NOT mmhr_private.r1_role_deny_guard_is_valid(platform_role_id,requested_permission_key,
      selected_organization_id,authorization_time,durable,visited)
    OR NOT mmhr_private.r1_role_deny_guard_is_valid(organization_role_id,requested_permission_key,
      selected_organization_id,authorization_time,durable,visited)
  THEN RETURN false; END IF;
  SELECT bool_or(d.effect = 'deny'), bool_or(d.effect = 'allow'
    AND mmhr_private.r1_role_authority_allows(mmhr_private.r1_current_role_authority(d.role_definition_id),
      requested_permission_key,selected_organization_id,'allow',authorization_time,durable,visited)
    AND (d.role_definition_id IS DISTINCT FROM platform_role_id
      OR mmhr_private.r1_assignment_authority_allows(platform_assignment_id,requested_permission_key,
        selected_organization_id,authorization_time,durable,visited)))
    INTO matching_deny, matching_allow
  FROM public.role_permission_defaults d
  WHERE d.permission_key = requested_permission_key
    AND d.role_definition_id IN (platform_role_id, organization_role_id);
  RETURN NOT coalesce(matching_deny, false) AND coalesce(matching_allow, false);
END
$$;--> statement-breakpoint

-- Copied from 0175 without change, except the listed vendor exemption.
CREATE OR REPLACE FUNCTION mmhr_private.r1_assert_administration_capacity(authorization_time timestamptz)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  bootstrap public.security_bootstrap_state%ROWTYPE;
  bound_identity uuid;
  organization_id uuid;
BEGIN
  SELECT * INTO bootstrap FROM public.security_bootstrap_state b WHERE b.singleton_key = 1;
  IF NOT FOUND OR bootstrap.state <> 'consumed' OR bootstrap.second_target_identity_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  FOREACH bound_identity IN ARRAY ARRAY[bootstrap.target_identity_id, bootstrap.second_target_identity_id]
  LOOP
    IF NOT mmhr_private.r1_is_super_admin(bound_identity) OR EXISTS (
      SELECT 1 FROM unnest(ARRAY[
        'workspace.access','admin.access','identity.status.change','identity.relink',
        'identity.recovery.request','identity.recovery.approve','org.status.change','org.type.change',
        'platform_roles.assign','platform_roles.revoke','role_versions.activate',
        'permissions.view','permissions.grant','permissions.revoke','permissions.delegate',
        'audit.view','audit.export','audit.change_summary.read'
      ]) AS required(key)
      WHERE NOT mmhr_private.r1_evaluate_permission(bound_identity, required.key,
        NULL::uuid, 'aal2', authorization_time, true)
    ) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  END LOOP;
  FOR organization_id IN SELECT o.id FROM public.orgs o WHERE o.status = 'active' AND NOT EXISTS (
      SELECT 1 FROM public.customer_registrations c WHERE c.organization_id=o.id
        AND o.type='customer' AND NOT o.migration_review_required
        AND NOT EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id=o.id
          AND (m.identity_id<>c.identity_id OR m.role_key<>'contributor')
          -- A staff viewer bound to a recorded case grant keeps the exemption.
          -- The binding stays after revocation; the evaluator then denies it.
          AND NOT (m.identity_id<>c.identity_id AND m.role_key='viewer' AND EXISTS (
            SELECT 1 FROM mmhr_private.staff_case_access_grants g
            WHERE g.membership_id=m.id AND g.organization_id=o.id AND g.identity_id=m.identity_id)))
        AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides p
          WHERE p.organization_id=o.id AND p.state='active' AND p.effect='allow')
    )
    -- A listed vendor that no vendor user has joined needs no administrator
    -- yet. Only staff viewers bound to a vendor workspace grant may be
    -- members, in any status. Any other member ends the exemption.
    AND NOT (o.type = 'vendor' AND NOT o.migration_review_required
      AND EXISTS (SELECT 1 FROM public.audit_events e WHERE e.entity_type = 'organization'
        AND e.entity_id = o.id::text AND e.action = 'staff.vendor.list' AND e.organization_id = o.id)
      AND NOT EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = o.id
        AND NOT (m.role_key = 'viewer' AND EXISTS (
          SELECT 1 FROM mmhr_private.staff_case_access_grants g
          WHERE g.membership_id = m.id AND g.organization_id = o.id
            AND g.identity_id = m.identity_id AND g.intake_id IS NULL)))
      AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides p
        WHERE p.organization_id = o.id AND p.state = 'active' AND p.effect = 'allow'))
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = organization_id AND m.status = 'active'
        AND m.role_key = 'organization_admin' AND NOT m.migration_review_required
        AND mmhr_private.r1_verified_identity(m.identity_id, true)
        AND NOT EXISTS (
          SELECT 1 FROM unnest(ARRAY[
            'workspace.access','org.name.read','member.role.read','member.role.update',
            'org.members.view','org.members.invite','org.members.change_role',
            'org.members.status.change','org.members.revoke','audit.view'
          ]) AS required(key)
          WHERE NOT mmhr_private.r1_evaluate_permission(m.identity_id, required.key,
            organization_id, 'aal2', authorization_time, true)
        )
    ) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  END LOOP;
END
$$;--> statement-breakpoint

-- Copied from 0177 without change, except the first vendor user of a listed
-- vendor: staff-issued organization_admin invitation, verified MFA factor,
-- then the capacity check.
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
  first_vendor_admin boolean := false;
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
  -- A listed vendor that no vendor user has joined takes the same first
  -- administrator path, without a status change.
  SELECT o.status = 'active' AND o.type = 'vendor' AND NOT EXISTS (
      SELECT 1 FROM public.org_members m WHERE m.org_id = o.id
        AND NOT (m.role_key = 'viewer' AND EXISTS (
          SELECT 1 FROM mmhr_private.staff_case_access_grants g
          WHERE g.membership_id = m.id AND g.organization_id = o.id
            AND g.identity_id = m.identity_id AND g.intake_id IS NULL)))
    INTO first_vendor_admin FROM public.orgs o WHERE o.id = invitation.org_id;
  IF first_vendor_admin AND NOT (invitation.role_key = 'organization_admin' AND EXISTS (
      SELECT 1 FROM public.audit_events e WHERE e.entity_type = 'invitation'
        AND e.entity_id = invitation.id::text AND e.action = 'staff.vendor.invite'
        AND e.organization_id = invitation.org_id))
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  IF (activate_vendor OR first_vendor_admin) AND NOT EXISTS (
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
  IF first_vendor_admin THEN
    -- The listed vendor now has a vendor user, so it leaves the capacity
    -- exemption. The unchanged check proves the new administrator is capable.
    PERFORM mmhr_private.r1_assert_administration_capacity(checked_at);
  END IF;
  RETURN mmhr_private.r1_invitation_result(invitation.id, 'accepted', 'accepted', correlation_id);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_accept_invitation(uuid,text,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_accept_invitation(uuid,text,uuid,uuid) TO authenticated;--> statement-breakpoint

-- Copied from 0177 without change, except: activeMembers excludes staff grant
-- memberships, and the result adds callerHasAccess and callerCanList.
CREATE OR REPLACE FUNCTION public.mmhr_get_staff_vendor_directory(payload jsonb)
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
        WHERE m.org_id = v.id AND m.status = 'active' AND NOT EXISTS (
          SELECT 1 FROM mmhr_private.staff_case_access_grants g
          WHERE g.membership_id = m.id AND g.organization_id = v.id)),
      'callerHasAccess', v.status = 'active' AND mmhr_private.r1_evaluate_permission(v_actor,
        'workspace.access', v.id, 'aal2', v_checked_at, false),
      'pendingInvitations', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'invitationId', i.id, 'email', i.normalized_email,
          'expiresAt', pg_catalog.to_char(i.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          'expired', i.expires_at <= v_checked_at
        ) ORDER BY i.expires_at, i.id), '[]'::jsonb)
        FROM (SELECT * FROM public.invitations i0 WHERE i0.org_id = v.id AND i0.status = 'pending'
          AND NOT i0.migration_review_required ORDER BY i0.expires_at, i0.id LIMIT 20) i)
    ) ORDER BY lower(v.name), v.id), '[]'::jsonb) INTO v_rows FROM vendors v;
  RETURN jsonb_build_object('version', 1, 'items', v_rows - v_limit,
    'truncated', jsonb_array_length(v_rows) > v_limit,
    'callerCanList', mmhr_private.r1_is_super_admin(v_actor)
      AND coalesce(mmhr_private.r1_request_has_permission('audit.export',NULL::uuid),false));
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_staff_vendor_directory(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_get_staff_vendor_directory(jsonb) TO authenticated;--> statement-breakpoint

-- Lists one pending vendor organization for customer comparisons. Only an
-- independent Super Admin with AAL2 may list. The vendor needs no user.
CREATE FUNCTION public.mmhr_list_staff_vendor(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; receipt jsonb; v_org uuid; v_reason text; v_activated timestamptz;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR NOT payload ?& ARRAY['organizationId','reason']
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE k <> ALL(ARRAY['organizationId','reason']))
    OR jsonb_typeof(payload->'organizationId') <> 'string' OR jsonb_typeof(payload->'reason') <> 'string'
    OR payload->>'organizationId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid staff vendor input'; END IF;
  v_org := (payload->>'organizationId')::uuid;
  v_reason := btrim(payload->>'reason');
  IF length(v_reason) NOT BETWEEN 1 AND 500 OR v_reason ~ '[[:cntrl:]]'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid staff vendor input'; END IF;
  -- Locks security writes, checks AAL2, the live session, and audit.export,
  -- which also needs admin.access. Overrides can give audit.export to other
  -- staff, so the independent Super Admin check follows.
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'audit.export', NULL::uuid, v_reason, correlation_id, idempotency_key);
  IF NOT mmhr_private.r1_is_super_admin(context.actor_identity_id)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'staff.vendor.list', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT o.activated_at INTO v_activated FROM public.orgs o
    WHERE o.id = (receipt->>'entity_id')::uuid AND o.id = v_org AND o.type = 'vendor';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('organizationId', v_org,
      'activatedAt', pg_catalog.to_char(v_activated AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'outcomeCode', 'replayed', 'correlationId', correlation_id);
  END IF;
  PERFORM 1 FROM public.orgs o WHERE o.id = v_org AND o.type = 'vendor' AND o.status = 'pending'
    AND NOT o.migration_review_required FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;

  -- The vendor is still pending here, so the capacity check inside the finish
  -- step skips it. The finish step writes the listing audit event. The check
  -- runs again after activation and accepts the vendor only through that event.
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'staff.vendor.list', 'staff.vendor.list', 'organization', v_org,
    v_org, v_reason, correlation_id, idempotency_key, payload,
    jsonb_build_object('status', 'pending', 'type', 'vendor'),
    jsonb_build_object('status', 'active', 'type', 'vendor', 'record_id', v_org),
    context.authorization_time);
  UPDATE public.orgs SET status = 'active', activated_at = context.authorization_time,
    updated_at = context.authorization_time
  WHERE id = v_org AND status = 'pending';
  PERFORM mmhr_private.r1_assert_administration_capacity(context.authorization_time);
  RETURN jsonb_build_object('organizationId', v_org,
    'activatedAt', pg_catalog.to_char(context.authorization_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'outcomeCode', 'listed', 'correlationId', correlation_id);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_list_staff_vendor(jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_list_staff_vendor(jsonb, uuid, uuid) TO authenticated;--> statement-breakpoint

-- Opens one active vendor workspace for the verified staff caller, like
-- mmhr_open_staff_case. Repeats never duplicate membership or grants. Revoked
-- or unexpected prior access is never reissued.
CREATE FUNCTION public.mmhr_open_staff_vendor_workspace(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; receipt jsonb; v_org uuid; v_subject uuid; v_membership uuid;
  v_reason text := 'Open a listed vendor workspace for MMHR catalog entry';
  grant_row mmhr_private.staff_case_access_grants%ROWTYPE;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR NOT payload ? 'organizationId'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE k <> 'organizationId')
    OR jsonb_typeof(payload->'organizationId') <> 'string'
    OR payload->>'organizationId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid staff vendor input'; END IF;
  v_org := (payload->>'organizationId')::uuid;
  -- Locks security writes, checks AAL2, the live session, and admin.access.
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'admin.access', NULL::uuid, v_reason, correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'staff.vendor.workspace.open', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO grant_row FROM mmhr_private.staff_case_access_grants g
    WHERE g.id = (receipt->>'entity_id')::uuid AND g.identity_id = context.actor_identity_id
      AND g.organization_id = v_org AND g.intake_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('organizationId', v_org, 'grantId', grant_row.id,
      'outcomeCode', 'replayed', 'correlationId', correlation_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orgs o WHERE o.id = v_org AND o.type = 'vendor'
    AND o.status = 'active' AND NOT o.migration_review_required)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;

  IF mmhr_private.r1_evaluate_permission(context.actor_identity_id, 'workspace.access', v_org,
      'aal2', context.authorization_time, false) THEN
    SELECT * INTO grant_row FROM mmhr_private.staff_case_access_grants g
    WHERE g.organization_id = v_org AND g.identity_id = context.actor_identity_id AND g.state = 'active';
    RETURN jsonb_build_object('organizationId', v_org, 'grantId', grant_row.id,
      'outcomeCode', 'existing', 'correlationId', correlation_id);
  END IF;
  IF EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = v_org AND m.identity_id = context.actor_identity_id)
    OR EXISTS (SELECT 1 FROM public.user_permission_overrides p WHERE p.organization_id = v_org
      AND p.identity_id = context.actor_identity_id AND p.state = 'active')
    OR EXISTS (SELECT 1 FROM mmhr_private.staff_case_access_grants g WHERE g.organization_id = v_org
      AND g.identity_id = context.actor_identity_id)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;

  SELECT i.auth_user_id INTO v_subject FROM public.identities i WHERE i.id = context.actor_identity_id;
  INSERT INTO public.org_members(org_id, identity_id, user_id, role, role_key, status, migration_review_required)
    VALUES (v_org, context.actor_identity_id, v_subject, 'viewer', 'viewer', 'active', false)
    RETURNING id INTO v_membership;
  INSERT INTO mmhr_private.staff_case_access_grants(organization_id, identity_id, membership_id,
    intake_id, state, reason, correlation_id, opened_at)
  VALUES (v_org, context.actor_identity_id, v_membership, NULL, 'active', v_reason,
    correlation_id, context.authorization_time) RETURNING * INTO grant_row;
  -- The check runs after the insert so the transaction rolls back on denial.
  IF NOT mmhr_private.r1_evaluate_permission(context.actor_identity_id, 'workspace.access', v_org,
      'aal2', context.authorization_time, false)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'staff.vendor.workspace.open', 'staff.vendor.workspace.open',
    'staff_case_access', grant_row.id, v_org, v_reason, correlation_id, idempotency_key, payload, NULL::jsonb,
    jsonb_build_object('record_id', grant_row.id, 'identity_id', context.actor_identity_id,
      'organization_id', v_org, 'type', 'vendor', 'stable_key', 'viewer', 'state', 'active'),
    context.authorization_time);
  RETURN jsonb_build_object('organizationId', v_org, 'grantId', grant_row.id,
    'outcomeCode', 'opened', 'correlationId', correlation_id);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_open_staff_vendor_workspace(jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_open_staff_vendor_workspace(jsonb, uuid, uuid) TO authenticated;--> statement-breakpoint

-- Refuse a populated migration that breaks current administration capacity.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.security_bootstrap_state b
    WHERE b.state = 'consumed' AND b.second_target_identity_id IS NOT NULL)
  THEN PERFORM mmhr_private.r1_assert_administration_capacity(clock_timestamp()); END IF;
END
$$;
-- Recovery (forward repair; keep every row):
-- 1. REVOKE EXECUTE ON FUNCTION public.mmhr_list_staff_vendor(jsonb,uuid,uuid),
--    public.mmhr_open_staff_vendor_workspace(jsonb,uuid,uuid) FROM authenticated;
-- 2. To end one vendor workspace access, set its grant to state 'revoked' with
--    revoked_at and revoked_reason in a reviewed transaction. The evaluator
--    then denies it. The viewer membership stays bound to the grant.
-- 3. To remove the vendor branch, apply a new migration that first revokes
--    every vendor grant (intake_id IS NULL) and its viewer membership, then
--    restores the customer-only conditions: the 0176 r1_evaluate_permission
--    body, the 0175 r1_staff_case_access_is_active and
--    r1_assert_administration_capacity bodies, and the 0177
--    mmhr_accept_invitation and mmhr_get_staff_vendor_directory bodies.
--    Restore the NOT NULL on intake_id only when no vendor grant row remains.
-- 4. Restoring the 0175 capacity body while a listed vendor has no capable
--    administrator makes every security command fail. Before that step,
--    suspend each listed vendor that has no administrator through a reviewed
--    transaction, or let its first administrator join with MFA.
-- 5. A listed vendor goes back out of comparisons through the normal
--    organization status command (suspend or archive). Never weaken the
--    capacity check.
