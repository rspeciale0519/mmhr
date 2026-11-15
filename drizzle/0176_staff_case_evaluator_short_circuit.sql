-- Faster permission evaluation for the administration capacity check.
-- Access rules do not change. Every security command runs the capacity check,
-- and the authenticated role has an 8 second statement timeout.
-- 1. r1_permission_registry loses only its SET search_path clause. Its body
--    is literal VALUES with no name lookup, so the clause protected nothing,
--    but it stopped the planner from inlining the function. The 39 rows are
--    the exact 0122 rows.
-- 2. Four hot SQL helpers become PL/pgSQL with the same query, volatility,
--    SECURITY DEFINER, and search_path. PostgreSQL 17 plans a non-inlined SQL
--    function again on every call; PL/pgSQL keeps the plan for the session.
-- 3. r1_evaluate_permission reads the staff case grant only after the
--    workspace.access override check fails, and reads it inline. The rule
--    equals mmhr_private.r1_staff_case_access_is_active.
-- Recovery: re-apply the 0122 registry, the 0004 and 0006 helper bodies, and
-- the 0175 evaluator body in a new migration. No data changes.
SELECT mmhr_private.r1_lock_security();--> statement-breakpoint

-- Copied from 0122 without change, except the removed SET search_path line.
-- A later registry change must keep this function inlinable (no SET clause,
-- no SECURITY DEFINER), or the capacity check slows down again.
CREATE OR REPLACE FUNCTION mmhr_private.r1_permission_registry()
RETURNS TABLE (
  key text, kind text, description text, platform_scope boolean,
  organization_scope boolean, minimum_assurance text,
  internal_only boolean, required_portal text
)
LANGUAGE sql
IMMUTABLE
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
    ('audit.change_summary.read', 'field', 'Read an authorized redacted audit change summary.', true, true, 'aal2', false, NULL),
    ('finance.manage', 'action', 'Manage authorized organization finance records.', false, true, 'aal2', true, NULL),
    ('rfp.approve', 'action', 'Approve organization RFP versions after MMHR review.', false, true, 'aal2', true, NULL),
    ('rfp.distribute', 'action', 'Distribute organization RFP versions with MMHR approval.', false, true, 'aal2', true, NULL),
    ('intake.draft.save', 'action', 'Save draft intake answers in an authorized customer portal.', false, true, 'aal1', false, 'customer'),
    ('intake.requirement.save', 'action', 'Save intake requirements in an authorized customer portal.', false, true, 'aal1', false, 'customer'),
    ('intake.submit', 'action', 'Submit saved intake answers in an authorized customer portal.', false, true, 'aal1', false, 'customer'),
    ('evaluation.publish', 'action', 'Review and publish masked evaluation options for an authorized customer organization.', false, true, 'aal2', true, NULL),
    ('evaluation.disclose', 'action', 'Review and disclose provider identities after an authorized MMHR discussion.', false, true, 'aal2', true, NULL),
    ('evaluation.select', 'action', 'Select up to five published evaluation options in an authorized customer portal.', false, true, 'aal1', false, 'customer')
$$;--> statement-breakpoint

-- Same queries as the 0004 and 0006 SQL bodies, now in PL/pgSQL.
CREATE OR REPLACE FUNCTION mmhr_private.r1_scope_supported(permission_key text, organization_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.permission_definitions d
    JOIN mmhr_private.r1_permission_registry() r ON r.key = d.key
      AND ROW(d.kind::text, d.platform_scope, d.organization_scope, d.minimum_assurance,
        d.internal_only, d.required_portal::text)
      IS NOT DISTINCT FROM ROW(r.kind, r.platform_scope, r.organization_scope,
        r.minimum_assurance, r.internal_only, r.required_portal)
    WHERE d.key = $1 AND d.active AND d.retired_at IS NULL
      AND CASE WHEN $2 IS NULL THEN d.platform_scope ELSE d.organization_scope END
  );
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r1_verified_identity(identity_id uuid, require_mfa boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.identities i
    JOIN auth.users u ON u.id = i.auth_user_id
    WHERE i.id = $1 AND i.status = 'active' AND NOT i.migration_review_required
      AND i.email_verified_at IS NOT NULL AND u.email_confirmed_at IS NOT NULL
      AND i.normalized_email = lower(btrim(u.email))
      AND u.deleted_at IS NULL AND NOT u.is_anonymous
      AND (u.banned_until IS NULL OR u.banned_until <= statement_timestamp())
      AND (NOT $2 OR EXISTS (
        SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = u.id AND f.status = 'verified'
      ))
  );
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r1_override_allow_is_valid(
  override_id uuid, authorization_time timestamptz, durable boolean,
  visited uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_permission_overrides o
    WHERE o.id = $1 AND o.state = 'active' AND o.effect = 'allow'
      AND ($3 IS FALSE OR o.expires_at IS NULL)
      AND (o.expires_at IS NULL OR o.expires_at > $2)
      AND mmhr_private.r1_scope_supported(o.permission_key, o.organization_id)
      AND (o.source_delegation_id IS NULL OR EXISTS (
        SELECT 1 FROM public.admin_delegation_grants g
        WHERE g.id = o.source_delegation_id AND g.grantee_identity_id = o.issued_by_identity_id
          AND mmhr_private.r1_delegation_is_valid(
            g.id, o.permission_key, o.organization_id, 'grant', $2, $3, $4)
      ))
  );
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r1_current_role_authority(p_role_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE authority_id uuid;
BEGIN
  -- Non-strict INTO keeps the SQL function result: the first row, or NULL.
  SELECT a.id INTO authority_id FROM public.role_authority_records a
    JOIN public.role_definitions r ON r.id = a.role_definition_id
    WHERE r.id = $1 AND r.state = 'active' AND a.record_kind = 'role_activation'
      AND a.activated_at = r.activated_at;
  RETURN authority_id;
END
$$;--> statement-breakpoint

-- Copied from 0175 without change, except the staff case gate: it is read
-- only after the override check fails, and inline.
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
      IF organization_type <> 'customer' OR NOT EXISTS (
        SELECT 1 FROM mmhr_private.staff_case_access_grants g
        JOIN public.org_members gm ON gm.id = g.membership_id AND gm.org_id = g.organization_id
          AND gm.identity_id = g.identity_id AND gm.status = 'active' AND gm.role_key = 'viewer'
        WHERE g.identity_id = target_identity_id AND g.organization_id = selected_organization_id
          AND g.state = 'active'
      ) THEN RETURN false; END IF;
    END IF;
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

-- Refuse a populated migration that breaks current administration capacity.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.security_bootstrap_state b
    WHERE b.state = 'consumed' AND b.second_target_identity_id IS NOT NULL)
  THEN PERFORM mmhr_private.r1_assert_administration_capacity(clock_timestamp()); END IF;
END
$$;
