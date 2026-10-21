CREATE TABLE "role_revocation_authorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_assignment_id" uuid NOT NULL,
	"role_definition_id" uuid NOT NULL,
	"actor_identity_id" uuid NOT NULL,
	"authority_kind" "grant_authority_kind" NOT NULL,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_revocation_authorities_kind_ck" CHECK ("role_revocation_authorities"."authority_kind" in ('super_admin', 'delegated'))
);
--> statement-breakpoint
ALTER TABLE "permission_authority_sources" DROP CONSTRAINT "permission_authority_sources_parent_ck";--> statement-breakpoint
ALTER TABLE "permission_authority_sources" ADD COLUMN "role_revocation_id" uuid;--> statement-breakpoint
ALTER TABLE "role_revocation_authorities" ADD CONSTRAINT "role_revocation_authorities_platform_assignment_id_platform_role_assignments_id_fk" FOREIGN KEY ("platform_assignment_id") REFERENCES "public"."platform_role_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_revocation_authorities" ADD CONSTRAINT "role_revocation_authorities_role_definition_id_role_definitions_id_fk" FOREIGN KEY ("role_definition_id") REFERENCES "public"."role_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_revocation_authorities" ADD CONSTRAINT "role_revocation_authorities_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "role_revocation_authorities_assignment_uq" ON "role_revocation_authorities" USING btree ("platform_assignment_id");--> statement-breakpoint
CREATE INDEX "role_revocation_authorities_actor_idx" ON "role_revocation_authorities" USING btree ("actor_identity_id");--> statement-breakpoint
ALTER TABLE "permission_authority_sources" ADD CONSTRAINT "permission_authority_sources_role_revocation_id_role_revocation_authorities_id_fk" FOREIGN KEY ("role_revocation_id") REFERENCES "public"."role_revocation_authorities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_authority_sources_revocation_scope_uq" ON "permission_authority_sources" USING btree ("role_revocation_id","permission_key","scope_key") WHERE "permission_authority_sources"."role_revocation_id" is not null;--> statement-breakpoint
ALTER TABLE "permission_authority_sources" ADD CONSTRAINT "permission_authority_sources_parent_ck" CHECK (
      ("permission_authority_sources"."role_authority_id" is not null and "permission_authority_sources"."deny_removal_id" is null and "permission_authority_sources"."role_revocation_id" is null)
      or ("permission_authority_sources"."role_authority_id" is null and "permission_authority_sources"."deny_removal_id" is not null
        and "permission_authority_sources"."role_revocation_id" is null and "permission_authority_sources"."purpose" = 'deny_removal')
      or ("permission_authority_sources"."role_authority_id" is null and "permission_authority_sources"."deny_removal_id" is null
        and "permission_authority_sources"."role_revocation_id" is not null and "permission_authority_sources"."purpose" = 'deny_removal')
    );
--> statement-breakpoint

-- A revoked platform role first blocks all internal access. Its removed denies
-- must still be accounted for if another platform role is assigned later.
SELECT mmhr_private.r1_lock_security();--> statement-breakpoint
ALTER TABLE public.role_revocation_authorities ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON public.role_revocation_authorities
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
CREATE POLICY r1_deny_role_revocation_authorities ON public.role_revocation_authorities
  FOR ALL TO anon, authenticated, mmhr_worker USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE TRIGGER role_revocation_authorities_append_only BEFORE UPDATE OR DELETE
  ON public.role_revocation_authorities FOR EACH ROW
  EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint
