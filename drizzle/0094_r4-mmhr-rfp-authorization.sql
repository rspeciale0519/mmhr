-- Require explicit internal AAL2 permissions for MMHR RFP review and distribution.
-- Preserve prior role defaults, approval records, and immutable audit history.
-- Legacy approved drafts require a new MMHR review and a new idempotency key.
-- Already-distributed history remains unchanged; no migration sends an RFP.
-- Recovery: revoke EXECUTE on the two public RPCs, preserve records, and deploy
-- a reviewed forward correction. Never restore workspace-only approval.
SELECT mmhr_private.r1_lock_security();
--> statement-breakpoint
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
    ('rfp.distribute', 'action', 'Distribute organization RFP versions with MMHR approval.', false, true, 'aal2', true, NULL)
$$;
--> statement-breakpoint
SELECT mmhr_private.r1_sync_permission_registry();
--> statement-breakpoint

DO $$
DECLARE
  prior_role public.role_definitions%ROWTYPE;
  next_role_id uuid;
  prior_authority_id uuid;
  checked_at timestamptz := mmhr_private.r1_lock_security();
  migration_correlation uuid := gen_random_uuid();
BEGIN
  SELECT * INTO prior_role FROM public.role_definitions
    WHERE stable_key = 'super_admin' AND version = 3 AND state = 'active' FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.role_definitions
      WHERE stable_key = 'super_admin' AND version = 4)
  THEN RAISE EXCEPTION 'RFP permission role version requires review'; END IF;
  prior_authority_id := mmhr_private.r1_current_role_authority(prior_role.id);
  IF prior_authority_id IS NULL THEN RAISE EXCEPTION 'RFP permission authority requires review'; END IF;
  INSERT INTO public.role_definitions(stable_key,version,kind,display_name,description)
    VALUES(prior_role.stable_key,4,prior_role.kind,prior_role.display_name,prior_role.description)
    RETURNING id INTO next_role_id;
  INSERT INTO public.role_permission_defaults(role_definition_id,permission_key,effect)
    SELECT next_role_id,permission_key,effect FROM public.role_permission_defaults
    WHERE role_definition_id = prior_role.id;
  INSERT INTO public.role_permission_defaults(role_definition_id,permission_key,effect)
    VALUES(next_role_id,'rfp.approve','allow'),(next_role_id,'rfp.distribute','allow');
  UPDATE public.role_definitions SET state='approved',approved_at=checked_at,updated_at=checked_at
    WHERE id=next_role_id;
  INSERT INTO public.audit_events(actor_type,actor_reference,command,action,entity_type,entity_id,
    reason,correlation_id,occurred_at,before_summary,after_summary)
    VALUES('migration','r4-mmhr-rfp-authorization','role_versions.replace','role_version.deactivate',
      'role_definition',prior_role.id::text,'Preserve role history before adding explicit RFP authority',
      migration_correlation,checked_at,jsonb_build_object('stable_key','super_admin','version',3,'state','active'),
      jsonb_build_object('stable_key','super_admin','version',3,'state','approved'));
  UPDATE public.role_definitions SET state='approved',activated_at=NULL,updated_at=checked_at
    WHERE id=prior_role.id;
  UPDATE public.role_definitions SET state='active',activated_at=checked_at,updated_at=checked_at
    WHERE id=next_role_id;
  INSERT INTO public.role_authority_records(record_kind,authority_kind,role_definition_id,
    previous_authority_id,activated_at,correlation_id,created_at)
    VALUES('role_activation','reviewed_owner',next_role_id,prior_authority_id,checked_at,
      migration_correlation,checked_at);
  INSERT INTO public.audit_events(actor_type,actor_reference,command,action,entity_type,entity_id,
    reason,correlation_id,occurred_at,before_summary,after_summary)
    VALUES('migration','r4-mmhr-rfp-authorization','role_versions.replace','role_version.activate',
      'role_definition',next_role_id::text,'Require explicit MMHR RFP approval and distribution authority',
      migration_correlation,checked_at,jsonb_build_object('stable_key','super_admin','version',4,'state','approved'),
      jsonb_build_object('stable_key','super_admin','version',4,'state','active'));
  IF EXISTS(SELECT 1 FROM public.security_bootstrap_state WHERE state='consumed')
    OR EXISTS(SELECT 1 FROM public.platform_role_assignments WHERE state='active')
  THEN PERFORM mmhr_private.r1_assert_administration_capacity(checked_at); END IF;
END $$;

--> statement-breakpoint

CREATE FUNCTION mmhr_private.r4_has_mmhr_rfp_approval(
  version_id uuid, organization_id uuid, reviewer_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.audit_events e
    WHERE e.actor_type = 'user' AND e.actor_identity_id = $3 AND e.organization_id = $2
      AND e.command = 'r4.rfp.approve' AND e.action = 'rfp.mmhr_approve'
      AND e.entity_type = 'rfp_version' AND e.entity_id = $1::text
      AND e.after_summary ->> 'state' = 'approved'
  )
