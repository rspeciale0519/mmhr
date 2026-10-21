ALTER TABLE "permission_definitions" ADD COLUMN "platform_scope" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "permission_definitions" ADD COLUMN "organization_scope" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "permission_definitions" ADD COLUMN "minimum_assurance" text DEFAULT 'aal2' NOT NULL;--> statement-breakpoint
ALTER TABLE "permission_definitions" ADD COLUMN "internal_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "permission_definitions" ADD COLUMN "required_portal" "portal_kind";--> statement-breakpoint
ALTER TABLE "permission_definitions" ADD CONSTRAINT "permission_definitions_assurance_ck" CHECK ("permission_definitions"."minimum_assurance" in ('aal1', 'aal2'));--> statement-breakpoint
ALTER TABLE "permission_definitions" ADD CONSTRAINT "permission_definitions_portal_scope_ck" CHECK ("permission_definitions"."required_portal" is null or ("permission_definitions"."organization_scope" and not "permission_definitions"."platform_scope"));
--> statement-breakpoint

-- The reviewed literals are the database half of the typed R1 registry.
-- Stored metadata drift denies access; it cannot lower the fixed AAL or scope.
CREATE FUNCTION mmhr_private.r1_permission_registry()
RETURNS TABLE (
  key text, kind text, description text, platform_scope boolean,
  organization_scope boolean, minimum_assurance text,
  internal_only boolean, required_portal text
)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  VALUES
    ('workspace.access', 'feature', 'Access an authorized workspace.', true, true, 'aal1', false, NULL),
    ('admin.access', 'feature', 'Access the internal administration workspace.', true, false, 'aal2', true, NULL),
    ('portal.customer.access', 'feature', 'Access an authorized customer portal.', false, true, 'aal1', false, 'customer'),
    ('portal.vendor.access', 'feature', 'Access an authorized vendor portal.', false, true, 'aal1', false, 'vendor'),
    ('org.members.view', 'action', 'Read authorized organization members.', false, true, 'aal2', false, NULL),
    ('org.members.invite', 'action', 'Invite members to an authorized organization.', false, true, 'aal2', false, NULL),
    ('org.members.change_role', 'action', 'Change an authorized organization membership role.', false, true, 'aal2', false, NULL),
    ('org.members.revoke', 'action', 'Revoke an authorized organization membership.', false, true, 'aal2', false, NULL),
    ('org.members.status.change', 'action', 'Activate or suspend an authorized organization membership.', false, true, 'aal2', false, NULL),
    ('identity.status.change', 'action', 'Change identity status through an audited command.', true, false, 'aal2', true, NULL),
    ('identity.relink', 'action', 'Request an approved two-person identity relink.', true, false, 'aal2', true, NULL),
    ('identity.recovery.request', 'action', 'Request approved identity recovery.', true, false, 'aal2', true, NULL),
    ('identity.recovery.approve', 'action', 'Approve identity recovery within the named recovery pair.', true, false, 'aal2', true, NULL),
    ('org.status.change', 'action', 'Change organization status through an audited command.', true, false, 'aal2', true, NULL),
    ('org.type.change', 'action', 'Change organization type through an audited command.', true, false, 'aal2', true, NULL),
    ('platform_roles.assign', 'action', 'Assign an authorized platform role.', true, false, 'aal2', true, NULL),
    ('platform_roles.revoke', 'action', 'Revoke an authorized platform role.', true, false, 'aal2', true, NULL),
    ('role_versions.activate', 'action', 'Activate an approved role version.', true, false, 'aal2', true, NULL),
    ('permissions.view', 'action', 'Read permissions within the active delegation ceiling.', true, true, 'aal2', false, NULL),
    ('permissions.grant', 'action', 'Grant permissions within the active delegation ceiling.', true, true, 'aal2', false, NULL),
    ('permissions.revoke', 'action', 'Revoke permissions within the active delegation ceiling.', true, true, 'aal2', false, NULL),
    ('permissions.delegate', 'action', 'Delegate permissions within the active delegation ceiling.', true, true, 'aal2', true, NULL),
    ('portal.access.grant', 'action', 'Grant access to an authorized organization portal.', false, true, 'aal2', true, NULL),
    ('portal.access.revoke', 'action', 'Revoke access to an authorized organization portal.', false, true, 'aal2', true, NULL),
    ('audit.view', 'action', 'Read authorized audit event metadata.', true, true, 'aal2', false, NULL),
    ('audit.export', 'action', 'Export authorized audit events through an audited command.', true, true, 'aal2', false, NULL),
    ('org.name.read', 'field', 'Read an authorized organization name.', false, true, 'aal1', false, NULL),
    ('member.role.read', 'field', 'Read an authorized membership role.', false, true, 'aal1', false, NULL),
    ('member.role.update', 'field', 'Update an authorized membership role field.', false, true, 'aal2', false, NULL),
    ('audit.change_summary.read', 'field', 'Read an authorized redacted audit change summary.', true, true, 'aal2', false, NULL)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r1_permission_registry() FROM PUBLIC, anon, authenticated, mmhr_worker;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_sync_permission_registry()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted_count integer;
