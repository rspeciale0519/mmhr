-- R3 customer draft intake writes are a narrow AAL1 exception.
-- Forward: add one customer-portal action, version the three approved role
-- bundles, and expose a caller-bound draft-only RPC.
-- Recovery: revoke this RPC and keep intake, history, audit, and receipt rows.
-- Do not weaken the shared AAL2 security-command helper or the legacy writer.
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
    ('intake.draft.save', 'action', 'Save draft intake answers in an authorized customer portal.', false, true, 'aal1', false, 'customer')
$$;--> statement-breakpoint
SELECT mmhr_private.r1_sync_permission_registry();--> statement-breakpoint

-- Preserve every prior default and explicit override. Each new role version
-- carries the old defaults forward, then adds only the reviewed action.
DO $$
DECLARE
  target record;
  prior public.role_definitions%ROWTYPE;
  next_role public.role_definitions%ROWTYPE;
  prior_authority_id uuid;
  checked_at timestamptz := clock_timestamp();
  migration_correlation uuid := gen_random_uuid();
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('super_admin'::text, 4),
      ('organization_admin'::text, 2),
      ('contributor'::text, 2)
    ) AS requested(stable_key, version)
  LOOP
    SELECT * INTO prior FROM public.role_definitions r
    WHERE r.stable_key = target.stable_key AND r.version = target.version
      AND r.state = 'active' FOR UPDATE;
    IF NOT FOUND OR EXISTS (
      SELECT 1 FROM public.role_definitions r
      WHERE r.stable_key = target.stable_key AND r.version = target.version + 1
    ) THEN
      RAISE EXCEPTION 'Customer intake role version requires review';
    END IF;
    prior_authority_id := mmhr_private.r1_current_role_authority(prior.id);
    IF prior_authority_id IS NULL THEN
      RAISE EXCEPTION 'Customer intake role authority requires review';
    END IF;
    INSERT INTO public.role_definitions(stable_key, version, kind, display_name, description)
      VALUES (prior.stable_key, prior.version + 1, prior.kind, prior.display_name, prior.description)
      RETURNING * INTO next_role;
    INSERT INTO public.role_permission_defaults(role_definition_id, permission_key, effect)
      SELECT next_role.id, d.permission_key, d.effect
      FROM public.role_permission_defaults d
      WHERE d.role_definition_id = prior.id;
    INSERT INTO public.role_permission_defaults(role_definition_id, permission_key, effect)
      VALUES (next_role.id, 'intake.draft.save', 'allow');
    UPDATE public.role_definitions
      SET state = 'approved', approved_at = checked_at, updated_at = checked_at
      WHERE id = next_role.id;
    INSERT INTO public.audit_events(
      actor_type, actor_reference, command, action, entity_type, entity_id,
      reason, correlation_id, occurred_at, before_summary, after_summary
    ) VALUES (
      'migration', 'r3-customer-intake-draft', 'role_versions.replace',
      'role_version.deactivate', 'role_definition', prior.id::text,
      'Preserve prior role defaults before adding customer intake draft authority',
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
      'migration', 'r3-customer-intake-draft', 'role_versions.replace',
      'role_version.activate', 'role_definition', next_role.id::text,
      'Add customer intake draft authority to the approved role bundle',
      migration_correlation, checked_at,
      jsonb_build_object('stable_key', next_role.stable_key, 'version', next_role.version, 'state', 'approved'),
      jsonb_build_object('stable_key', next_role.stable_key, 'version', next_role.version, 'state', 'active')
    );
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.security_bootstrap_state WHERE state = 'consumed')
    OR EXISTS (SELECT 1 FROM public.platform_role_assignments WHERE state = 'active')
  THEN
    PERFORM mmhr_private.r1_assert_administration_capacity(checked_at);
  END IF;
END $$;--> statement-breakpoint

-- Intake history is evidence, not working state. Keep it append-only even
-- though runtime roles have no direct table privileges.
CREATE TRIGGER intake_history_append_only BEFORE UPDATE OR DELETE
  ON public.intake_history FOR EACH ROW
  EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER intake_history_no_truncate BEFORE TRUNCATE
  ON public.intake_history FOR EACH STATEMENT
  EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint

