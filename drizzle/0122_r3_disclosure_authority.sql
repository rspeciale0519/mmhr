-- R3 staff disclosure authority. Add a separate internal AAL2 action for
-- reviewed provider identity disclosure after the required MMHR discussion.
-- Preserve prior permission, role, override, audit, and authority history.
-- Recovery: revoke the new action or apply a reviewed forward role version.
SELECT mmhr_private.r1_lock_security();--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r1_permission_registry()
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

SELECT mmhr_private.r1_sync_permission_registry();--> statement-breakpoint

DO $$
DECLARE
  prior public.role_definitions%ROWTYPE;
  next_role public.role_definitions%ROWTYPE;
  prior_authority_id uuid;
  checked_at timestamptz := clock_timestamp();
  migration_correlation uuid := gen_random_uuid();
BEGIN
  SELECT * INTO prior FROM public.role_definitions AS r
  WHERE r.stable_key = 'super_admin' AND r.version = 9 AND r.state = 'active' FOR UPDATE;
  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM public.role_definitions AS r
    WHERE r.stable_key = 'super_admin' AND r.version = 10
  ) THEN
    RAISE EXCEPTION 'Disclosure authority role version requires review';
  END IF;
  prior_authority_id := mmhr_private.r1_current_role_authority(prior.id);
  IF prior_authority_id IS NULL THEN
    RAISE EXCEPTION 'Disclosure authority role authority requires review';
  END IF;
  INSERT INTO public.role_definitions(stable_key, version, kind, display_name, description)
    VALUES (prior.stable_key, prior.version + 1, prior.kind, prior.display_name, prior.description)
    RETURNING * INTO next_role;
  INSERT INTO public.role_permission_defaults(role_definition_id, permission_key, effect)
    SELECT next_role.id, d.permission_key, d.effect
    FROM public.role_permission_defaults AS d
    WHERE d.role_definition_id = prior.id;
  INSERT INTO public.role_permission_defaults(role_definition_id, permission_key, effect)
    VALUES (next_role.id, 'evaluation.disclose', 'allow');
  UPDATE public.role_definitions
    SET state = 'approved', approved_at = checked_at, updated_at = checked_at
    WHERE id = next_role.id;
  INSERT INTO public.audit_events(
    actor_type, actor_reference, command, action, entity_type, entity_id,
    reason, correlation_id, occurred_at, before_summary, after_summary
  ) VALUES (
    'migration', 'r3-disclosure-authority', 'role_versions.replace',
    'role_version.deactivate', 'role_definition', prior.id::text,
    'Preserve prior role defaults before adding disclosure authority',
    migration_correlation, checked_at,
    jsonb_build_object('stable_key', prior.stable_key, 'version', prior.version, 'state', 'active'),
    jsonb_build_object('stable_key', prior.stable_key, 'version', prior.version, 'state', 'approved')
  );
  UPDATE public.role_definitions
    SET state = 'approved', activated_at = NULL, updated_at = checked_at
    WHERE id = prior.id;
  UPDATE public.role_definitions
    SET state = 'active', activated_at = checked_at, updated_at = checked_at
    WHERE id = next_role.id;
  INSERT INTO public.role_authority_records(
    record_kind, authority_kind, role_definition_id, previous_authority_id,
    activated_at, correlation_id, created_at
  ) VALUES (
    'role_activation', 'reviewed_owner', next_role.id, prior_authority_id,
    checked_at, migration_correlation, checked_at
  );
  INSERT INTO public.audit_events(
    actor_type, actor_reference, command, action, entity_type, entity_id,
    reason, correlation_id, occurred_at, before_summary, after_summary
  ) VALUES (
    'migration', 'r3-disclosure-authority', 'role_versions.replace',
    'role_version.activate', 'role_definition', next_role.id::text,
    'Add reviewed provider identity disclosure authority',
    migration_correlation, checked_at,
    jsonb_build_object('stable_key', next_role.stable_key, 'version', next_role.version, 'state', 'approved'),
    jsonb_build_object('stable_key', next_role.stable_key, 'version', next_role.version, 'state', 'active')
  );
  IF EXISTS (SELECT 1 FROM public.security_bootstrap_state WHERE state = 'consumed')
    OR EXISTS (SELECT 1 FROM public.platform_role_assignments WHERE state = 'active')
  THEN
    PERFORM mmhr_private.r1_assert_administration_capacity(checked_at);
  END IF;
END $$;