CREATE TRIGGER role_revocation_authorities_no_truncate BEFORE TRUNCATE
  ON public.role_revocation_authorities FOR EACH STATEMENT
  EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_fresh_platform_role_allow(
  p_identity_id uuid, p_permission_key text, p_organization_id uuid, p_after timestamptz,
  p_authorization_time timestamptz, p_durable boolean, p_visited uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_role_assignments a
    JOIN public.role_definitions r ON r.stable_key = a.role_key AND r.kind = 'platform' AND r.state = 'active'
    JOIN public.role_permission_defaults d ON d.role_definition_id = r.id AND d.permission_key = $2 AND d.effect = 'allow'
    JOIN public.role_authority_records origin ON origin.platform_assignment_id = a.id
      AND origin.record_kind = 'platform_assignment'
    JOIN public.role_authority_records activation ON activation.role_definition_id = r.id
      AND activation.record_kind = 'role_activation' AND activation.activated_at = r.activated_at
    WHERE a.identity_id = $1 AND a.state = 'active'
      AND (origin.created_at > $4 OR activation.created_at > $4)
      AND mmhr_private.r1_assignment_authority_allows(a.id,$2,$3,$5,$6,$7)
      AND mmhr_private.r1_role_authority_allows(activation.id,$2,$3,'allow',$5,$6,$7)
  )
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_role_revocation_guards_are_valid(
  p_identity_id uuid, p_permission_key text, p_organization_id uuid,
  p_authorization_time timestamptz, p_durable boolean, p_visited uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  assignment public.platform_role_assignments%ROWTYPE;
  authority public.role_revocation_authorities%ROWTYPE;
BEGIN
  IF p_authorization_time IS NULL OR p_durable IS NULL OR p_visited IS NULL
    OR cardinality(p_visited) >= 32 THEN RETURN false; END IF;
  FOR assignment IN SELECT a.* FROM public.platform_role_assignments a
    WHERE a.identity_id = p_identity_id AND a.state = 'revoked'
  LOOP
    -- A new explicit positive bundle can reauthorize the key. A replacement
    -- ceiling, or a bundle which merely omits the old deny, cannot do so.
    IF mmhr_private.r1_fresh_platform_role_allow(p_identity_id,p_permission_key,p_organization_id,
      assignment.revoked_at,p_authorization_time,p_durable,p_visited) THEN CONTINUE; END IF;
    SELECT source.* INTO authority FROM public.role_revocation_authorities source
    JOIN public.role_definitions r ON r.id = source.role_definition_id
    WHERE source.platform_assignment_id = assignment.id
      AND source.actor_identity_id = assignment.revoked_by_identity_id
      AND source.created_at = assignment.revoked_at AND r.stable_key = assignment.role_key AND r.kind = 'platform';
    IF NOT FOUND OR authority.id = ANY(p_visited) THEN RETURN false; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.role_permission_defaults d
      WHERE d.role_definition_id = authority.role_definition_id
        AND d.permission_key = p_permission_key AND d.effect = 'deny') THEN CONTINUE; END IF;
    IF authority.authority_kind = 'super_admin' THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.permission_authority_sources s
      JOIN public.admin_delegation_grants g ON g.id = s.source_delegation_id
      WHERE s.role_revocation_id = authority.id AND s.role_authority_id IS NULL AND s.deny_removal_id IS NULL
        AND s.purpose = 'deny_removal' AND s.permission_key = p_permission_key
        AND s.organization_id IS NOT DISTINCT FROM p_organization_id
        AND g.grantee_identity_id = authority.actor_identity_id
        AND mmhr_private.r1_delegation_is_valid(g.id,p_permission_key,p_organization_id,
          'grant',p_authorization_time,p_durable,array_append(p_visited,authority.id))
    ) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_capture_role_revocation(
  p_actor uuid, p_assignment_id uuid, p_role_id uuid, p_authorization_time timestamptz, p_correlation_id uuid
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  authority_id uuid;
  root_authority boolean;
  source_id uuid;
  permission record;
  scope record;
BEGIN
  IF p_actor IS NULL OR p_authorization_time IS NULL OR p_correlation_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.platform_role_assignments a
      JOIN public.role_definitions r ON r.stable_key = a.role_key AND r.kind = 'platform' AND r.state = 'active'
      WHERE a.id = p_assignment_id AND a.state = 'active' AND a.identity_id <> p_actor AND r.id = p_role_id)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  root_authority := mmhr_private.r1_is_super_admin(p_actor);
  INSERT INTO public.role_revocation_authorities(platform_assignment_id,role_definition_id,
    actor_identity_id,authority_kind,correlation_id,created_at)
  VALUES(p_assignment_id,p_role_id,p_actor,
    CASE WHEN root_authority THEN 'super_admin' ELSE 'delegated' END::public.grant_authority_kind,
    p_correlation_id,p_authorization_time) RETURNING id INTO authority_id;
  IF root_authority THEN RETURN; END IF;
  FOR permission IN SELECT d.permission_key FROM public.role_permission_defaults d
    WHERE d.role_definition_id = p_role_id AND d.effect = 'deny'
  LOOP
    FOR scope IN SELECT * FROM mmhr_private.r1_role_source_scopes(p_role_id,p_assignment_id,permission.permission_key)
    LOOP
      source_id := mmhr_private.r1_assert_permission_ceiling(p_actor,permission.permission_key,
        scope.organization_id,'grant',NULL::uuid,NULL::timestamptz,false,p_authorization_time);
      IF source_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
      INSERT INTO public.permission_authority_sources(role_revocation_id,purpose,permission_key,
        organization_id,scope_key,source_delegation_id,created_at)
      VALUES(authority_id,'deny_removal',permission.permission_key,scope.organization_id,
        CASE WHEN scope.organization_id IS NULL THEN 'platform' ELSE 'organization:' || scope.organization_id::text END,
        source_id,p_authorization_time);
    END LOOP;
  END LOOP;