CREATE FUNCTION public.mmhr_save_customer_intake(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  claims jsonb := auth.jwt();
  checked_at timestamptz;
  request_session uuid;
  provider auth.users%ROWTYPE;
  actor public.identities%ROWTYPE;
  intake public.intakes%ROWTYPE;
  receipt jsonb;
  v_organization_id uuid;
  v_intake_id uuid;
  expected_revision integer;
  requested_status text;
  v_data jsonb;
  outcome text;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object'
    OR correlation_id IS NULL OR idempotency_key IS NULL
    OR NOT (payload ?& ARRAY['intakeId','organizationId','expectedRevision','status','data'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS k(key)
      WHERE k.key NOT IN ('intakeId','organizationId','expectedRevision','status','data'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR (payload ? 'intakeId' AND jsonb_typeof(payload->'intakeId') <> 'null'
      AND coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$')
    OR jsonb_typeof(payload->'expectedRevision') <> 'number'
    OR coalesce(payload->>'expectedRevision','') !~ '^[0-9]{1,10}$'
    OR coalesce(payload->>'status','') NOT IN ('draft','in_progress')
    OR NOT mmhr_private.r3_intake_data_is_valid(payload->'data')
  THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid customer intake input';
  END IF;
  IF (payload->>'expectedRevision')::numeric > 2147483646 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid customer intake input';
  END IF;
  v_organization_id := (payload->>'organizationId')::uuid;
  v_intake_id := CASE WHEN jsonb_typeof(payload->'intakeId') = 'null' THEN NULL ELSE (payload->>'intakeId')::uuid END;
  expected_revision := (payload->>'expectedRevision')::integer;
  requested_status := payload->>'status';
  v_data := payload->'data';
  IF (v_intake_id IS NULL AND expected_revision <> 0)
    OR (v_intake_id IS NOT NULL AND expected_revision = 0) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid customer intake input';
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
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Customer intake save denied';
  END IF;
  request_session := (claims->>'session_id')::uuid;
  IF (claims->>'exp')::numeric <= extract(epoch FROM checked_at)
    OR (claims->>'iat')::numeric > floor(extract(epoch FROM checked_at))
    OR (claims->>'iat')::numeric >= (claims->>'exp')::numeric
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=request_session
      AND s.user_id=auth.uid() AND (s.not_after IS NULL OR s.not_after>checked_at))
    OR (claims->>'aal'='aal2' AND NOT mmhr_private.r1_session_is_aal2(auth.uid(),request_session,checked_at))
  THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Customer intake save denied';
  END IF;
  SELECT * INTO provider FROM auth.users u
  WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL
    AND nullif(lower(btrim(u.email)),'') IS NOT NULL AND u.deleted_at IS NULL
    AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<=checked_at)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Customer intake save denied';
  END IF;
  SELECT * INTO actor FROM public.identities i WHERE i.auth_user_id=provider.id FOR UPDATE;
  IF NOT FOUND OR NOT mmhr_private.r1_verified_identity(actor.id,false)
    OR mmhr_private.r1_request_identity_id() IS DISTINCT FROM actor.id
    OR actor.status <> 'active' OR actor.migration_review_required THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Customer intake save denied';
  END IF;
  IF NOT mmhr_private.r1_evaluate_permission(actor.id,'intake.draft.save',v_organization_id,
      claims->>'aal',checked_at,false)
    OR NOT mmhr_private.r1_evaluate_permission(actor.id,'portal.customer.access',v_organization_id,
      claims->>'aal',checked_at,false) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Customer intake save denied';
  END IF;

  receipt := mmhr_private.r1_checked_receipt(actor.id,'r3.customer.intake.save',idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO intake FROM public.intakes i
    WHERE i.id=(receipt->>'entity_id')::uuid AND i.organization_id=v_organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Customer intake save denied';
    END IF;
    outcome := 'replayed';
  ELSE
    IF v_intake_id IS NULL THEN
      INSERT INTO public.intakes(
        organization_id,status,company_context,current_systems,compliance_needs,
        budget,timeline,stakeholders,decision_process,submitted_at,
        created_by_identity_id,updated_by_identity_id
      ) VALUES (
        v_organization_id,requested_status,v_data->'companyContext',v_data->'currentSystems',
        v_data->'complianceNeeds',v_data->'budget',v_data->'timeline',v_data->'stakeholders',
        v_data->'decisionProcess',NULL,actor.id,actor.id
      ) RETURNING * INTO intake;
      outcome := 'created';
    ELSE
      SELECT * INTO intake FROM public.intakes i
      WHERE i.id=v_intake_id AND i.organization_id=v_organization_id FOR UPDATE;
      IF NOT FOUND OR intake.revision<>expected_revision
        OR intake.status NOT IN ('draft','in_progress')
        OR (intake.status='in_progress' AND requested_status='draft') THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Customer intake revision denied';
      END IF;
      UPDATE public.intakes i SET
        status=requested_status,
        company_context=CASE WHEN v_data ? 'companyContext' THEN v_data->'companyContext' ELSE i.company_context END,
        current_systems=CASE WHEN v_data ? 'currentSystems' THEN v_data->'currentSystems' ELSE i.current_systems END,
        compliance_needs=CASE WHEN v_data ? 'complianceNeeds' THEN v_data->'complianceNeeds' ELSE i.compliance_needs END,
        budget=CASE WHEN v_data ? 'budget' THEN v_data->'budget' ELSE i.budget END,
        timeline=CASE WHEN v_data ? 'timeline' THEN v_data->'timeline' ELSE i.timeline END,
        stakeholders=CASE WHEN v_data ? 'stakeholders' THEN v_data->'stakeholders' ELSE i.stakeholders END,
        decision_process=CASE WHEN v_data ? 'decisionProcess' THEN v_data->'decisionProcess' ELSE i.decision_process END,
        submitted_at=NULL, revision=i.revision+1, updated_by_identity_id=actor.id, updated_at=checked_at
      WHERE i.id=v_intake_id AND i.organization_id=v_organization_id
      RETURNING * INTO intake;
      outcome := 'updated';
    END IF;
    INSERT INTO public.intake_history(
      organization_id,intake_id,revision,snapshot,changed_by_identity_id,correlation_id
    ) VALUES (
      v_organization_id,intake.id,intake.revision,
      jsonb_build_object('status',intake.status,'companyContext',intake.company_context,
        'currentSystems',intake.current_systems,'complianceNeeds',intake.compliance_needs,
        'budget',intake.budget,'timeline',intake.timeline,'stakeholders',intake.stakeholders,
        'decisionProcess',intake.decision_process),actor.id,correlation_id
    );
    PERFORM mmhr_private.r1_finish_security_command(
      actor.id,'r3.customer.intake.save','customer.intake.save','intake',intake.id,
      v_organization_id,'Save customer intake draft',correlation_id,idempotency_key,payload,
      jsonb_build_object('version',1),jsonb_build_object('version',1),checked_at
    );
  END IF;
  RETURN jsonb_build_object('intakeId',intake.id,'organizationId',intake.organization_id,
    'status',intake.status,'revision',intake.revision,'outcomeCode',outcome,
    'correlationId',correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_save_customer_intake(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_save_customer_intake(jsonb,uuid,uuid) TO authenticated;

-- Contain the older broad save RPC while preserving its reviewed AAL2
-- validation, lifecycle, history, audit, receipt, and submission behavior.
-- Customer draft callers must use the dedicated RPC above.
CREATE OR REPLACE FUNCTION public.mmhr_save_intake(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; intake public.intakes%ROWTYPE; receipt jsonb;
  v_organization_id uuid; v_intake_id uuid; requested_status text; expected_revision integer;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid intake input';
  END IF;
  IF correlation_id IS NULL OR idempotency_key IS NULL
    OR NOT (payload ?& ARRAY['intakeId','organizationId','actorIdentityId','expectedRevision','status','data'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS k(key)
      WHERE k.key NOT IN ('intakeId','organizationId','actorIdentityId','expectedRevision','status','data','correlationId','idempotencyKey'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR (jsonb_typeof(payload->'intakeId') <> 'null' AND
      coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$')
    OR jsonb_typeof(payload->'expectedRevision') <> 'number'
    OR coalesce(payload->>'expectedRevision','') !~ '^[0-9]{1,10}$'
    OR coalesce(payload->>'status','') NOT IN ('draft','in_progress','submitted')
    OR NOT mmhr_private.r3_intake_data_is_valid(payload->'data')
    OR (payload ? 'correlationId' AND lower(payload->>'correlationId') IS DISTINCT FROM correlation_id::text)
    OR (payload ? 'idempotencyKey' AND lower(payload->>'idempotencyKey') IS DISTINCT FROM idempotency_key::text)
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid intake input'; END IF;
  IF (payload->>'expectedRevision')::numeric > 2147483646 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid intake input';
  END IF;
  v_organization_id := (payload->>'organizationId')::uuid;
  v_intake_id := (payload->>'intakeId')::uuid;
  expected_revision := (payload->>'expectedRevision')::integer;
  requested_status := payload->>'status';
  IF (v_intake_id IS NULL AND (expected_revision<>0 OR requested_status='submitted'))
    OR (v_intake_id IS NOT NULL AND expected_revision=0) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid intake input';
  END IF;

  -- Serialize checks with the existing audited writer. No access rule is relaxed.
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access',v_organization_id,'Save intake',correlation_id,idempotency_key);
  IF (payload->>'actorIdentityId')::uuid IS DISTINCT FROM context.actor_identity_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied';
  END IF;
  IF mmhr_private.r1_security_actor('admin.access',NULL::uuid,context.authorization_time)
      IS DISTINCT FROM context.actor_identity_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied';
  END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'r3.intake.save',idempotency_key,payload);
  -- A retry remains valid after a later transition, but cannot perform another write.
  IF receipt IS NULL AND v_intake_id IS NOT NULL THEN
    SELECT i.* INTO intake FROM public.intakes i
      WHERE i.id=v_intake_id AND i.organization_id=v_organization_id FOR UPDATE;
    IF NOT FOUND OR intake.revision<>expected_revision
      OR intake.status NOT IN ('draft','in_progress')
      OR (intake.status='in_progress' AND requested_status='draft') THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Intake revision denied';
    END IF;
    IF requested_status='submitted' AND NOT EXISTS (
      SELECT 1 FROM public.intake_requirements r
      WHERE r.intake_id=intake.id AND r.organization_id=intake.organization_id
        AND r.status='active' AND r.importance IN ('must','nice')
    ) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Intake needs an applicable requirement'; END IF;
  END IF;
  RETURN mmhr_private.r3_save_intake_impl(payload,correlation_id,idempotency_key);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_save_intake(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_save_intake(jsonb,uuid,uuid) TO authenticated;