BEGIN
  LOCK TABLE public.permission_definitions IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (
    SELECT 1 FROM public.permission_definitions AS stored
    LEFT JOIN mmhr_private.r1_permission_registry() AS expected ON expected.key = stored.key
    WHERE expected.key IS NULL
      OR ROW(stored.kind::text, stored.description, stored.platform_scope,
        stored.organization_scope, stored.minimum_assurance, stored.internal_only,
        stored.required_portal::text, stored.active, stored.retired_at)
      IS DISTINCT FROM ROW(expected.kind, expected.description, expected.platform_scope,
        expected.organization_scope, expected.minimum_assurance, expected.internal_only,
        expected.required_portal, true, NULL::timestamptz)
  ) THEN
    RAISE EXCEPTION 'Permission registry differs from the reviewed definitions';
  END IF;

  INSERT INTO public.permission_definitions (
    key, kind, description, platform_scope, organization_scope,
    minimum_assurance, internal_only, required_portal
  )
  SELECT key, kind::public.permission_kind, description, platform_scope,
    organization_scope, minimum_assurance, internal_only,
    required_portal::public.portal_kind
  FROM mmhr_private.r1_permission_registry()
  ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count > 0 THEN
    INSERT INTO public.audit_events (
      actor_type, actor_reference, command, action, entity_type,
      entity_id, reason, correlation_id
    ) VALUES (
      'migration', 'r1.4-permission-registry', 'permissions.synchronize',
      'permission_registry.sync', 'permission_registry', 'r1.4-v1',
      'Synchronize the reviewed R1 permission definitions', gen_random_uuid()
    );
  END IF;
  RETURN inserted_count;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r1_sync_permission_registry() FROM PUBLIC, anon, authenticated, mmhr_worker;--> statement-breakpoint
SELECT mmhr_private.r1_sync_permission_registry();--> statement-breakpoint

-- Parent-row locking makes default changes serialize with role approval.
-- The row lock also rejects stale REPEATABLE READ writers after an approval.
CREATE OR REPLACE FUNCTION mmhr_private.r1_protect_role_permission_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  old_role_id uuid;
  new_role_id uuid;
  role_row record;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN old_role_id := OLD.role_definition_id; END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN new_role_id := NEW.role_definition_id; END IF;
  FOR role_row IN
    SELECT id, state FROM public.role_definitions
    WHERE id IN (old_role_id, new_role_id)
    ORDER BY id FOR UPDATE
  LOOP
    IF role_row.state <> 'draft' THEN
      RAISE EXCEPTION 'Permission defaults require a draft role definition';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

-- Version one remains approved and unchanged for an audited rollback.
-- This migration creates no identity, membership, or platform assignment.
DO $$
BEGIN
  IF 6 <> (
    SELECT count(*) FROM public.role_definitions
    WHERE stable_key IN ('super_admin', 'admin', 'staff',
      'organization_admin', 'contributor', 'viewer')
      AND version = 1 AND state = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.role_definitions
    WHERE stable_key IN ('super_admin', 'admin', 'staff',
      'organization_admin', 'contributor', 'viewer') AND version = 2
  ) THEN
    RAISE EXCEPTION 'R1 role versions need review before permission migration';
  END IF;
END
$$;--> statement-breakpoint