END
$$;--> statement-breakpoint
-- End of assignment-revocation source helpers.

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

CREATE OR REPLACE FUNCTION public.mmhr_revoke_platform_role(
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
  PERFORM mmhr_private.r1_capture_role_revocation(context.actor_identity_id,target.id,
    target_role_id,context.authorization_time,correlation_id);
  UPDATE public.platform_role_assignments a SET state = 'revoked',
    revoked_by_identity_id = context.actor_identity_id,revoked_at = context.authorization_time,
    revocation_reason = btrim(reason) WHERE a.id = target.id;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'platform_role.revoke',
    'platform_role.revoke','platform_role_assignment',target.id,NULL::uuid,reason,correlation_id,idempotency_key,input,
    jsonb_build_object('identity_id',target.identity_id,'stable_key',target.role_key,'state','active'),
    jsonb_build_object('identity_id',target.identity_id,'stable_key',target.role_key,'state','revoked'),context.authorization_time);
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r1_target_is_authority_ancestor(
  actor uuid, target uuid, authorization_time timestamptz
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH RECURSIVE role_holders(authority_id,identity_id) AS (
    SELECT source.id,a.identity_id FROM public.platform_role_assignments a
    JOIN public.role_definitions r ON r.stable_key = a.role_key AND r.kind = 'platform' AND r.state = 'active'
    JOIN public.role_authority_records source ON source.role_definition_id = r.id
      AND source.record_kind = 'role_activation' AND source.activated_at = r.activated_at
    WHERE a.state = 'active'
    UNION
    SELECT source.id,m.identity_id FROM public.org_members m
    JOIN public.role_definitions r ON r.stable_key = m.role_key AND r.kind = 'organization' AND r.state = 'active'
    JOIN public.role_authority_records source ON source.role_definition_id = r.id
      AND source.record_kind = 'role_activation' AND source.activated_at = r.activated_at
    WHERE m.status IN ('active','suspended')
  ), edges(issuer,grantee) AS (
    SELECT g.issued_by_identity_id,g.grantee_identity_id FROM public.admin_delegation_grants g
    WHERE g.state = 'active' AND (g.expires_at IS NULL OR g.expires_at > $3)
      AND (g.can_view OR g.can_grant OR g.can_revoke OR g.can_delegate)
    UNION
    SELECT o.issued_by_identity_id,o.identity_id FROM public.user_permission_overrides o
    WHERE o.state = 'active' AND o.effect = 'allow' AND (o.expires_at IS NULL OR o.expires_at > $3)
    UNION
    SELECT a.assigned_by_identity_id,a.identity_id FROM public.platform_role_assignments a
    WHERE a.state = 'active' AND a.assigned_by_identity_id IS NOT NULL
    UNION
    SELECT source.actor_identity_id,h.identity_id FROM role_holders h
    JOIN public.role_authority_records source ON source.id = h.authority_id
    WHERE source.actor_identity_id IS NOT NULL
    UNION
    SELECT source.actor_identity_id,h.identity_id FROM role_holders h
    CROSS JOIN public.permission_definitions permission
    CROSS JOIN LATERAL mmhr_private.r1_role_deny_guard_origin(h.authority_id,permission.key) guard
    JOIN public.role_authority_records source ON source.id = guard.authority_id
    WHERE permission.active AND permission.retired_at IS NULL AND source.actor_identity_id IS NOT NULL
    UNION
    SELECT removal.actor_identity_id,removal.identity_id FROM public.permission_deny_removals removal
    WHERE (removal.guarded_until IS NULL OR removal.guarded_until > $3)
      AND NOT EXISTS (SELECT 1 FROM public.permission_deny_removals child WHERE child.previous_removal_id = removal.id)
    UNION
    SELECT removal.actor_identity_id,old_assignment.identity_id
    FROM public.role_revocation_authorities removal
    JOIN public.platform_role_assignments old_assignment ON old_assignment.id = removal.platform_assignment_id
    JOIN public.role_permission_defaults d ON d.role_definition_id = removal.role_definition_id AND d.effect = 'deny'
    JOIN public.permission_definitions p ON p.key = d.permission_key AND p.active AND p.retired_at IS NULL
    CROSS JOIN LATERAL (
      SELECT NULL::uuid AS organization_id WHERE p.platform_scope
      UNION SELECT m.org_id FROM public.org_members m WHERE p.organization_scope
        AND m.identity_id = old_assignment.identity_id AND m.status IN ('active','suspended')
    ) scope
    WHERE old_assignment.state = 'revoked'
      AND EXISTS (SELECT 1 FROM public.platform_role_assignments current_assignment
        WHERE current_assignment.identity_id = old_assignment.identity_id AND current_assignment.state = 'active')
      AND NOT mmhr_private.r1_fresh_platform_role_allow(old_assignment.identity_id,p.key,scope.organization_id,
        removal.created_at,$3,false)
  ), ancestors(id) AS (
    SELECT $1
    UNION
    SELECT e.issuer FROM edges e JOIN ancestors a ON a.id = e.grantee
  )
  SELECT $2 IS NULL OR EXISTS (SELECT 1 FROM ancestors WHERE id = $2)
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION
  mmhr_private.r1_fresh_platform_role_allow(uuid,text,uuid,timestamptz,timestamptz,boolean,uuid[]),
  mmhr_private.r1_role_revocation_guards_are_valid(uuid,text,uuid,timestamptz,boolean,uuid[]),
  mmhr_private.r1_capture_role_revocation(uuid,uuid,uuid,timestamptz,uuid)
FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint

-- Do not infer a historical role version from today's active version. Unknown
-- legacy revocations require a reviewed correction or fresh explicit authority.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.security_bootstrap_state b
    WHERE b.state = 'consumed' AND b.second_target_identity_id IS NOT NULL)
  THEN PERFORM mmhr_private.r1_assert_administration_capacity(clock_timestamp()); END IF;
END
$$;--> statement-breakpoint
INSERT INTO public.audit_events(actor_type,actor_reference,command,action,entity_type,entity_id,reason,correlation_id)
VALUES('migration','r1.4-assignment-deny-authority','role_authority.expand','role_authority.expand',
  'security_provenance','r1.4','Retain original authority when revoked roles remove permission denies',gen_random_uuid());
