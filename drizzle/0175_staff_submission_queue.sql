CREATE TABLE "mmhr_private"."staff_case_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	CONSTRAINT "staff_case_access_grants_state_ck" CHECK ("mmhr_private"."staff_case_access_grants"."state" in ('active', 'revoked')),
	CONSTRAINT "staff_case_access_grants_revocation_ck" CHECK (("mmhr_private"."staff_case_access_grants"."state" = 'active' and "mmhr_private"."staff_case_access_grants"."revoked_at" is null and "mmhr_private"."staff_case_access_grants"."revoked_reason" is null) or ("mmhr_private"."staff_case_access_grants"."state" = 'revoked' and "mmhr_private"."staff_case_access_grants"."revoked_at" is not null and "mmhr_private"."staff_case_access_grants"."revoked_reason" is not null)),
	CONSTRAINT "staff_case_access_grants_reason_ck" CHECK (length(btrim("mmhr_private"."staff_case_access_grants"."reason")) between 1 and 500),
	CONSTRAINT "staff_case_access_grants_time_ck" CHECK (isfinite("mmhr_private"."staff_case_access_grants"."opened_at"))
);
--> statement-breakpoint
ALTER TABLE "mmhr_private"."staff_case_access_grants" ADD CONSTRAINT "staff_case_access_grants_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."staff_case_access_grants" ADD CONSTRAINT "staff_case_access_grants_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."staff_case_access_grants" ADD CONSTRAINT "staff_case_access_grants_membership_id_org_members_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."org_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."staff_case_access_grants" ADD CONSTRAINT "staff_case_access_grants_intake_id_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."intakes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_case_access_grants_membership_uq" ON "mmhr_private"."staff_case_access_grants" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_case_access_grants_active_uq" ON "mmhr_private"."staff_case_access_grants" USING btree ("organization_id","identity_id") WHERE "mmhr_private"."staff_case_access_grants"."state" = 'active';

--> statement-breakpoint
-- Staff submission queue. Hand-written after the generated private table.
-- Forward: MMHR staff list submitted intakes from customer organizations and
-- open one audited case. The case adds one staff viewer membership and one
-- case grant. The evaluator accepts that grant in place of the staff
-- workspace.access override, which cannot be self-issued.
-- Customers and vendors gain nothing: every changed branch needs an active
-- platform role, and both RPCs need admin.access with AAL2.
-- Recovery: see the end of this file. Do not delete grants, memberships,
-- receipts, or audit events.
SELECT mmhr_private.r1_lock_security();--> statement-breakpoint

ALTER TABLE mmhr_private.staff_case_access_grants ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY staff_case_access_grants_default_deny ON mmhr_private.staff_case_access_grants
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);--> statement-breakpoint
REVOKE ALL ON TABLE mmhr_private.staff_case_access_grants
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint

-- True only for an active grant bound to the same active membership in an
-- active customer organization. Callers still need a platform role.
CREATE FUNCTION mmhr_private.r1_staff_case_access_is_active(p_identity_id uuid, p_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM mmhr_private.staff_case_access_grants g
    JOIN public.org_members m ON m.id = g.membership_id AND m.org_id = g.organization_id
      AND m.identity_id = g.identity_id AND m.status = 'active' AND m.role_key = 'viewer'
    JOIN public.orgs o ON o.id = g.organization_id AND o.type = 'customer'
    WHERE g.identity_id = $1 AND g.organization_id = $2 AND g.state = 'active'
  )
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r1_staff_case_access_is_active(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint

-- Copied from 0008 without change, except one added condition in the
-- platform-role organization gate: an active staff case grant.
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
    ) AND NOT mmhr_private.r1_staff_case_access_is_active(target_identity_id, selected_organization_id)
    THEN RETURN false; END IF;
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

-- Copied from 0101 without change, except the staff case viewer exemption.
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