INSERT INTO public.role_definitions (
  stable_key, version, kind, display_name, description
)
SELECT stable_key, 2, kind, display_name, description
FROM public.role_definitions
WHERE version = 1 AND state = 'active'
  AND stable_key IN ('super_admin', 'admin', 'staff',
    'organization_admin', 'contributor', 'viewer');--> statement-breakpoint

INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
SELECT role.id, defaults.permission_key, 'allow'
FROM (VALUES
    ('super_admin', 'workspace.access'),
    ('super_admin', 'admin.access'),
    ('super_admin', 'portal.customer.access'),
    ('super_admin', 'portal.vendor.access'),
    ('super_admin', 'org.members.view'),
    ('super_admin', 'org.members.invite'),
    ('super_admin', 'org.members.change_role'),
    ('super_admin', 'org.members.revoke'),
    ('super_admin', 'org.members.status.change'),
    ('super_admin', 'identity.status.change'),
    ('super_admin', 'identity.relink'),
    ('super_admin', 'identity.recovery.request'),
    ('super_admin', 'identity.recovery.approve'),
    ('super_admin', 'org.status.change'),
    ('super_admin', 'org.type.change'),
    ('super_admin', 'platform_roles.assign'),
    ('super_admin', 'platform_roles.revoke'),
    ('super_admin', 'role_versions.activate'),
    ('super_admin', 'permissions.view'),
    ('super_admin', 'permissions.grant'),
    ('super_admin', 'permissions.revoke'),
    ('super_admin', 'permissions.delegate'),
    ('super_admin', 'portal.access.grant'),
    ('super_admin', 'portal.access.revoke'),
    ('super_admin', 'audit.view'),
    ('super_admin', 'audit.export'),
    ('super_admin', 'org.name.read'),
    ('super_admin', 'member.role.read'),
    ('super_admin', 'member.role.update'),
    ('super_admin', 'audit.change_summary.read'),
    ('admin', 'workspace.access'),
    ('admin', 'admin.access'),
    ('admin', 'org.name.read'),
    ('admin', 'member.role.read'),
    ('staff', 'workspace.access'),
    ('staff', 'admin.access'),
    ('staff', 'org.name.read'),
    ('staff', 'member.role.read'),
    ('organization_admin', 'workspace.access'),
    ('organization_admin', 'portal.customer.access'),
    ('organization_admin', 'portal.vendor.access'),
    ('organization_admin', 'org.members.view'),
    ('organization_admin', 'org.members.invite'),
    ('organization_admin', 'org.members.change_role'),
    ('organization_admin', 'org.members.revoke'),
    ('organization_admin', 'org.members.status.change'),
    ('organization_admin', 'org.name.read'),
    ('organization_admin', 'member.role.read'),
    ('organization_admin', 'member.role.update'),
    ('organization_admin', 'audit.view'),
    ('contributor', 'workspace.access'),
    ('contributor', 'portal.customer.access'),
    ('contributor', 'portal.vendor.access'),
    ('contributor', 'org.name.read'),
    ('contributor', 'member.role.read'),
    ('viewer', 'workspace.access'),
    ('viewer', 'portal.customer.access'),
    ('viewer', 'portal.vendor.access'),
    ('viewer', 'org.name.read'),
    ('viewer', 'member.role.read')
) AS defaults(role_key, permission_key)
JOIN public.role_definitions AS role
  ON role.stable_key = defaults.role_key AND role.version = 2 AND role.state = 'draft';--> statement-breakpoint

UPDATE public.role_definitions
SET state = 'approved', approved_at = now(), updated_at = now()
WHERE version = 2 AND state = 'draft'
  AND stable_key IN ('super_admin', 'admin', 'staff',
    'organization_admin', 'contributor', 'viewer');--> statement-breakpoint

INSERT INTO public.audit_events (
  actor_type, actor_reference, command, action, entity_type, entity_id,
  reason, correlation_id, before_summary, after_summary
)
SELECT 'migration', 'r1.4-permission-defaults', 'role_versions.replace',
  'role_version.deactivate', 'role_definition', id::text,
  'Preserve version one before activating reviewed permission defaults',
  gen_random_uuid(),
  jsonb_build_object('stable_key', stable_key, 'version', 1, 'state', 'active'),
  jsonb_build_object('stable_key', stable_key, 'version', 1, 'state', 'approved')
