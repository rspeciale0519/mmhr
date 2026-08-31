CREATE TABLE "mmhr_private"."security_authority_guard" (
	"singleton_key" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "security_authority_guard_singleton_ck" CHECK ("mmhr_private"."security_authority_guard"."singleton_key" = 1),
	CONSTRAINT "security_authority_guard_revision_ck" CHECK ("mmhr_private"."security_authority_guard"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "security_command_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_identity_id" uuid NOT NULL,
	"command" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_digest" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"audit_event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_command_receipts_digest_ck" CHECK ("security_command_receipts"."request_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "security_command_receipts_command_ck" CHECK ("security_command_receipts"."command" ~ '^[a-z][a-z0-9_.]+$'),
	CONSTRAINT "security_command_receipts_action_ck" CHECK ("security_command_receipts"."action" ~ '^[a-z][a-z0-9_.]+$')
);
--> statement-breakpoint
ALTER TABLE "security_bootstrap_state" ADD COLUMN "second_target_identity_id" uuid;--> statement-breakpoint
ALTER TABLE "admin_delegation_grants" ADD COLUMN "can_view" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_delegation_grants" ADD COLUMN "can_grant" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_delegation_grants" ADD COLUMN "can_revoke" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_delegation_grants" ADD COLUMN "can_delegate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_delegation_grants" ADD COLUMN "parent_grant_id" uuid;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD COLUMN "source_delegation_id" uuid;--> statement-breakpoint
ALTER TABLE "security_command_receipts" ADD CONSTRAINT "security_command_receipts_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_command_receipts" ADD CONSTRAINT "security_command_receipts_audit_event_id_audit_events_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "public"."audit_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "security_command_receipts_request_uq" ON "security_command_receipts" USING btree ("actor_identity_id","command","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "security_command_receipts_audit_uq" ON "security_command_receipts" USING btree ("audit_event_id");--> statement-breakpoint
ALTER TABLE "security_bootstrap_state" ADD CONSTRAINT "security_bootstrap_state_second_target_identity_id_identities_id_fk" FOREIGN KEY ("second_target_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_delegation_grants" ADD CONSTRAINT "admin_delegation_grants_parent_grant_id_admin_delegation_grants_id_fk" FOREIGN KEY ("parent_grant_id") REFERENCES "public"."admin_delegation_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_source_delegation_id_admin_delegation_grants_id_fk" FOREIGN KEY ("source_delegation_id") REFERENCES "public"."admin_delegation_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_delegation_grants_parent_idx" ON "admin_delegation_grants" USING btree ("parent_grant_id");--> statement-breakpoint
ALTER TABLE "security_bootstrap_state" ADD CONSTRAINT "security_bootstrap_state_distinct_targets_ck" CHECK ("security_bootstrap_state"."second_target_identity_id" is null or "security_bootstrap_state"."second_target_identity_id" <> "security_bootstrap_state"."target_identity_id");--> statement-breakpoint
ALTER TABLE "admin_delegation_grants" ADD CONSTRAINT "admin_delegation_grants_parent_not_self_ck" CHECK ("admin_delegation_grants"."parent_grant_id" is null or "admin_delegation_grants"."parent_grant_id" <> "admin_delegation_grants"."id");

--> statement-breakpoint
-- Reviewed R1.4 additions. All commands share one transactional authority row.
ALTER TABLE mmhr_private.security_authority_guard ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.security_command_receipts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON mmhr_private.security_authority_guard, public.security_command_receipts
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
CREATE POLICY r1_deny_security_command_receipts ON public.security_command_receipts
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE TRIGGER security_command_receipts_append_only BEFORE UPDATE OR DELETE
  ON public.security_command_receipts FOR EACH ROW
  EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint
CREATE TRIGGER security_command_receipts_no_truncate BEFORE TRUNCATE
  ON public.security_command_receipts FOR EACH STATEMENT
  EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint
INSERT INTO mmhr_private.security_authority_guard(singleton_key, revision) VALUES (1, 0);--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_lock_security()
RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE mmhr_private.security_authority_guard SET revision = revision + 1 WHERE singleton_key = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  RETURN clock_timestamp();
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r1_lock_security() FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
SELECT mmhr_private.r1_lock_security();--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_verified_identity(identity_id uuid, require_mfa boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
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
  )
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_is_super_admin(identity_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT mmhr_private.r1_verified_identity($1, true) AND EXISTS (
    SELECT 1 FROM public.platform_role_assignments a
    JOIN public.role_definitions r ON r.stable_key = a.role_key
      AND r.kind = 'platform' AND r.state = 'active'
    WHERE a.identity_id = $1 AND a.state = 'active' AND a.role_key = 'super_admin'
  )
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_scope_supported(permission_key text, organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.permission_definitions d
    JOIN mmhr_private.r1_permission_registry() r ON r.key = d.key
      AND ROW(d.kind::text, d.platform_scope, d.organization_scope, d.minimum_assurance,
        d.internal_only, d.required_portal::text)
      IS NOT DISTINCT FROM ROW(r.kind, r.platform_scope, r.organization_scope,
        r.minimum_assurance, r.internal_only, r.required_portal)
    WHERE d.key = $1 AND d.active AND d.retired_at IS NULL
      AND CASE WHEN $2 IS NULL THEN d.platform_scope ELSE d.organization_scope END
  )
$$;--> statement-breakpoint

-- A bounded dependency path fails closed on a cycle, including dependencies
-- through permission-use overrides. A new grant ID cannot revive an old source.
CREATE FUNCTION mmhr_private.r1_delegation_is_valid(
  grant_id uuid, permission_key text, organization_id uuid, capability text,
  authorization_time timestamptz, durable boolean, visited uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  grant_row public.admin_delegation_grants%ROWTYPE;
  parent_row public.admin_delegation_grants%ROWTYPE;
  action_key text;
  next_visited uuid[];
BEGIN
  IF grant_id IS NULL OR authorization_time IS NULL OR durable IS NULL
    OR visited IS NULL OR grant_id = ANY(visited) OR cardinality(visited) >= 32
  THEN RETURN false; END IF;
  SELECT * INTO grant_row FROM public.admin_delegation_grants g WHERE g.id = grant_id;
  IF NOT FOUND OR grant_row.state <> 'active'
    OR grant_row.permission_key <> permission_key
    OR grant_row.organization_id IS DISTINCT FROM organization_id
    OR NOT mmhr_private.r1_scope_supported(permission_key, organization_id)
    OR (grant_row.expires_at IS NOT NULL AND (durable OR grant_row.expires_at <= authorization_time))
    OR NOT mmhr_private.r1_verified_identity(grant_row.grantee_identity_id, true)
    OR NOT mmhr_private.r1_verified_identity(grant_row.issued_by_identity_id, true)
  THEN RETURN false; END IF;
  action_key := CASE capability
    WHEN 'view' THEN CASE WHEN grant_row.can_view THEN 'permissions.view' END
    WHEN 'grant' THEN CASE WHEN grant_row.can_grant THEN 'permissions.grant' END
    WHEN 'revoke' THEN CASE WHEN grant_row.can_revoke THEN 'permissions.revoke' END
    WHEN 'delegate' THEN CASE WHEN grant_row.can_delegate THEN 'permissions.delegate' END
  END;
  IF action_key IS NULL THEN RETURN false; END IF;
  next_visited := array_append(visited, grant_id);
  IF NOT mmhr_private.r1_evaluate_permission(grant_row.grantee_identity_id,
    action_key, NULL::uuid, 'aal2', authorization_time, durable, next_visited)
  THEN RETURN false; END IF;
  IF NOT mmhr_private.r1_evaluate_permission(grant_row.issued_by_identity_id,
    'permissions.delegate', NULL::uuid, 'aal2', authorization_time, durable, next_visited)
  THEN RETURN false; END IF;
  IF grant_row.parent_grant_id IS NULL THEN
    RETURN mmhr_private.r1_is_super_admin(grant_row.issued_by_identity_id);
  END IF;
  SELECT * INTO parent_row FROM public.admin_delegation_grants g
    WHERE g.id = grant_row.parent_grant_id;
  IF NOT FOUND OR parent_row.grantee_identity_id <> grant_row.issued_by_identity_id
    OR parent_row.permission_key <> grant_row.permission_key
    OR parent_row.scope_key <> grant_row.scope_key
    OR NOT parent_row.can_delegate
    OR (grant_row.can_view AND NOT parent_row.can_view)
    OR (grant_row.can_grant AND NOT parent_row.can_grant)
    OR (grant_row.can_revoke AND NOT parent_row.can_revoke)
    OR (grant_row.can_delegate AND NOT parent_row.can_delegate)
    OR (parent_row.expires_at IS NOT NULL
      AND (grant_row.expires_at IS NULL OR grant_row.expires_at > parent_row.expires_at))
  THEN RETURN false; END IF;
  RETURN mmhr_private.r1_delegation_is_valid(parent_row.id, permission_key,
      organization_id, capability, authorization_time, durable, next_visited);
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_override_allow_is_valid(
  override_id uuid, authorization_time timestamptz, durable boolean,
  visited uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
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
  )
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_evaluate_permission(
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

  SELECT r.id INTO platform_role_id
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
  SELECT bool_or(d.effect = 'deny'), bool_or(d.effect = 'allow')
    INTO matching_deny, matching_allow
  FROM public.role_permission_defaults d
  WHERE d.permission_key = requested_permission_key
    AND d.role_definition_id IN (platform_role_id, organization_role_id);
  RETURN NOT coalesce(matching_deny, false) AND coalesce(matching_allow, false);
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r1_has_permission_for_identity(
  target_identity_id uuid, requested_permission_key text, selected_organization_id uuid,
  current_assurance text, authorization_time timestamptz
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT mmhr_private.r1_evaluate_permission($1,$2,$3,$4,$5,false)
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_assert_administration_capacity(authorization_time timestamptz)
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
  FOR organization_id IN SELECT o.id FROM public.orgs o WHERE o.status = 'active'
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

CREATE FUNCTION mmhr_private.r1_session_is_aal2(subject_id uuid, session_id uuid, authorization_time timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.sessions s JOIN auth.mfa_factors f ON f.id = s.factor_id AND f.user_id = s.user_id
    WHERE s.id = $2 AND s.user_id = $1 AND s.aal = 'aal2' AND f.status = 'verified'
      AND (s.not_after IS NULL OR s.not_after > $3)
  )
$$;--> statement-breakpoint

-- Identity-only reads need the same live provider/session boundary as permission
-- checks. This helper deliberately does not call the permission evaluator.
CREATE OR REPLACE FUNCTION mmhr_private.r1_request_identity_id()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  claims jsonb := auth.jwt();
  checked_at timestamptz := statement_timestamp();
  request_session uuid;
  actor uuid;
BEGIN
  IF claims ->> 'role' IS DISTINCT FROM 'authenticated'
    OR coalesce(claims ->> 'aal','') NOT IN ('aal1','aal2')
    OR coalesce(claims ->> 'exp','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims ->> 'sub','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR coalesce(claims ->> 'session_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
  THEN RETURN NULL; END IF;
  request_session := (claims ->> 'session_id')::uuid;
  IF (claims ->> 'exp')::numeric <= extract(epoch FROM checked_at) OR NOT EXISTS (
    SELECT 1 FROM auth.sessions s WHERE s.id = request_session AND s.user_id = auth.uid()
      AND (s.not_after IS NULL OR s.not_after > checked_at)
  ) THEN RETURN NULL; END IF;
  IF claims ->> 'aal' = 'aal2' AND NOT mmhr_private.r1_session_is_aal2(
    auth.uid(),request_session,checked_at
  ) THEN RETURN NULL; END IF;
  SELECT i.id INTO actor FROM public.identities i
    WHERE i.auth_user_id = auth.uid() AND mmhr_private.r1_verified_identity(i.id,false);
  RETURN actor;
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_security_actor(
  permission_key text, organization_id uuid, authorization_time timestamptz
)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  claims jsonb := auth.jwt();
  actor uuid;
BEGIN
  IF claims ->> 'role' IS DISTINCT FROM 'authenticated'
    OR claims ->> 'aal' IS DISTINCT FROM 'aal2'
    OR coalesce(claims ->> 'exp','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims ->> 'session_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  actor := mmhr_private.r1_request_identity_id();
  IF (claims ->> 'exp')::numeric <= extract(epoch FROM authorization_time)
    OR NOT mmhr_private.r1_session_is_aal2(auth.uid(), (claims ->> 'session_id')::uuid, authorization_time)
    OR NOT mmhr_private.r1_verified_identity(actor, true)
    OR EXISTS (SELECT 1 FROM public.identities i WHERE i.status = 'recovery_pending')
    OR NOT mmhr_private.r1_evaluate_permission(actor, permission_key,
      organization_id, 'aal2', authorization_time, false)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  RETURN actor;
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_protect_bootstrap_bindings()
RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.state = 'consumed'
    OR ROW(NEW.singleton_key, NEW.target_identity_id, NEW.second_target_identity_id,
      NEW.product_approval_reference, NEW.security_approval_reference, NEW.prepared_at)
    IS DISTINCT FROM ROW(OLD.singleton_key, OLD.target_identity_id, OLD.second_target_identity_id,
      OLD.product_approval_reference, OLD.security_approval_reference, OLD.prepared_at)
    OR NEW.state <> 'consumed' OR OLD.state <> 'prepared'
    OR OLD.second_target_identity_id IS NULL OR NEW.consumed_at IS NULL
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER security_bootstrap_bindings BEFORE UPDATE OR DELETE ON public.security_bootstrap_state
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_protect_bootstrap_bindings();--> statement-breakpoint
CREATE TRIGGER security_bootstrap_no_truncate BEFORE TRUNCATE ON public.security_bootstrap_state
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_prepare_super_admin_bootstrap(
  first_target uuid, second_target uuid, product_reference text, security_reference text, correlation_id uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  checked_at timestamptz;
BEGIN
  checked_at := mmhr_private.r1_lock_security();
  IF first_target IS NULL OR second_target IS NULL OR first_target = second_target
    OR correlation_id IS NULL OR product_reference IS NULL OR security_reference IS NULL
    OR product_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$'
    OR security_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$'
    OR product_reference ~ '://' OR security_reference ~ '://'
    OR product_reference = security_reference
    OR EXISTS (SELECT 1 FROM public.security_bootstrap_state)
    OR EXISTS (SELECT 1 FROM public.platform_role_assignments a WHERE a.state = 'active')
    OR 2 <> (
      SELECT count(*) FROM public.identities i JOIN auth.users u ON u.id = i.auth_user_id
      WHERE i.id IN (first_target,second_target) AND i.status IN ('pending','active')
        AND NOT i.migration_review_required AND i.email_verified_at IS NOT NULL
        AND u.email_confirmed_at IS NOT NULL AND i.normalized_email = lower(btrim(u.email))
        AND u.deleted_at IS NULL AND NOT u.is_anonymous
        AND (u.banned_until IS NULL OR u.banned_until <= checked_at)
    )
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  INSERT INTO public.security_bootstrap_state (
    singleton_key,target_identity_id,second_target_identity_id,product_approval_reference,
    security_approval_reference,prepared_at
  ) VALUES (1,first_target,second_target,product_reference,security_reference,checked_at);
  INSERT INTO public.audit_events (
    actor_type,actor_reference,command,action,entity_type,entity_id,reason,correlation_id
  ) VALUES ('system','reviewed-bootstrap','super_admin.bootstrap.prepare',
    'super_admin.bootstrap.prepare','security_bootstrap','1',
    'Record the two approved stable administrator bindings',correlation_id);
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_complete_super_admin_bootstrap(
  first_subject uuid, first_session uuid, first_expiry timestamptz,
  second_subject uuid, second_session uuid, second_expiry timestamptz, correlation_id uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  checked_at timestamptz;
  bootstrap public.security_bootstrap_state%ROWTYPE;
  bound_identity uuid;
  assignment_id uuid;
BEGIN
  checked_at := mmhr_private.r1_lock_security();
  SELECT * INTO bootstrap FROM public.security_bootstrap_state b WHERE b.singleton_key = 1;
  IF NOT FOUND OR bootstrap.state <> 'prepared' OR bootstrap.second_target_identity_id IS NULL
    OR correlation_id IS NULL OR first_expiry IS NULL OR second_expiry IS NULL
    OR first_expiry <= checked_at OR second_expiry <= checked_at
    OR first_subject IS NULL OR second_subject IS NULL OR first_subject = second_subject
    OR bootstrap.product_approval_reference = bootstrap.security_approval_reference
    OR EXISTS (SELECT 1 FROM public.platform_role_assignments a WHERE a.state = 'active')
    OR NOT mmhr_private.r1_session_is_aal2(first_subject,first_session,checked_at)
    OR NOT mmhr_private.r1_session_is_aal2(second_subject,second_session,checked_at)
    OR 2 <> (
      SELECT count(*) FROM public.identities i JOIN auth.users u ON u.id = i.auth_user_id
      WHERE (i.id = bootstrap.target_identity_id AND i.auth_user_id = first_subject
        OR i.id = bootstrap.second_target_identity_id AND i.auth_user_id = second_subject)
        AND i.status IN ('pending','active') AND NOT i.migration_review_required
        AND i.email_verified_at IS NOT NULL AND u.email_confirmed_at IS NOT NULL
        AND i.normalized_email = lower(btrim(u.email))
        AND u.deleted_at IS NULL AND NOT u.is_anonymous
        AND (u.banned_until IS NULL OR u.banned_until <= checked_at)
    )
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  FOREACH bound_identity IN ARRAY ARRAY[bootstrap.target_identity_id,bootstrap.second_target_identity_id]
  LOOP
    INSERT INTO public.audit_events(
      actor_type,actor_reference,command,action,entity_type,entity_id,reason,correlation_id,before_summary,after_summary
    ) SELECT 'system','reviewed-bootstrap','super_admin.bootstrap.complete','identity.status.change',
      'identity',i.id::text,'Activate an approved bootstrap identity',correlation_id,
      jsonb_build_object('status','pending'),jsonb_build_object('status','active')
      FROM public.identities i WHERE i.id = bound_identity AND i.status = 'pending';
    UPDATE public.identities SET status = 'active', activated_at = coalesce(activated_at,checked_at),
      updated_at = checked_at WHERE id = bound_identity;
    INSERT INTO public.platform_role_assignments(identity_id,role_key,assignment_reason,assigned_at)
      VALUES(bound_identity,'super_admin','Create an approved bootstrap administrator',checked_at)
      RETURNING id INTO assignment_id;
    INSERT INTO public.audit_events(
      actor_type,actor_reference,command,action,entity_type,entity_id,reason,correlation_id,after_summary
    ) VALUES ('system','reviewed-bootstrap','super_admin.bootstrap.complete','platform_role.assign',
      'platform_role_assignment',assignment_id::text,'Create an approved bootstrap administrator',
      correlation_id,jsonb_build_object('stable_key','super_admin','state','active'));
  END LOOP;
  UPDATE public.security_bootstrap_state SET state = 'consumed',consumed_at = checked_at WHERE singleton_key = 1;
  PERFORM mmhr_private.r1_assert_administration_capacity(checked_at);
  INSERT INTO public.audit_events(
    actor_type,actor_reference,command,action,entity_type,entity_id,reason,correlation_id,after_summary
  ) VALUES ('system','reviewed-bootstrap','super_admin.bootstrap.complete','super_admin.bootstrap.consume',
    'security_bootstrap','1','Consume the approved paired bootstrap once',correlation_id,
    jsonb_build_object('state','consumed','identity_count',2));
END
$$;--> statement-breakpoint

-- The private schema is not exposed by PostgREST. Explicit revocation also
-- protects future schema exposure and inherited public function defaults.
REVOKE ALL ON FUNCTION mmhr_private.r1_verified_identity(uuid,boolean),
  mmhr_private.r1_is_super_admin(uuid), mmhr_private.r1_scope_supported(text,uuid),
  mmhr_private.r1_delegation_is_valid(uuid,text,uuid,text,timestamptz,boolean,uuid[]),
  mmhr_private.r1_override_allow_is_valid(uuid,timestamptz,boolean,uuid[]),
  mmhr_private.r1_evaluate_permission(uuid,text,uuid,text,timestamptz,boolean,uuid[]),
  mmhr_private.r1_assert_administration_capacity(timestamptz),
  mmhr_private.r1_session_is_aal2(uuid,uuid,timestamptz),
  mmhr_private.r1_security_actor(text,uuid,timestamptz),
  mmhr_private.r1_protect_bootstrap_bindings(),
  mmhr_private.r1_prepare_super_admin_bootstrap(uuid,uuid,text,text,uuid),
  mmhr_private.r1_complete_super_admin_bootstrap(uuid,uuid,timestamptz,uuid,uuid,timestamptz,uuid)
FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

--> statement-breakpoint
CREATE FUNCTION mmhr_private.r1_security_reason_is_safe(value text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT $1 IS NOT NULL AND length(btrim($1)) BETWEEN 1 AND 500
    AND $1 !~ U&'[\0001-\001f\007f-\009f]'
    AND $1 !~* '[a-z][a-z0-9+.-]*://|\mwww[.]|\m(mailto|data):'
    AND $1 !~* '[?&](token|signature|secret|key|code|x-amz-signature)='
    AND $1 !~* '\m(password|passwd|secret([_ -]?key)?|client[_ -]?secret|api[_ -]?key|((access|refresh|session)[_ -]?)?token|session[_ -]?id|authorization|cookie)["'']?[[:space:]]*[:=][[:space:]]*[^[:space:]]+'
    AND $1 !~* '\m(bearer|basic)[[:space:]]+[^[:space:]]+'
    AND $1 !~ '\meyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+\M'
    AND $1 !~ '\m(sb_secret_|sk_live_|sk_test_|rk_live_|rk_test_|ghp_|github_pat_)[A-Za-z0-9_]+'
    AND $1 !~ '\msk-(proj-|svcacct-)?[A-Za-z0-9_-]{10,}|\mAKIA[0-9A-Z]{16}\M'
    AND $1 !~ '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_start_security_command(
  permission_key text, organization_id uuid, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS TABLE(actor_identity_id uuid, authorization_time timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT mmhr_private.r1_security_reason_is_safe(reason)
    OR correlation_id IS NULL OR idempotency_key IS NULL
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input'; END IF;
  authorization_time := mmhr_private.r1_lock_security();
  actor_identity_id := mmhr_private.r1_security_actor(permission_key, organization_id, authorization_time);
  RETURN NEXT;
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_replay_security_command(
  actor uuid, command_key text, idempotency_key uuid, input jsonb
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object('receipt_id',r.id,'entity_id',r.entity_id,'action',r.action,
    'request_matches',r.request_digest = encode(sha256(convert_to($4::text,'UTF8')),'hex'))
  FROM public.security_command_receipts r
  WHERE r.actor_identity_id = $1 AND r.command = $2 AND r.idempotency_key = $3
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_checked_receipt(
  actor uuid, command_key text, idempotency_key uuid, input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  receipt jsonb;
BEGIN
  receipt := mmhr_private.r1_replay_security_command(actor,command_key,idempotency_key,input);
  IF receipt IS NOT NULL AND receipt -> 'request_matches' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input';
  END IF;
  RETURN receipt - 'request_matches';
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_finish_security_command(
  actor uuid, command_key text, action_key text, target_type text, target_id uuid,
  organization_id uuid, reason text, correlation_id uuid, idempotency_key uuid,
  input jsonb, before_summary jsonb, after_summary jsonb, authorization_time timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  event_id uuid;
  receipt_id uuid;
BEGIN
  PERFORM mmhr_private.r1_assert_administration_capacity(authorization_time);
  INSERT INTO public.audit_events(actor_type,actor_identity_id,organization_id,command,
    action,entity_type,entity_id,reason,correlation_id,idempotency_key,before_summary,after_summary,occurred_at)
  VALUES ('user',actor,organization_id,command_key,action_key,target_type,target_id::text,
    btrim(reason),correlation_id,idempotency_key::text,before_summary,after_summary,authorization_time)
  RETURNING id INTO event_id;
  INSERT INTO public.security_command_receipts(actor_identity_id,command,idempotency_key,
    request_digest,entity_id,action,audit_event_id,created_at)
  VALUES(actor,command_key,idempotency_key,encode(sha256(convert_to(input::text,'UTF8')),'hex'),
    target_id,action_key,event_id,authorization_time) RETURNING id INTO receipt_id;
  RETURN jsonb_build_object('receipt_id',receipt_id,'entity_id',target_id,'action',action_key);
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_target_is_authority_ancestor(
  actor uuid, target uuid, authorization_time timestamptz
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH RECURSIVE edges(issuer,grantee) AS (
    SELECT g.issued_by_identity_id,g.grantee_identity_id FROM public.admin_delegation_grants g
    WHERE g.state = 'active' AND (g.expires_at IS NULL OR g.expires_at > $3)
      AND (g.can_view OR g.can_grant OR g.can_revoke OR g.can_delegate)
    UNION
    SELECT o.issued_by_identity_id,o.identity_id FROM public.user_permission_overrides o
    WHERE o.state = 'active' AND o.effect = 'allow' AND (o.expires_at IS NULL OR o.expires_at > $3)
    UNION
    SELECT a.assigned_by_identity_id,a.identity_id FROM public.platform_role_assignments a
    WHERE a.state = 'active' AND a.assigned_by_identity_id IS NOT NULL
  ), ancestors(id) AS (
    SELECT $1
    UNION
    SELECT e.issuer FROM edges e JOIN ancestors a ON a.id = e.grantee
  )
  SELECT $2 IS NULL OR EXISTS (SELECT 1 FROM ancestors WHERE id = $2)
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_change_identity_status(
  target_identity_id uuid, status text, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  target public.identities%ROWTYPE;
  input jsonb;
  receipt jsonb;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'identity.status.change',NULL::uuid,reason,correlation_id,idempotency_key);
  input := jsonb_build_object('target_identity_id',target_identity_id,'status',status,'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'identity.status.change',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  SELECT * INTO target FROM public.identities i WHERE i.id = target_identity_id;
  IF NOT FOUND OR mmhr_private.r1_target_is_authority_ancestor(
      context.actor_identity_id,target_identity_id,context.authorization_time)
    OR target.migration_review_required OR status IS NULL
    OR NOT (
      status = 'active' AND target.status IN ('pending','suspended')
      OR status = 'suspended' AND target.status = 'active'
      OR status = 'archived' AND target.status IN ('pending','active','suspended')
    )
    OR status = 'active' AND NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = target.auth_user_id
        AND u.email_confirmed_at IS NOT NULL AND target.email_verified_at IS NOT NULL
        AND target.normalized_email = lower(btrim(u.email))
        AND u.deleted_at IS NULL AND NOT u.is_anonymous
        AND (u.banned_until IS NULL OR u.banned_until <= context.authorization_time)
    )
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  UPDATE public.identities i SET status = mmhr_change_identity_status.status::public.identity_status,
    activated_at = CASE WHEN mmhr_change_identity_status.status = 'active'
      THEN coalesce(i.activated_at,context.authorization_time) ELSE i.activated_at END,
    suspended_at = CASE WHEN mmhr_change_identity_status.status = 'suspended'
      THEN context.authorization_time ELSE NULL END,
    archived_at = CASE WHEN mmhr_change_identity_status.status = 'archived'
      THEN context.authorization_time ELSE NULL END,
    updated_at = context.authorization_time WHERE i.id = target.id;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'identity.status.change',
    'identity.status.change','identity',target.id,NULL::uuid,reason,correlation_id,idempotency_key,input,
    jsonb_build_object('status',target.status),jsonb_build_object('status',status),context.authorization_time);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_change_membership_status(
  organization_id uuid, membership_id uuid, status text, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  target public.org_members%ROWTYPE;
  input jsonb;
  receipt jsonb;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    CASE WHEN status = 'revoked' THEN 'org.members.revoke' ELSE 'org.members.status.change' END,
    organization_id,reason,correlation_id,idempotency_key);
  input := jsonb_build_object('organization_id',organization_id,'membership_id',membership_id,
    'status',status,'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'membership.status.change',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  SELECT * INTO target FROM public.org_members m WHERE m.id = membership_id AND m.org_id = organization_id;
  IF NOT FOUND OR target.migration_review_required OR status IS NULL
    OR mmhr_private.r1_target_is_authority_ancestor(context.actor_identity_id,target.identity_id,context.authorization_time)
    OR NOT (status = 'active' AND target.status = 'suspended'
      OR status = 'suspended' AND target.status = 'active'
      OR status = 'revoked' AND target.status IN ('active','suspended'))
    OR status = 'active' AND NOT mmhr_private.r1_verified_identity(target.identity_id,false)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  UPDATE public.org_members m SET status = mmhr_change_membership_status.status::public.membership_status,
    suspended_at = CASE WHEN mmhr_change_membership_status.status = 'suspended'
      THEN context.authorization_time ELSE NULL END,
    revoked_at = CASE WHEN mmhr_change_membership_status.status = 'revoked'
      THEN context.authorization_time ELSE NULL END,
    revoked_by_identity_id = CASE WHEN mmhr_change_membership_status.status = 'revoked'
      THEN context.actor_identity_id ELSE NULL END,
    revoked_reason = CASE WHEN mmhr_change_membership_status.status = 'revoked' THEN btrim(reason) ELSE NULL END,
    updated_at = context.authorization_time WHERE m.id = target.id;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'membership.status.change',
    'membership.status.change','membership',target.id,organization_id,reason,correlation_id,idempotency_key,input,
    jsonb_build_object('status',target.status),jsonb_build_object('status',status),context.authorization_time);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_change_membership_role(
  organization_id uuid, membership_id uuid, role_key text, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  target public.org_members%ROWTYPE;
  input jsonb;
  receipt jsonb;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'org.members.change_role',organization_id,reason,correlation_id,idempotency_key);
  input := jsonb_build_object('organization_id',organization_id,'membership_id',membership_id,
    'role_key',role_key,'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'membership.role.change',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  SELECT * INTO target FROM public.org_members m WHERE m.id = membership_id AND m.org_id = organization_id;
  IF NOT FOUND OR target.migration_review_required OR target.status <> 'active'
    OR role_key IS NULL OR role_key NOT IN ('organization_admin','contributor','viewer')
    OR target.role_key = role_key OR NOT mmhr_private.r1_verified_identity(target.identity_id,false)
    OR mmhr_private.r1_target_is_authority_ancestor(context.actor_identity_id,target.identity_id,context.authorization_time)
    OR NOT mmhr_private.r1_evaluate_permission(context.actor_identity_id,'member.role.update',
      organization_id,'aal2',context.authorization_time,false)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  UPDATE public.org_members m SET role_key = mmhr_change_membership_role.role_key,
    role = CASE mmhr_change_membership_role.role_key WHEN 'organization_admin' THEN 'admin'
      ELSE mmhr_change_membership_role.role_key END::public.org_role,
    updated_at = context.authorization_time WHERE m.id = target.id;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'membership.role.change',
    'membership.role.change','membership',target.id,organization_id,reason,correlation_id,idempotency_key,input,
    jsonb_build_object('stable_key',target.role_key),jsonb_build_object('stable_key',role_key),context.authorization_time);
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION mmhr_private.r1_security_reason_is_safe(text),
  mmhr_private.r1_start_security_command(text,uuid,text,uuid,uuid),
  mmhr_private.r1_replay_security_command(uuid,text,uuid,jsonb),
  mmhr_private.r1_checked_receipt(uuid,text,uuid,jsonb),
  mmhr_private.r1_finish_security_command(uuid,text,text,text,uuid,uuid,text,uuid,uuid,jsonb,jsonb,jsonb,timestamptz),
  mmhr_private.r1_target_is_authority_ancestor(uuid,uuid,timestamptz),
  public.mmhr_change_identity_status(uuid,text,text,uuid,uuid),
  public.mmhr_change_membership_status(uuid,uuid,text,text,uuid,uuid),
  public.mmhr_change_membership_role(uuid,uuid,text,text,uuid,uuid)
FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_change_identity_status(uuid,text,text,uuid,uuid),
  public.mmhr_change_membership_status(uuid,uuid,text,text,uuid,uuid),
  public.mmhr_change_membership_role(uuid,uuid,text,text,uuid,uuid)
TO authenticated;

--> statement-breakpoint
-- Current session checks belong at the caller boundary, not in hypothetical
-- durable-capacity evaluation. Revoked sessions cannot reuse old AAL2 tokens.
CREATE OR REPLACE FUNCTION mmhr_private.r1_request_has_permission(
  permission_key text, organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  claims jsonb := auth.jwt();
  checked_at timestamptz := statement_timestamp();
  request_session uuid;
BEGIN
  IF claims ->> 'role' IS DISTINCT FROM 'authenticated'
    OR coalesce(claims ->> 'aal','') NOT IN ('aal1','aal2')
    OR coalesce(claims ->> 'exp','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims ->> 'session_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
  THEN RETURN false; END IF;
  request_session := (claims ->> 'session_id')::uuid;
  IF (claims ->> 'exp')::numeric <= extract(epoch FROM checked_at) OR NOT EXISTS (
    SELECT 1 FROM auth.sessions s WHERE s.id = request_session AND s.user_id = auth.uid()
      AND (s.not_after IS NULL OR s.not_after > checked_at)
  ) THEN RETURN false; END IF;
  IF claims ->> 'aal' = 'aal2' AND NOT mmhr_private.r1_session_is_aal2(
    auth.uid(), request_session, checked_at
  ) THEN RETURN false; END IF;
  RETURN mmhr_private.r1_evaluate_permission(mmhr_private.r1_request_identity_id(),
    permission_key,organization_id,claims ->> 'aal',checked_at,false);
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r1_audit_summary_is_safe(value jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT $1 IS NULL OR (
    jsonb_typeof($1) = 'object' AND NOT EXISTS (
      SELECT 1 FROM jsonb_each($1) e(key,item)
      WHERE CASE
        WHEN e.key = 'stable_key' THEN NOT (jsonb_typeof(e.item) = 'string'
          AND e.item #>> '{}' IN ('super_admin','admin','staff','organization_admin','contributor','viewer'))
        WHEN e.key IN ('state','status') THEN NOT (jsonb_typeof(e.item) = 'string'
          AND e.item #>> '{}' IN ('pending','linked','active','recovery_pending','suspended','archived',
            'revoked','accepted','expired','draft','approved','rejected','retired','verified',
            'consumed','cancelled','completed','in_flight','succeeded','failed','outcome_unknown'))
        WHEN e.key = 'version' THEN NOT (jsonb_typeof(e.item) = 'number'
          AND e.item #>> '{}' ~ '^[1-9][0-9]{0,8}$')
        WHEN e.key IN ('identity_count','membership_count','invitation_count','role_definition_count') THEN NOT (
          jsonb_typeof(e.item) = 'number' AND e.item #>> '{}' ~ '^(0|[1-9][0-9]{0,8})$')
        WHEN e.key IN ('can_view','can_grant','can_revoke','can_delegate') THEN jsonb_typeof(e.item) <> 'boolean'
        WHEN e.key IN ('record_id','identity_id','organization_id','source_delegation_id','parent_grant_id') THEN NOT (
          e.item = 'null'::jsonb OR jsonb_typeof(e.item) = 'string'
          AND e.item #>> '{}' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
        WHEN e.key = 'permission_key' THEN NOT (jsonb_typeof(e.item) = 'string'
          AND length(e.item #>> '{}') <= 128 AND e.item #>> '{}' ~ '^[a-z][a-z0-9_]*([.][a-z][a-z0-9_]*)+$')
        WHEN e.key = 'effect' THEN NOT (jsonb_typeof(e.item) = 'string' AND e.item #>> '{}' IN ('allow','deny'))
        WHEN e.key = 'type' THEN NOT (jsonb_typeof(e.item) = 'string' AND e.item #>> '{}' IN ('internal','customer','vendor'))
        WHEN e.key = 'portal' THEN NOT (jsonb_typeof(e.item) = 'string' AND e.item #>> '{}' IN ('customer','vendor'))
        WHEN e.key = 'expires_at_epoch' THEN NOT (e.item = 'null'::jsonb OR
          jsonb_typeof(e.item) = 'number' AND e.item #>> '{}' ~ '^[0-9]{1,12}([.][0-9]{1,6})?$')
        ELSE true
      END
    )
  )
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_assert_permission_ceiling(
  actor uuid, permission_key text, organization_id uuid, capability text, selected_grant_id uuid,
  expires_at timestamptz, enforce_expiry boolean, authorization_time timestamptz
)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  grant_row public.admin_delegation_grants%ROWTYPE;
BEGIN
  IF capability IS NULL OR capability NOT IN ('view','grant','revoke','delegate')
    OR NOT mmhr_private.r1_scope_supported(permission_key,organization_id)
    OR NOT mmhr_private.r1_evaluate_permission(actor,'permissions.' || capability,
      NULL::uuid,'aal2',authorization_time,false)
    OR (organization_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.orgs o WHERE o.id = organization_id AND o.status <> 'archived'
    ))
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  IF selected_grant_id IS NULL AND mmhr_private.r1_is_super_admin(actor) THEN RETURN NULL; END IF;
  SELECT * INTO grant_row FROM public.admin_delegation_grants g
    WHERE g.grantee_identity_id = actor AND g.permission_key = r1_assert_permission_ceiling.permission_key
      AND g.organization_id IS NOT DISTINCT FROM r1_assert_permission_ceiling.organization_id
      AND g.state = 'active' AND (selected_grant_id IS NULL OR g.id = selected_grant_id);
  IF NOT FOUND OR NOT mmhr_private.r1_delegation_is_valid(grant_row.id,permission_key,
      organization_id,capability,authorization_time,false)
    OR enforce_expiry AND grant_row.expires_at IS NOT NULL
      AND (expires_at IS NULL OR expires_at > grant_row.expires_at)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  RETURN grant_row.id;
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_override_summary(row_value public.user_permission_overrides)
RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT jsonb_build_object('record_id',($1).id,'identity_id',($1).identity_id,
    'permission_key',($1).permission_key,'organization_id',($1).organization_id,
    'effect',($1).effect,'state',($1).state,'source_delegation_id',($1).source_delegation_id,
    'expires_at_epoch',extract(epoch FROM ($1).expires_at))
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_set_permission_override(
  target_identity_id uuid, permission_key text, organization_id uuid, effect text,
  expires_at timestamptz, source_delegation_id uuid, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  previous public.user_permission_overrides%ROWTYPE;
  changed public.user_permission_overrides%ROWTYPE;
  input jsonb;
  receipt jsonb;
  source_id uuid;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    CASE WHEN effect = 'allow' THEN 'permissions.grant' ELSE 'permissions.revoke' END,
    NULL::uuid,reason,correlation_id,idempotency_key);
  input := jsonb_build_object('target_identity_id',target_identity_id,'permission_key',permission_key,
    'organization_id',organization_id,'effect',effect,'expires_at',extract(epoch FROM expires_at),
    'source_delegation_id',source_delegation_id,'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'permission_override.set',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  IF effect IS NULL OR effect NOT IN ('allow','deny')
    OR expires_at IS NOT NULL AND (NOT isfinite(expires_at) OR expires_at <= context.authorization_time)
    OR NOT mmhr_private.r1_verified_identity(target_identity_id,false)
    OR mmhr_private.r1_target_is_authority_ancestor(context.actor_identity_id,target_identity_id,context.authorization_time)
    OR NOT mmhr_private.r1_is_super_admin(context.actor_identity_id) AND source_delegation_id IS NULL
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  source_id := mmhr_private.r1_assert_permission_ceiling(context.actor_identity_id,permission_key,
    organization_id,CASE WHEN effect = 'allow' THEN 'grant' ELSE 'revoke' END,
    source_delegation_id,expires_at,true,context.authorization_time);
  SELECT * INTO previous FROM public.user_permission_overrides o
  WHERE o.identity_id = target_identity_id AND o.permission_key = mmhr_set_permission_override.permission_key
    AND o.organization_id IS NOT DISTINCT FROM mmhr_set_permission_override.organization_id AND o.state = 'active';
  IF FOUND THEN
    -- Replacement revokes a historical record and issues a new record. Require
    -- both ceilings so expiry or provenance changes cannot evade either limit.
    PERFORM mmhr_private.r1_assert_permission_ceiling(context.actor_identity_id,permission_key,
      organization_id,'grant',NULL::uuid,NULL::timestamptz,false,context.authorization_time);
    PERFORM mmhr_private.r1_assert_permission_ceiling(context.actor_identity_id,permission_key,
      organization_id,'revoke',NULL::uuid,NULL::timestamptz,false,context.authorization_time);
    UPDATE public.user_permission_overrides SET state = 'revoked',revoked_at = context.authorization_time,
      revoked_by_identity_id = context.actor_identity_id,revocation_reason = btrim(reason) WHERE id = previous.id;
  END IF;
  INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,
    scope_key,effect,expires_at,source_delegation_id,issued_by_identity_id,issue_reason,created_at)
  VALUES(target_identity_id,permission_key,
    CASE WHEN organization_id IS NULL THEN 'platform' ELSE 'organization' END::public.permission_scope_kind,
    organization_id,CASE WHEN organization_id IS NULL THEN 'platform' ELSE 'organization:' || organization_id::text END,
    effect::public.permission_effect,expires_at,CASE WHEN effect = 'allow' THEN source_id ELSE NULL END,
    context.actor_identity_id,btrim(reason),context.authorization_time) RETURNING * INTO changed;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'permission_override.set',
    'permission_override.set','permission_override',changed.id,organization_id,reason,correlation_id,idempotency_key,input,
    CASE WHEN previous.id IS NOT NULL THEN mmhr_private.r1_override_summary(previous) END,
    mmhr_private.r1_override_summary(changed),context.authorization_time);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_revoke_permission_override(
  override_id uuid, expected_effect text, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  target public.user_permission_overrides%ROWTYPE;
  changed public.user_permission_overrides%ROWTYPE;
  input jsonb;
  receipt jsonb;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    CASE WHEN expected_effect = 'deny' THEN 'permissions.grant' ELSE 'permissions.revoke' END,
    NULL::uuid,reason,correlation_id,idempotency_key);
  input := jsonb_build_object('override_id',override_id,'expected_effect',expected_effect,'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'permission_override.revoke',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  SELECT * INTO target FROM public.user_permission_overrides o WHERE o.id = override_id;
  IF NOT FOUND OR target.state <> 'active' OR expected_effect IS DISTINCT FROM target.effect::text
    OR mmhr_private.r1_target_is_authority_ancestor(context.actor_identity_id,target.identity_id,context.authorization_time)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  PERFORM mmhr_private.r1_assert_permission_ceiling(context.actor_identity_id,target.permission_key,
    target.organization_id,CASE WHEN target.effect = 'deny' THEN 'grant' ELSE 'revoke' END,
    NULL::uuid,NULL::timestamptz,false,context.authorization_time);
  UPDATE public.user_permission_overrides SET state = 'revoked',revoked_at = context.authorization_time,
    revoked_by_identity_id = context.actor_identity_id,revocation_reason = btrim(reason)
    WHERE id = target.id RETURNING * INTO changed;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'permission_override.revoke',
    'permission_override.revoke','permission_override',target.id,target.organization_id,reason,correlation_id,idempotency_key,input,
    mmhr_private.r1_override_summary(target),mmhr_private.r1_override_summary(changed),context.authorization_time);
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_delegation_summary(row_value public.admin_delegation_grants)
RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT jsonb_build_object('record_id',($1).id,'identity_id',($1).grantee_identity_id,
    'permission_key',($1).permission_key,'organization_id',($1).organization_id,
    'state',($1).state,'parent_grant_id',($1).parent_grant_id,'can_view',($1).can_view,
    'can_grant',($1).can_grant,'can_revoke',($1).can_revoke,'can_delegate',($1).can_delegate,
    'expires_at_epoch',extract(epoch FROM ($1).expires_at))
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_set_delegation(
  grantee_identity_id uuid, permission_key text, organization_id uuid,
  can_view boolean, can_grant boolean, can_revoke boolean, can_delegate boolean,
  expires_at timestamptz, parent_grant_id uuid, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  previous public.admin_delegation_grants%ROWTYPE;
  parent_row public.admin_delegation_grants%ROWTYPE;
  changed public.admin_delegation_grants%ROWTYPE;
  input jsonb;
  receipt jsonb;
  parent_id uuid;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'permissions.delegate',NULL::uuid,reason,correlation_id,idempotency_key);
  input := jsonb_build_object('grantee_identity_id',grantee_identity_id,'permission_key',permission_key,
    'organization_id',organization_id,'can_view',can_view,'can_grant',can_grant,'can_revoke',can_revoke,
    'can_delegate',can_delegate,'expires_at',extract(epoch FROM expires_at),'parent_grant_id',parent_grant_id,
    'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'delegation.set',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  IF can_view IS NULL OR can_grant IS NULL OR can_revoke IS NULL OR can_delegate IS NULL
    OR NOT (can_view OR can_grant OR can_revoke OR can_delegate)
    OR expires_at IS NOT NULL AND (NOT isfinite(expires_at) OR expires_at <= context.authorization_time)
    OR NOT mmhr_private.r1_verified_identity(grantee_identity_id,true)
    OR NOT EXISTS (SELECT 1 FROM public.platform_role_assignments a
      WHERE a.identity_id = grantee_identity_id AND a.state = 'active')
    OR mmhr_private.r1_target_is_authority_ancestor(context.actor_identity_id,grantee_identity_id,context.authorization_time)
    OR NOT mmhr_private.r1_is_super_admin(context.actor_identity_id) AND parent_grant_id IS NULL
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  parent_id := mmhr_private.r1_assert_permission_ceiling(context.actor_identity_id,permission_key,
    organization_id,'delegate',parent_grant_id,expires_at,true,context.authorization_time);
  IF parent_id IS NOT NULL THEN
    SELECT * INTO parent_row FROM public.admin_delegation_grants g WHERE g.id = parent_id;
    IF can_view AND NOT parent_row.can_view OR can_grant AND NOT parent_row.can_grant
      OR can_revoke AND NOT parent_row.can_revoke OR can_delegate AND NOT parent_row.can_delegate
    THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  END IF;
  SELECT * INTO previous FROM public.admin_delegation_grants g
    WHERE g.grantee_identity_id = mmhr_set_delegation.grantee_identity_id
      AND g.permission_key = mmhr_set_delegation.permission_key
      AND g.organization_id IS NOT DISTINCT FROM mmhr_set_delegation.organization_id AND g.state = 'active';
  IF FOUND THEN
    PERFORM mmhr_private.r1_assert_permission_ceiling(context.actor_identity_id,permission_key,
      organization_id,'revoke',NULL::uuid,NULL::timestamptz,false,context.authorization_time);
    UPDATE public.admin_delegation_grants SET state = 'revoked',revoked_at = context.authorization_time,
      revoked_by_identity_id = context.actor_identity_id,revocation_reason = btrim(reason) WHERE id = previous.id;
  END IF;
  INSERT INTO public.admin_delegation_grants(grantee_identity_id,permission_key,scope_kind,
    organization_id,scope_key,can_view,can_grant,can_revoke,can_delegate,expires_at,parent_grant_id,
    issued_by_identity_id,issue_reason,created_at)
  VALUES(grantee_identity_id,permission_key,
    CASE WHEN organization_id IS NULL THEN 'platform' ELSE 'organization' END::public.permission_scope_kind,
    organization_id,CASE WHEN organization_id IS NULL THEN 'platform' ELSE 'organization:' || organization_id::text END,
    can_view,can_grant,can_revoke,can_delegate,expires_at,parent_id,context.actor_identity_id,btrim(reason),context.authorization_time)
  RETURNING * INTO changed;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'delegation.set',
    'delegation.set','delegation',changed.id,organization_id,reason,correlation_id,idempotency_key,input,
    CASE WHEN previous.id IS NOT NULL THEN mmhr_private.r1_delegation_summary(previous) END,
    mmhr_private.r1_delegation_summary(changed),context.authorization_time);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_revoke_delegation(
  grant_id uuid, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  target public.admin_delegation_grants%ROWTYPE;
  changed public.admin_delegation_grants%ROWTYPE;
  input jsonb;
  receipt jsonb;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'permissions.revoke',NULL::uuid,reason,correlation_id,idempotency_key);
  input := jsonb_build_object('grant_id',grant_id,'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'delegation.revoke',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  SELECT * INTO target FROM public.admin_delegation_grants g WHERE g.id = grant_id;
  IF NOT FOUND OR target.state <> 'active' OR mmhr_private.r1_target_is_authority_ancestor(
    context.actor_identity_id,target.grantee_identity_id,context.authorization_time)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  PERFORM mmhr_private.r1_assert_permission_ceiling(context.actor_identity_id,target.permission_key,
    target.organization_id,'revoke',NULL::uuid,NULL::timestamptz,false,context.authorization_time);
  UPDATE public.admin_delegation_grants SET state = 'revoked',revoked_at = context.authorization_time,
    revoked_by_identity_id = context.actor_identity_id,revocation_reason = btrim(reason)
    WHERE id = target.id RETURNING * INTO changed;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'delegation.revoke',
    'delegation.revoke','delegation',target.id,target.organization_id,reason,correlation_id,idempotency_key,input,
    mmhr_private.r1_delegation_summary(target),mmhr_private.r1_delegation_summary(changed),context.authorization_time);
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION mmhr_private.r1_assert_permission_ceiling(uuid,text,uuid,text,uuid,timestamptz,boolean,timestamptz),
  mmhr_private.r1_override_summary(public.user_permission_overrides),
  mmhr_private.r1_delegation_summary(public.admin_delegation_grants),
  public.mmhr_set_permission_override(uuid,text,uuid,text,timestamptz,uuid,text,uuid,uuid),
  public.mmhr_revoke_permission_override(uuid,text,text,uuid,uuid),
  public.mmhr_set_delegation(uuid,text,uuid,boolean,boolean,boolean,boolean,timestamptz,uuid,text,uuid,uuid),
  public.mmhr_revoke_delegation(uuid,text,uuid,uuid)
FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_set_permission_override(uuid,text,uuid,text,timestamptz,uuid,text,uuid,uuid),
  public.mmhr_revoke_permission_override(uuid,text,text,uuid,uuid),
  public.mmhr_set_delegation(uuid,text,uuid,boolean,boolean,boolean,boolean,timestamptz,uuid,text,uuid,uuid),
  public.mmhr_revoke_delegation(uuid,text,uuid,uuid)
TO authenticated;

--> statement-breakpoint
-- Role bundles cannot turn a narrow delegation into unrestricted root authority.
CREATE FUNCTION mmhr_private.r1_assert_role_change_ceiling(
  actor uuid, role_definition_id uuid, target_identity_id uuid, organization_id uuid,
  capability text, authorization_time timestamptz
)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  target_role public.role_definitions%ROWTYPE;
  permission record;
  membership record;
  required_capability text;
BEGIN
  IF capability NOT IN ('grant','revoke') OR capability IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  IF mmhr_private.r1_is_super_admin(actor) THEN RETURN; END IF;
  SELECT * INTO target_role FROM public.role_definitions r WHERE r.id = role_definition_id;
  IF NOT FOUND OR target_role.stable_key = 'super_admin'
    OR target_role.kind = 'organization' AND organization_id IS NULL
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  FOR permission IN
    SELECT p.key,p.platform_scope,p.organization_scope,d.effect
    FROM public.role_permission_defaults d JOIN public.permission_definitions p ON p.key = d.permission_key
    WHERE d.role_definition_id = target_role.id AND p.active AND p.retired_at IS NULL
  LOOP
    -- Adding a deny reduces authority; removing one can uncover another allow.
    required_capability := CASE WHEN permission.effect = 'allow' THEN capability
      WHEN capability = 'grant' THEN 'revoke' ELSE 'grant' END;
    IF target_role.kind = 'platform' AND permission.platform_scope THEN
      PERFORM mmhr_private.r1_assert_permission_ceiling(actor,permission.key,NULL::uuid,
        required_capability,NULL::uuid,NULL::timestamptz,false,authorization_time);
    END IF;
    IF permission.organization_scope THEN
      IF target_role.kind = 'organization' THEN
        PERFORM mmhr_private.r1_assert_permission_ceiling(actor,permission.key,organization_id,
          required_capability,NULL::uuid,NULL::timestamptz,false,authorization_time);
      ELSE
        FOR membership IN SELECT m.org_id FROM public.org_members m
          JOIN public.orgs o ON o.id = m.org_id
          WHERE m.identity_id = target_identity_id AND m.status IN ('active','suspended')
            AND o.status <> 'archived'
        LOOP
          PERFORM mmhr_private.r1_assert_permission_ceiling(actor,permission.key,membership.org_id,
            required_capability,NULL::uuid,NULL::timestamptz,false,authorization_time);
        END LOOP;
      END IF;
    END IF;
  END LOOP;
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_assign_platform_role(
  target_identity_id uuid, role_key text, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  target_role public.role_definitions%ROWTYPE;
  new_id uuid;
  input jsonb;
  receipt jsonb;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'platform_roles.assign',NULL::uuid,reason,correlation_id,idempotency_key);
  input := jsonb_build_object('target_identity_id',target_identity_id,'role_key',role_key,'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'platform_role.assign',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  SELECT * INTO target_role FROM public.role_definitions r
    WHERE r.stable_key = mmhr_assign_platform_role.role_key AND r.kind = 'platform' AND r.state = 'active';
  IF NOT FOUND OR role_key NOT IN ('super_admin','admin','staff')
    OR NOT mmhr_private.r1_verified_identity(target_identity_id,role_key = 'super_admin')
    OR mmhr_private.r1_target_is_authority_ancestor(context.actor_identity_id,target_identity_id,context.authorization_time)
    OR EXISTS (SELECT 1 FROM public.platform_role_assignments a WHERE a.identity_id = target_identity_id AND a.state = 'active')
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  PERFORM mmhr_private.r1_assert_role_change_ceiling(context.actor_identity_id,target_role.id,
    target_identity_id,NULL::uuid,'grant',context.authorization_time);
  INSERT INTO public.platform_role_assignments(identity_id,role_key,assigned_by_identity_id,
    assigned_at,assignment_reason,created_at)
  VALUES(target_identity_id,role_key,context.actor_identity_id,context.authorization_time,btrim(reason),context.authorization_time)
  RETURNING id INTO new_id;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'platform_role.assign',
    'platform_role.assign','platform_role_assignment',new_id,NULL::uuid,reason,correlation_id,idempotency_key,input,
    NULL,jsonb_build_object('identity_id',target_identity_id,'stable_key',role_key,'state','active'),context.authorization_time);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_revoke_platform_role(
  assignment_id uuid, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  target public.platform_role_assignments%ROWTYPE;
  target_role_id uuid;
  input jsonb;
  receipt jsonb;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'platform_roles.revoke',NULL::uuid,reason,correlation_id,idempotency_key);
  input := jsonb_build_object('assignment_id',assignment_id,'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'platform_role.revoke',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  SELECT * INTO target FROM public.platform_role_assignments a WHERE a.id = assignment_id;
  IF NOT FOUND OR target.state <> 'active'
    OR mmhr_private.r1_target_is_authority_ancestor(context.actor_identity_id,target.identity_id,context.authorization_time)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  SELECT r.id INTO target_role_id FROM public.role_definitions r
    WHERE r.stable_key = target.role_key AND r.kind = 'platform' AND r.state = 'active';
  PERFORM mmhr_private.r1_assert_role_change_ceiling(context.actor_identity_id,target_role_id,
    target.identity_id,NULL::uuid,'revoke',context.authorization_time);
  UPDATE public.platform_role_assignments a SET state = 'revoked',
    revoked_by_identity_id = context.actor_identity_id,revoked_at = context.authorization_time,
    revocation_reason = btrim(reason) WHERE a.id = target.id;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'platform_role.revoke',
    'platform_role.revoke','platform_role_assignment',target.id,NULL::uuid,reason,correlation_id,idempotency_key,input,
    jsonb_build_object('identity_id',target.identity_id,'stable_key',target.role_key,'state','active'),
    jsonb_build_object('identity_id',target.identity_id,'stable_key',target.role_key,'state','revoked'),context.authorization_time);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_activate_role_version(
  role_definition_id uuid, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  target public.role_definitions%ROWTYPE;
  previous public.role_definitions%ROWTYPE;
  affected record;
  input jsonb;
  receipt jsonb;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'role_versions.activate',NULL::uuid,reason,correlation_id,idempotency_key);
  input := jsonb_build_object('role_definition_id',role_definition_id,'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'role_version.activate',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  SELECT * INTO target FROM public.role_definitions r WHERE r.id = role_definition_id;
  IF NOT FOUND OR target.state <> 'approved' OR target.approved_at IS NULL
    OR EXISTS (SELECT 1 FROM public.platform_role_assignments a WHERE a.identity_id = context.actor_identity_id
      AND a.role_key = target.stable_key AND a.state = 'active')
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.identity_id = context.actor_identity_id
      AND m.role_key = target.stable_key AND m.status IN ('active','suspended'))
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  SELECT * INTO previous FROM public.role_definitions r
    WHERE r.stable_key = target.stable_key AND r.state = 'active' AND r.kind = target.kind;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  -- Root bypasses delegated ceilings, never self or authority-ancestor checks.
  FOR affected IN
    SELECT a.identity_id,NULL::uuid AS organization_id FROM public.platform_role_assignments a
      WHERE target.kind = 'platform' AND a.state = 'active' AND a.role_key = target.stable_key
    UNION
    SELECT m.identity_id,m.org_id FROM public.org_members m
      WHERE target.kind = 'organization' AND m.status IN ('active','suspended') AND m.role_key = target.stable_key
  LOOP
    IF mmhr_private.r1_target_is_authority_ancestor(context.actor_identity_id,affected.identity_id,context.authorization_time) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
    END IF;
    IF NOT mmhr_private.r1_is_super_admin(context.actor_identity_id) THEN
      PERFORM mmhr_private.r1_assert_role_change_ceiling(context.actor_identity_id,target.id,
        affected.identity_id,affected.organization_id,'grant',context.authorization_time);
      PERFORM mmhr_private.r1_assert_role_change_ceiling(context.actor_identity_id,previous.id,
        affected.identity_id,affected.organization_id,'revoke',context.authorization_time);
    END IF;
  END LOOP;
  IF NOT mmhr_private.r1_is_super_admin(context.actor_identity_id) THEN
    -- Even an unused platform role must not become an unrestricted root bundle.
    IF target.kind = 'platform' THEN
      PERFORM mmhr_private.r1_assert_role_change_ceiling(context.actor_identity_id,target.id,
        NULL::uuid,NULL::uuid,'grant',context.authorization_time);
      PERFORM mmhr_private.r1_assert_role_change_ceiling(context.actor_identity_id,previous.id,
        NULL::uuid,NULL::uuid,'revoke',context.authorization_time);
    END IF;
  END IF;
  UPDATE public.role_definitions r SET state = 'approved',activated_at = NULL,
    updated_at = context.authorization_time WHERE r.id = previous.id;
  UPDATE public.role_definitions r SET state = 'active',activated_at = context.authorization_time,
    updated_at = context.authorization_time WHERE r.id = target.id;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'role_version.activate',
    'role_version.activate','role_definition',target.id,NULL::uuid,reason,correlation_id,idempotency_key,input,
    jsonb_build_object('record_id',previous.id,'stable_key',previous.stable_key,'version',previous.version,'state','active'),
    jsonb_build_object('record_id',target.id,'stable_key',target.stable_key,'version',target.version,'state','active'),context.authorization_time);
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION mmhr_private.r1_assert_role_change_ceiling(uuid,uuid,uuid,uuid,text,timestamptz),
  public.mmhr_assign_platform_role(uuid,text,text,uuid,uuid),
  public.mmhr_revoke_platform_role(uuid,text,uuid,uuid),
  public.mmhr_activate_role_version(uuid,text,uuid,uuid)
FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_assign_platform_role(uuid,text,text,uuid,uuid),
  public.mmhr_revoke_platform_role(uuid,text,uuid,uuid),
  public.mmhr_activate_role_version(uuid,text,uuid,uuid)
TO authenticated;

--> statement-breakpoint
CREATE FUNCTION public.mmhr_change_organization_status(
  organization_id uuid, status text, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  target public.orgs%ROWTYPE;
  input jsonb;
  receipt jsonb;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'org.status.change',NULL::uuid,reason,correlation_id,idempotency_key);
  input := jsonb_build_object('organization_id',organization_id,'status',status,'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'organization.status.change',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  SELECT * INTO target FROM public.orgs o WHERE o.id = organization_id;
  IF NOT FOUND OR target.migration_review_required OR target.type IS NULL OR status IS NULL
    OR NOT (status = 'active' AND target.status = 'suspended'
      OR status = 'suspended' AND target.status = 'active'
      OR status = 'archived' AND target.status IN ('pending','active','suspended'))
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  -- Pending-to-active needs the separate reviewed initialization command.
  UPDATE public.orgs o SET status = mmhr_change_organization_status.status::public.organization_status,
    suspended_at = CASE WHEN mmhr_change_organization_status.status = 'suspended'
      THEN context.authorization_time ELSE NULL END,
    archived_at = CASE WHEN mmhr_change_organization_status.status = 'archived'
      THEN context.authorization_time ELSE NULL END,
    updated_at = context.authorization_time WHERE o.id = target.id;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'organization.status.change',
    'organization.status.change','organization',target.id,organization_id,reason,correlation_id,idempotency_key,input,
    jsonb_build_object('status',target.status),jsonb_build_object('status',status),context.authorization_time);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_change_organization_type(
  organization_id uuid, type text, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  target public.orgs%ROWTYPE;
  input jsonb;
  receipt jsonb;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'org.type.change',NULL::uuid,reason,correlation_id,idempotency_key);
  input := jsonb_build_object('organization_id',organization_id,'type',type,'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'organization.type.change',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  SELECT * INTO target FROM public.orgs o WHERE o.id = organization_id;
  IF NOT FOUND OR target.migration_review_required OR target.status = 'archived'
    OR type IS NULL OR type NOT IN ('internal','customer','vendor') OR target.type::text = type
    OR EXISTS (SELECT 1 FROM public.portal_access_grants g
      WHERE g.organization_id = target.id AND g.state = 'active' AND g.portal::text <> type)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  UPDATE public.orgs o SET type = mmhr_change_organization_type.type::public.organization_type,
    updated_at = context.authorization_time WHERE o.id = target.id;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'organization.type.change',
    'organization.type.change','organization',target.id,organization_id,reason,correlation_id,idempotency_key,input,
    CASE WHEN target.type IS NULL THEN NULL ELSE jsonb_build_object('type',target.type) END,
    jsonb_build_object('type',type),context.authorization_time);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_grant_portal_access(
  organization_id uuid, portal text, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  new_id uuid;
  input jsonb;
  receipt jsonb;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'portal.access.grant',organization_id,reason,correlation_id,idempotency_key);
  input := jsonb_build_object('organization_id',organization_id,'portal',portal,'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'portal_access.grant',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  IF portal IS NULL OR portal NOT IN ('customer','vendor') OR NOT EXISTS (
    SELECT 1 FROM public.orgs o WHERE o.id = organization_id AND o.type::text = portal
      AND o.status = 'active' AND NOT o.migration_review_required
  ) OR EXISTS (SELECT 1 FROM public.portal_access_grants g
    WHERE g.organization_id = mmhr_grant_portal_access.organization_id
      AND g.portal::text = mmhr_grant_portal_access.portal AND g.state = 'active')
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  INSERT INTO public.portal_access_grants(organization_id,portal,issued_by_identity_id,issue_reason,created_at)
  VALUES(organization_id,portal::public.portal_kind,context.actor_identity_id,btrim(reason),context.authorization_time)
  RETURNING id INTO new_id;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'portal_access.grant',
    'portal_access.grant','portal_access_grant',new_id,organization_id,reason,correlation_id,idempotency_key,input,
    NULL,jsonb_build_object('organization_id',organization_id,'portal',portal,'state','active'),context.authorization_time);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_revoke_portal_access(
  organization_id uuid, grant_id uuid, reason text, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  target public.portal_access_grants%ROWTYPE;
  input jsonb;
  receipt jsonb;
BEGIN
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'portal.access.revoke',organization_id,reason,correlation_id,idempotency_key);
  input := jsonb_build_object('organization_id',organization_id,'grant_id',grant_id,'reason',btrim(reason));
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'portal_access.revoke',idempotency_key,input);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  SELECT * INTO target FROM public.portal_access_grants g WHERE g.id = grant_id
    AND g.organization_id = mmhr_revoke_portal_access.organization_id;
  IF NOT FOUND OR target.state <> 'active' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  UPDATE public.portal_access_grants g SET state = 'revoked',revoked_at = context.authorization_time,
    revoked_by_identity_id = context.actor_identity_id,revocation_reason = btrim(reason) WHERE g.id = target.id;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'portal_access.revoke',
    'portal_access.revoke','portal_access_grant',target.id,organization_id,reason,correlation_id,idempotency_key,input,
    jsonb_build_object('organization_id',organization_id,'portal',target.portal,'state','active'),
    jsonb_build_object('organization_id',organization_id,'portal',target.portal,'state','revoked'),context.authorization_time);
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.mmhr_change_organization_status(uuid,text,text,uuid,uuid),
  public.mmhr_change_organization_type(uuid,text,text,uuid,uuid),
  public.mmhr_grant_portal_access(uuid,text,text,uuid,uuid),
  public.mmhr_revoke_portal_access(uuid,uuid,text,uuid,uuid)
FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_change_organization_status(uuid,text,text,uuid,uuid),
  public.mmhr_change_organization_type(uuid,text,text,uuid,uuid),
  public.mmhr_grant_portal_access(uuid,text,text,uuid,uuid),
  public.mmhr_revoke_portal_access(uuid,uuid,text,uuid,uuid)
TO authenticated;

--> statement-breakpoint
CREATE FUNCTION public.mmhr_read_permission_administration(
  permission_key text, organization_id uuid DEFAULT NULL, limit_count integer DEFAULT 50,
  after_override_id uuid DEFAULT NULL, after_delegation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor uuid;
  checked_at timestamptz := statement_timestamp();
  overrides jsonb;
  delegations jsonb;
  roles jsonb;
BEGIN
  IF limit_count IS NULL OR limit_count NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input';
  END IF;
  actor := mmhr_private.r1_security_actor('permissions.view',NULL::uuid,checked_at);
  PERFORM mmhr_private.r1_assert_permission_ceiling(actor,permission_key,organization_id,
    'view',NULL::uuid,NULL::timestamptz,false,checked_at);
  SELECT coalesce(jsonb_agg(mmhr_private.r1_override_summary(rows.item) ORDER BY rows.id),'[]'::jsonb)
    INTO overrides FROM (
      SELECT o AS item,o.id FROM public.user_permission_overrides o
      WHERE o.permission_key = mmhr_read_permission_administration.permission_key
        AND o.organization_id IS NOT DISTINCT FROM mmhr_read_permission_administration.organization_id
        AND (after_override_id IS NULL OR o.id > after_override_id)
      ORDER BY o.id LIMIT limit_count
    ) rows;
  SELECT coalesce(jsonb_agg(mmhr_private.r1_delegation_summary(rows.item) ORDER BY rows.id),'[]'::jsonb)
    INTO delegations FROM (
      SELECT g AS item,g.id FROM public.admin_delegation_grants g
      WHERE g.permission_key = mmhr_read_permission_administration.permission_key
        AND g.organization_id IS NOT DISTINCT FROM mmhr_read_permission_administration.organization_id
        AND (after_delegation_id IS NULL OR g.id > after_delegation_id)
      ORDER BY g.id LIMIT limit_count
    ) rows;
  SELECT coalesce(jsonb_agg(jsonb_build_object('stable_key',r.stable_key,'version',r.version,'effect',d.effect)
    ORDER BY r.stable_key),'[]'::jsonb) INTO roles
    FROM public.role_definitions r JOIN public.role_permission_defaults d ON d.role_definition_id = r.id
    WHERE r.state = 'active' AND d.permission_key = mmhr_read_permission_administration.permission_key
      AND (organization_id IS NOT NULL OR r.kind = 'platform');
  RETURN jsonb_build_object('overrides',overrides,'delegations',delegations,'roles',roles);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_read_permission_administration(text,uuid,integer,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_read_permission_administration(text,uuid,integer,uuid,uuid) TO authenticated;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION mmhr_private.r1_sync_permission_registry()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  inserted_count integer;
  checked_at timestamptz;
BEGIN
  checked_at := mmhr_private.r1_lock_security();
  IF EXISTS (SELECT 1 FROM public.identities i WHERE i.status = 'recovery_pending') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  LOCK TABLE public.permission_definitions IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (
    SELECT 1 FROM public.permission_definitions AS stored
    LEFT JOIN mmhr_private.r1_permission_registry() AS expected ON expected.key = stored.key
    WHERE expected.key IS NULL
      OR ROW(stored.kind::text,stored.description,stored.platform_scope,
        stored.organization_scope,stored.minimum_assurance,stored.internal_only,
        stored.required_portal::text,stored.active,stored.retired_at)
      IS DISTINCT FROM ROW(expected.kind,expected.description,expected.platform_scope,
        expected.organization_scope,expected.minimum_assurance,expected.internal_only,
        expected.required_portal,true,NULL::timestamptz)
  ) THEN RAISE EXCEPTION 'Permission registry differs from the reviewed definitions'; END IF;
  INSERT INTO public.permission_definitions(key,kind,description,platform_scope,
    organization_scope,minimum_assurance,internal_only,required_portal)
  SELECT key,kind::public.permission_kind,description,platform_scope,
    organization_scope,minimum_assurance,internal_only,required_portal::public.portal_kind
  FROM mmhr_private.r1_permission_registry() ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF EXISTS (SELECT 1 FROM public.security_bootstrap_state b WHERE b.state = 'consumed')
    OR EXISTS (SELECT 1 FROM public.platform_role_assignments a WHERE a.state = 'active')
  THEN PERFORM mmhr_private.r1_assert_administration_capacity(checked_at); END IF;
  IF inserted_count > 0 THEN
    INSERT INTO public.audit_events(actor_type,actor_reference,command,action,entity_type,
      entity_id,reason,correlation_id,occurred_at)
    VALUES('migration','r1.4-permission-registry','permissions.synchronize','permission_registry.sync',
      'permission_registry','r1.4-v1','Synchronize the reviewed R1 permission definitions',gen_random_uuid(),checked_at);
  END IF;
  RETURN inserted_count;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r1_sync_permission_registry()
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