-- Newest submitted customer intakes across customer organizations. The row
-- holds only routing metadata. Intake answers stay behind workspace access.
CREATE FUNCTION public.mmhr_get_staff_submission_queue(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid; v_limit integer := 25; v_after_time timestamptz; v_after_id uuid;
  v_checked_at timestamptz := statement_timestamp(); v_rows jsonb; v_next jsonb := NULL;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE k <> ALL(ARRAY['limit','after']))
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Submission queue fields are invalid'; END IF;
  v_actor := mmhr_private.r1_request_identity_id();
  IF v_actor IS NULL OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2'
    OR NOT coalesce(mmhr_private.r1_request_has_permission('admin.access',NULL::uuid),false)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Submission queue is unavailable'; END IF;
  IF payload ? 'limit' THEN
    IF jsonb_typeof(payload->'limit') <> 'number' OR (payload->>'limit') !~ '^[0-9]{1,2}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Submission queue fields are invalid'; END IF;
    v_limit := (payload->>'limit')::integer;
    IF v_limit NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Submission queue fields are invalid'; END IF;
  END IF;
  IF payload ? 'after' THEN
    IF jsonb_typeof(payload->'after') <> 'object' OR NOT payload->'after' ?& ARRAY['submittedAt','intakeId']
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload->'after') k WHERE k <> ALL(ARRAY['submittedAt','intakeId']))
      OR jsonb_typeof(payload#>'{after,submittedAt}') <> 'string' OR jsonb_typeof(payload#>'{after,intakeId}') <> 'string'
      OR payload#>>'{after,submittedAt}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
      OR payload#>>'{after,intakeId}' !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Submission queue fields are invalid'; END IF;
    v_after_time := (payload#>>'{after,submittedAt}')::timestamptz;
    v_after_id := (payload#>>'{after,intakeId}')::uuid;
    IF NOT pg_catalog.isfinite(v_after_time)
      OR pg_catalog.to_char(v_after_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') <> payload#>>'{after,submittedAt}'
    THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Submission queue fields are invalid'; END IF;
  END IF;

  WITH eligible AS (
    SELECT i.id, i.organization_id, i.status, i.submitted_at, o.name
    FROM public.intakes i
    JOIN public.orgs o ON o.id = i.organization_id AND o.type = 'customer'
      AND o.status = 'active' AND NOT o.migration_review_required
    WHERE i.status IN ('submitted','under_review') AND i.submitted_at IS NOT NULL
      AND (v_after_id IS NULL OR i.submitted_at < v_after_time
        OR i.submitted_at = v_after_time AND i.id > v_after_id)
    ORDER BY i.submitted_at DESC, i.id ASC LIMIT v_limit + 1
  ) SELECT coalesce(jsonb_agg(jsonb_build_object(
      'intakeId', e.id, 'organizationId', e.organization_id,
      'organizationName', e.name, 'status', e.status,
      'submittedAt', pg_catalog.to_char(e.submitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'callerHasAccess', mmhr_private.r1_evaluate_permission(v_actor, 'workspace.access',
        e.organization_id, 'aal2', v_checked_at, false),
      'staffWithAccess', (SELECT count(*)::integer FROM mmhr_private.staff_case_access_grants g
        WHERE g.organization_id = e.organization_id
          AND mmhr_private.r1_staff_case_access_is_active(g.identity_id, g.organization_id))
    ) ORDER BY e.submitted_at DESC, e.id ASC), '[]'::jsonb) INTO v_rows FROM eligible e;
  IF jsonb_array_length(v_rows) > v_limit THEN
    v_rows := v_rows - v_limit;
    v_next := jsonb_build_object('intakeId', v_rows->(v_limit-1)->'intakeId',
      'submittedAt', v_rows->(v_limit-1)->'submittedAt');
  END IF;
  RETURN jsonb_build_object('version', 1, 'items', v_rows, 'nextCursor', v_next);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_staff_submission_queue(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_get_staff_submission_queue(jsonb) TO authenticated;--> statement-breakpoint

-- Opens one submitted customer case for the verified staff caller. The
-- server derives the organization from the intake. Repeats never duplicate
-- membership or grants. Revoked or unexpected prior access is never reissued.
CREATE FUNCTION public.mmhr_open_staff_case(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; receipt jsonb; v_intake_id uuid; v_org uuid; v_subject uuid; v_membership uuid;
  v_reason text := 'Open a submitted customer case for MMHR review';
  grant_row mmhr_private.staff_case_access_grants%ROWTYPE;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object'
    OR NOT payload ? 'intakeId'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE k <> 'intakeId')
    OR jsonb_typeof(payload->'intakeId') <> 'string'
    OR payload->>'intakeId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid staff case input'; END IF;
  v_intake_id := (payload->>'intakeId')::uuid;
  -- Locks security writes, checks AAL2, the live session, and admin.access.
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'admin.access', NULL::uuid, v_reason, correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'staff.case.open', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO grant_row FROM mmhr_private.staff_case_access_grants g
    WHERE g.id = (receipt->>'entity_id')::uuid AND g.identity_id = context.actor_identity_id
      AND g.intake_id = v_intake_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('intakeId', v_intake_id, 'organizationId', grant_row.organization_id,
      'grantId', grant_row.id, 'outcomeCode', 'replayed', 'correlationId', correlation_id);
  END IF;

  SELECT i.organization_id INTO v_org FROM public.intakes i
  JOIN public.orgs o ON o.id = i.organization_id AND o.type = 'customer'
    AND o.status = 'active' AND NOT o.migration_review_required
  WHERE i.id = v_intake_id AND i.status IN ('submitted','under_review');
  IF v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;

  IF mmhr_private.r1_evaluate_permission(context.actor_identity_id, 'workspace.access', v_org,
      'aal2', context.authorization_time, false) THEN
    IF NOT mmhr_private.r1_evaluate_permission(context.actor_identity_id, 'evaluation.disclose', v_org,
        'aal2', context.authorization_time, false)
    THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    SELECT * INTO grant_row FROM mmhr_private.staff_case_access_grants g
    WHERE g.organization_id = v_org AND g.identity_id = context.actor_identity_id AND g.state = 'active';
    RETURN jsonb_build_object('intakeId', v_intake_id, 'organizationId', v_org,
      'grantId', grant_row.id, 'outcomeCode', 'existing', 'correlationId', correlation_id);
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
  VALUES (v_org, context.actor_identity_id, v_membership, v_intake_id, 'active', v_reason,
    correlation_id, context.authorization_time) RETURNING * INTO grant_row;
  -- Only staff who can already review by role can open a case. The checks
  -- run after the insert so the transaction rolls back on any denial.
  IF NOT mmhr_private.r1_evaluate_permission(context.actor_identity_id, 'workspace.access', v_org,
      'aal2', context.authorization_time, false)
    OR NOT mmhr_private.r1_evaluate_permission(context.actor_identity_id, 'evaluation.disclose', v_org,
      'aal2', context.authorization_time, false)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'staff.case.open', 'staff.case.open', 'staff_case_access', grant_row.id,
    v_org, v_reason, correlation_id, idempotency_key, payload, NULL::jsonb,
    jsonb_build_object('record_id', grant_row.id, 'identity_id', context.actor_identity_id,
      'organization_id', v_org, 'type', 'customer', 'stable_key', 'viewer', 'state', 'active'),
    context.authorization_time);
  RETURN jsonb_build_object('intakeId', v_intake_id, 'organizationId', v_org,
    'grantId', grant_row.id, 'outcomeCode', 'opened', 'correlationId', correlation_id);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_open_staff_case(jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_open_staff_case(jsonb, uuid, uuid) TO authenticated;--> statement-breakpoint

-- Refuse a populated migration that breaks current administration capacity.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.security_bootstrap_state b
    WHERE b.state = 'consumed' AND b.second_target_identity_id IS NOT NULL)
  THEN PERFORM mmhr_private.r1_assert_administration_capacity(clock_timestamp()); END IF;
END
$$;
-- Recovery (forward repair; keep every row):
-- 1. REVOKE EXECUTE ON FUNCTION public.mmhr_open_staff_case(jsonb,uuid,uuid),
--    public.mmhr_get_staff_submission_queue(jsonb) FROM authenticated;
-- 2. To end one case access, set the grant to state 'revoked' with revoked_at
--    and revoked_reason in a reviewed transaction. The evaluator then denies it.
-- 3. To remove the evaluator branch, apply a new migration that restores the
--    0008 r1_evaluate_permission and 0101 r1_assert_administration_capacity
--    bodies, after revoking every grant and its viewer membership.