FROM public.role_definitions
WHERE version = 1 AND state = 'active'
  AND stable_key IN ('super_admin', 'admin', 'staff',
    'organization_admin', 'contributor', 'viewer');--> statement-breakpoint

UPDATE public.role_definitions
SET state = 'approved', activated_at = NULL, updated_at = now()
WHERE version = 1 AND state = 'active'
  AND stable_key IN ('super_admin', 'admin', 'staff',
    'organization_admin', 'contributor', 'viewer');--> statement-breakpoint

UPDATE public.role_definitions
SET state = 'active', activated_at = now(), updated_at = now()
WHERE version = 2 AND state = 'approved'
  AND stable_key IN ('super_admin', 'admin', 'staff',
    'organization_admin', 'contributor', 'viewer');--> statement-breakpoint

INSERT INTO public.audit_events (
  actor_type, actor_reference, command, action, entity_type, entity_id,
  reason, correlation_id, before_summary, after_summary
)
SELECT 'migration', 'r1.4-permission-defaults', 'role_versions.replace',
  'role_version.activate', 'role_definition', id::text,
  'Activate reviewed version-two R1 permission defaults',
  gen_random_uuid(),
  jsonb_build_object('stable_key', stable_key, 'version', 2, 'state', 'approved'),
  jsonb_build_object('stable_key', stable_key, 'version', 2, 'state', 'active')