$$;
REVOKE ALL ON FUNCTION mmhr_private.r4_has_mmhr_rfp_approval(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_approve_rfp_version(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  receipt jsonb;
  v_rfp public.rfp_versions%ROWTYPE;
  v_rfp_id uuid;
  v_organization_id uuid;
  v_actor_id uuid;
  v_version integer;
  v_approval_reference text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'rfpId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'version','') !~ '^[1-9][0-9]{0,3}$'
    OR coalesce(payload->>'approvalReference','') !~ '^approval:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP approval input'; END IF;
  v_rfp_id := (payload->>'rfpId')::uuid; v_organization_id := (payload->>'organizationId')::uuid; v_actor_id := (payload->>'actorIdentityId')::uuid; v_version := (payload->>'version')::integer; v_approval_reference := btrim(payload->>'approvalReference');
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('rfp.approve', v_organization_id, 'Approve RFP version', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rfp.approve', idempotency_key, payload);
  IF receipt IS NOT NULL AND NOT mmhr_private.r4_has_mmhr_rfp_approval(
    (receipt->>'entity_id')::uuid,v_organization_id,v_actor_id)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP requires MMHR review with a new command key'; END IF;
  IF receipt IS NOT NULL THEN SELECT * INTO v_rfp FROM public.rfp_versions AS r WHERE r.id = (receipt->>'entity_id')::uuid AND r.organization_id = v_organization_id; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('rfpId', v_rfp.rfp_id, 'organizationId', v_rfp.organization_id, 'sourceIntakeId', v_rfp.source_intake_id, 'version', v_rfp.version, 'status', v_rfp.status, 'approvedByIdentityId', v_rfp.approved_by_identity_id, 'approvedAt', v_rfp.approved_at, 'approvalReference', v_rfp.approval_reference, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  SELECT * INTO v_rfp FROM public.rfp_versions AS r WHERE r.rfp_id = v_rfp_id AND r.organization_id = v_organization_id AND r.version = v_version FOR UPDATE;
  IF NOT FOUND OR v_rfp.status NOT IN ('draft', 'review', 'approved') OR (v_rfp.status = 'approved' AND mmhr_private.r4_has_mmhr_rfp_approval(v_rfp.id,v_organization_id,v_rfp.approved_by_identity_id)) OR v_rfp.created_by_identity_id = v_actor_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP approval denied'; END IF;
  UPDATE public.rfp_versions AS r SET status = 'approved', approved_by_identity_id = v_actor_id, approved_at = clock_timestamp(), approval_reference = v_approval_reference, updated_at = clock_timestamp() WHERE r.id = v_rfp.id RETURNING * INTO v_rfp;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.rfp.approve', 'rfp.mmhr_approve', 'rfp_version', v_rfp.id, v_organization_id, 'Approve RFP version', correlation_id, idempotency_key, payload, jsonb_build_object('version', v_rfp.version), jsonb_build_object('version', v_rfp.version, 'state', 'approved'), context.authorization_time);
  RETURN jsonb_build_object('rfpId', v_rfp.rfp_id, 'organizationId', v_rfp.organization_id, 'sourceIntakeId', v_rfp.source_intake_id, 'version', v_rfp.version, 'status', v_rfp.status, 'approvedByIdentityId', v_rfp.approved_by_identity_id, 'approvedAt', v_rfp.approved_at, 'approvalReference', v_rfp.approval_reference, 'outcomeCode', 'approved', 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_approve_rfp_version(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_approve_rfp_version(jsonb, uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_approve_rfp_version(jsonb, uuid, uuid) IS 'R4 audited MMHR approval for an immutable organization-scoped RFP version.';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_distribute_rfp_version(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  receipt jsonb;
  v_rfp public.rfp_versions%ROWTYPE;
  v_rfp_id uuid;
  v_organization_id uuid;
  v_actor_id uuid;
  v_version integer;
  v_recipients jsonb;
  v_item jsonb;
  v_recipient_id uuid;
  v_vendor_id uuid;
  v_deadline timestamptz;
  v_reminder timestamptz;
  v_reference text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'rfpId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'version','') !~ '^[1-9][0-9]{0,3}$'
    OR jsonb_typeof(payload->'recipients') <> 'array'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP distribution input'; END IF;
  v_rfp_id := (payload->>'rfpId')::uuid;
  v_organization_id := (payload->>'organizationId')::uuid;
  v_actor_id := (payload->>'actorIdentityId')::uuid;
  v_version := (payload->>'version')::integer;
  v_recipients := payload->'recipients';
  IF jsonb_array_length(v_recipients) NOT BETWEEN 1 AND 100
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_recipients) AS item
      WHERE jsonb_typeof(item) <> 'object'
        OR coalesce(item->>'recipientId','') !~ '^[0-9a-fA-F-]{36}$'
        OR coalesce(item->>'vendorProfileId','') !~ '^[0-9a-fA-F-]{36}$'
        OR coalesce(item->>'deadlineAt','') = ''
        OR coalesce(item->>'deliveryReference','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$')
    OR (SELECT count(*) FROM (SELECT item->>'recipientId' AS key FROM jsonb_array_elements(v_recipients) AS item GROUP BY item->>'recipientId' HAVING count(*) > 1) AS duplicates) > 0
    OR (SELECT count(*) FROM (SELECT item->>'vendorProfileId' AS key FROM jsonb_array_elements(v_recipients) AS item GROUP BY item->>'vendorProfileId' HAVING count(*) > 1) AS duplicates) > 0
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP distribution recipients'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('rfp.distribute', v_organization_id, 'Distribute RFP version', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rfp.distribute', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO v_rfp FROM public.rfp_versions AS r WHERE r.id = (receipt->>'entity_id')::uuid AND r.organization_id = v_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('rfpId', v_rfp.rfp_id, 'organizationId', v_rfp.organization_id, 'version', v_rfp.version, 'status', v_rfp.status,
      'recipients', (SELECT coalesce(jsonb_agg(jsonb_build_object('recipientId', rr.id, 'vendorProfileId', rr.vendor_profile_id, 'state', rr.state, 'sentAt', rr.sent_at, 'deadlineAt', rr.deadline_at, 'reminderAt', rr.reminder_at, 'acknowledgedAt', rr.acknowledged_at, 'deliveryReference', rr.delivery_reference) ORDER BY rr.id), '[]'::jsonb) FROM public.rfp_recipients AS rr WHERE rr.organization_id = v_organization_id AND rr.rfp_version_id = v_rfp.id),
      'outcomeCode', 'replayed', 'correlationId', correlation_id);
  END IF;
  SELECT * INTO v_rfp FROM public.rfp_versions AS r WHERE r.rfp_id = v_rfp_id AND r.organization_id = v_organization_id AND r.version = v_version FOR UPDATE;
  IF NOT FOUND OR v_rfp.status <> 'approved' OR v_rfp.approved_by_identity_id IS NULL OR NOT mmhr_private.r4_has_mmhr_rfp_approval(v_rfp.id,v_organization_id,v_rfp.approved_by_identity_id) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP distribution denied'; END IF;
  IF (SELECT count(*) FROM public.vendor_profiles AS v WHERE v.organization_id = v_organization_id AND v.status = 'active' AND v.id IN (SELECT (item->>'vendorProfileId')::uuid FROM jsonb_array_elements(v_recipients) AS item)) <> jsonb_array_length(v_recipients)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP recipient denied'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_recipients) LOOP
    v_recipient_id := (v_item->>'recipientId')::uuid;
    v_vendor_id := (v_item->>'vendorProfileId')::uuid;
    v_deadline := (v_item->>'deadlineAt')::timestamptz;
    v_reminder := CASE WHEN v_item ? 'reminderAt' AND jsonb_typeof(v_item->'reminderAt') <> 'null' THEN (v_item->>'reminderAt')::timestamptz ELSE NULL END;
    v_reference := btrim(v_item->>'deliveryReference');
    IF v_reminder IS NOT NULL AND v_reminder > v_deadline THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP reminder time'; END IF;
    INSERT INTO public.rfp_recipients (id, organization_id, rfp_version_id, vendor_profile_id, state, sent_at, deadline_at, reminder_at, delivery_reference)
      VALUES (v_recipient_id, v_organization_id, v_rfp.id, v_vendor_id, 'distributed', clock_timestamp(), v_deadline, v_reminder, v_reference);
  END LOOP;
  UPDATE public.rfp_versions SET status = 'distributed', updated_at = clock_timestamp() WHERE id = v_rfp.id;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.rfp.distribute', 'rfp.distribute', 'rfp_version', v_rfp.id, v_organization_id, 'Distribute RFP version', correlation_id, idempotency_key, payload, jsonb_build_object('status', v_rfp.status), jsonb_build_object('state', 'completed', 'version', v_rfp.version), context.authorization_time);
  RETURN jsonb_build_object('rfpId', v_rfp.rfp_id, 'organizationId', v_rfp.organization_id, 'version', v_rfp.version, 'status', 'distributed',
    'recipients', (SELECT coalesce(jsonb_agg(jsonb_build_object('recipientId', rr.id, 'vendorProfileId', rr.vendor_profile_id, 'state', rr.state, 'sentAt', rr.sent_at, 'deadlineAt', rr.deadline_at, 'reminderAt', rr.reminder_at, 'acknowledgedAt', rr.acknowledged_at, 'deliveryReference', rr.delivery_reference) ORDER BY rr.id), '[]'::jsonb) FROM public.rfp_recipients AS rr WHERE rr.organization_id = v_organization_id AND rr.rfp_version_id = v_rfp.id),
    'outcomeCode', 'distributed', 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_distribute_rfp_version(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_distribute_rfp_version(jsonb, uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_distribute_rfp_version(jsonb, uuid, uuid) IS 'R4 audited organization-scoped distribution record for approved RFP versions.';