FROM public.role_definitions
WHERE version = 2 AND state = 'active'
  AND stable_key IN ('super_admin', 'admin', 'staff',
    'organization_admin', 'contributor', 'viewer');--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_has_permission_for_identity(
  target_identity_id uuid,
  requested_permission_key text,
  selected_organization_id uuid,
  current_assurance text,
  authorization_time timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  definition public.permission_definitions%ROWTYPE;
  platform_role_id uuid;
  organization_role_id uuid;
  organization_type text;
  matching_deny boolean;
  matching_allow boolean;
BEGIN
  IF target_identity_id IS NULL OR authorization_time IS NULL
    OR current_assurance IS NULL OR current_assurance NOT IN ('aal1', 'aal2')
    OR NOT EXISTS (
      SELECT 1 FROM public.identities AS identity
      WHERE identity.id = target_identity_id AND identity.auth_user_id IS NOT NULL
        AND identity.status = 'active' AND identity.email_verified_at IS NOT NULL
    ) THEN RETURN false; END IF;

  SELECT stored.* INTO definition
  FROM public.permission_definitions AS stored
  JOIN mmhr_private.r1_permission_registry() AS expected ON expected.key = stored.key
    AND ROW(stored.kind::text, stored.platform_scope, stored.organization_scope,
      stored.minimum_assurance, stored.internal_only, stored.required_portal::text)
      IS NOT DISTINCT FROM ROW(expected.kind, expected.platform_scope,
        expected.organization_scope, expected.minimum_assurance,
        expected.internal_only, expected.required_portal)
  WHERE stored.key = requested_permission_key AND stored.active
    AND stored.retired_at IS NULL;
  IF NOT FOUND OR
    (definition.minimum_assurance = 'aal2' AND current_assurance <> 'aal2')
  THEN RETURN false; END IF;

  SELECT role.id INTO platform_role_id
  FROM public.platform_role_assignments AS assignment
  JOIN public.role_definitions AS role ON role.stable_key = assignment.role_key
    AND role.kind = 'platform' AND role.state = 'active'
  WHERE assignment.identity_id = target_identity_id AND assignment.state = 'active';

  -- Revocation must not convert an internal principal into an external member.
  IF platform_role_id IS NULL AND EXISTS (
    SELECT 1 FROM public.platform_role_assignments AS assignment
    WHERE assignment.identity_id = target_identity_id
  ) THEN RETURN false; END IF;

  IF definition.internal_only AND platform_role_id IS NULL THEN RETURN false; END IF;
  IF selected_organization_id IS NULL THEN
    IF NOT definition.platform_scope OR platform_role_id IS NULL THEN RETURN false; END IF;
  ELSE
    IF NOT definition.organization_scope THEN RETURN false; END IF;
    SELECT organization.type::text, role.id INTO organization_type, organization_role_id
    FROM public.org_members AS membership
    JOIN public.orgs AS organization ON organization.id = membership.org_id
      AND organization.status = 'active'
    LEFT JOIN public.role_definitions AS role ON role.stable_key = membership.role_key
      AND role.kind = 'organization' AND role.state = 'active'
    WHERE membership.identity_id = target_identity_id
      AND membership.org_id = selected_organization_id AND membership.status = 'active';
    IF NOT FOUND THEN RETURN false; END IF;

    IF organization_type = 'internal' AND platform_role_id IS NULL THEN RETURN false; END IF;
    IF organization_type <> 'internal' AND platform_role_id IS NOT NULL THEN
      -- An internal role cannot open an external organization's data by itself.
      IF NOT EXISTS (
        SELECT 1 FROM public.user_permission_overrides AS override
        WHERE override.identity_id = target_identity_id
          AND override.permission_key = 'workspace.access'
          AND override.scope_kind = 'organization'
          AND override.organization_id = selected_organization_id
          AND override.state = 'active' AND override.effect = 'allow'
          AND (override.expires_at IS NULL OR override.expires_at > authorization_time)
      ) OR EXISTS (
        SELECT 1 FROM public.user_permission_overrides AS override
        WHERE override.identity_id = target_identity_id
          AND override.permission_key = 'workspace.access'
          AND (override.scope_kind = 'platform' OR override.organization_id = selected_organization_id)
          AND override.state = 'active' AND override.effect = 'deny'
          AND (override.expires_at IS NULL OR override.expires_at > authorization_time)
      ) THEN RETURN false; END IF;
    END IF;

    IF definition.required_portal IS NOT NULL AND (
      organization_type <> definition.required_portal::text OR NOT EXISTS (
        SELECT 1 FROM public.portal_access_grants AS portal
        WHERE portal.organization_id = selected_organization_id
          AND portal.portal = definition.required_portal AND portal.state = 'active'
      )
    ) THEN RETURN false; END IF;
  END IF;

  -- Fixed parents prevent feature denial from being bypassed by a child allow.
  -- The graph is bounded: organization -> workspace; platform -> admin -> workspace.
  IF selected_organization_id IS NOT NULL THEN
    IF requested_permission_key <> 'workspace.access' AND NOT
      mmhr_private.r1_has_permission_for_identity(target_identity_id,
        'workspace.access', selected_organization_id, current_assurance, authorization_time)
    THEN RETURN false; END IF;
    IF definition.internal_only AND NOT
      mmhr_private.r1_has_permission_for_identity(target_identity_id,
        'admin.access', NULL::uuid, current_assurance, authorization_time)
    THEN RETURN false; END IF;
  ELSIF requested_permission_key = 'admin.access' THEN
    IF NOT mmhr_private.r1_has_permission_for_identity(target_identity_id,
      'workspace.access', NULL::uuid, current_assurance, authorization_time)
    THEN RETURN false; END IF;
  ELSIF requested_permission_key <> 'workspace.access' THEN
    IF NOT mmhr_private.r1_has_permission_for_identity(target_identity_id,
      'admin.access', NULL::uuid, current_assurance, authorization_time)
    THEN RETURN false; END IF;
  END IF;

  SELECT bool_or(override.effect = 'deny'), bool_or(override.effect = 'allow')
  INTO matching_deny, matching_allow
  FROM public.user_permission_overrides AS override
  WHERE override.identity_id = target_identity_id
    AND override.permission_key = requested_permission_key AND override.state = 'active'
    AND (override.expires_at IS NULL OR override.expires_at > authorization_time)
    AND (override.scope_kind = 'platform' OR (
      selected_organization_id IS NOT NULL AND override.scope_kind = 'organization'
      AND override.organization_id = selected_organization_id
    ));
  IF coalesce(matching_deny, false) THEN RETURN false; END IF;
  IF coalesce(matching_allow, false) THEN RETURN true; END IF;

  SELECT bool_or(defaults.effect = 'deny'), bool_or(defaults.effect = 'allow')
  INTO matching_deny, matching_allow
  FROM public.role_permission_defaults AS defaults
  WHERE defaults.permission_key = requested_permission_key
    AND defaults.role_definition_id IN (platform_role_id, organization_role_id);
  RETURN NOT coalesce(matching_deny, false) AND coalesce(matching_allow, false);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r1_has_permission_for_identity(uuid, text, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated, mmhr_worker;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_request_has_permission(
  permission_key text, organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt() ->> 'role' = 'authenticated', false)
    AND mmhr_private.r1_has_permission_for_identity(
      mmhr_private.r1_request_identity_id(), $1, $2,
      auth.jwt() ->> 'aal', statement_timestamp()
    )
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r1_request_has_permission(text, uuid) FROM PUBLIC, anon, authenticated, mmhr_worker;--> statement-breakpoint

CREATE FUNCTION public.mmhr_authorize(permission_key text, organization_id uuid DEFAULT NULL)
RETURNS TABLE (identity_id uuid, authorized_organization_id uuid, assurance text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT mmhr_private.r1_request_identity_id(), $2, auth.jwt() ->> 'aal'
  WHERE mmhr_private.r1_request_has_permission($1, $2)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_authorize(text, uuid) FROM PUBLIC, anon, authenticated, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_authorize(text, uuid) TO authenticated;--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r1_request_is_org_admin(organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT mmhr_private.r1_request_has_permission('org.members.view', $1)
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_get_organization(organization_id uuid)
RETURNS TABLE (id uuid, name text, type public.organization_type, status public.organization_status)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization.id,
    CASE WHEN mmhr_private.r1_request_has_permission('org.name.read', $1)
      THEN organization.name ELSE NULL END,
    organization.type, organization.status
  FROM public.orgs AS organization
  WHERE organization.id = $1
    AND mmhr_private.r1_request_has_permission('workspace.access', $1)
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_get_my_memberships()
RETURNS TABLE (
  organization_id uuid, organization_name text,
  organization_type public.organization_type,
  organization_status public.organization_status, role_key text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization.id,
    CASE WHEN mmhr_private.r1_request_has_permission('org.name.read', organization.id)
      THEN organization.name ELSE NULL END,
    organization.type, organization.status,
    CASE WHEN mmhr_private.r1_request_has_permission('member.role.read', organization.id)
      THEN membership.role_key ELSE NULL END
  FROM public.org_members AS membership
  JOIN public.orgs AS organization ON organization.id = membership.org_id
  WHERE membership.identity_id = mmhr_private.r1_request_identity_id()
    AND membership.status = 'active' AND organization.status = 'active'
    AND mmhr_private.r1_request_has_permission('workspace.access', organization.id)
  ORDER BY organization.id
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_get_organization_members(organization_id uuid)
RETURNS TABLE (
  membership_id uuid, identity_id uuid, role_key text,
  status public.membership_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT membership.id, membership.identity_id,
    CASE WHEN mmhr_private.r1_request_has_permission('member.role.read', $1)
      THEN membership.role_key ELSE NULL END,
    membership.status
  FROM public.org_members AS membership
  WHERE membership.org_id = $1 AND membership.status IN ('active', 'suspended')
    AND mmhr_private.r1_request_has_permission('org.members.view', $1)
  ORDER BY membership.id
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_get_audit_events(organization_id uuid)
RETURNS TABLE (id uuid, action text, entity_type text, entity_id text, occurred_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT event.id, event.action, event.entity_type, event.entity_id, event.occurred_at
  FROM public.audit_events AS event
  WHERE event.organization_id IS NOT DISTINCT FROM $1
    AND mmhr_private.r1_request_has_permission('audit.view', $1)
  ORDER BY event.occurred_at DESC, event.id
  LIMIT 100
$$;--> statement-breakpoint

INSERT INTO public.audit_events (
  actor_type, actor_reference, command, action, entity_type,
  entity_id, reason, correlation_id
) VALUES (
  'migration', 'r1.4-permission-evaluation', 'r1.4 permission evaluation',
  'r1.4_permissions.add', 'authorization', 'r1.4-evaluation',
  'Require current permissions and field controls on fixed reads', gen_random_uuid()
);
