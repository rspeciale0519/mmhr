CREATE TYPE "public"."grant_authority_kind" AS ENUM('reviewed_owner', 'super_admin', 'delegated');--> statement-breakpoint
CREATE TYPE "public"."permission_authority_purpose" AS ENUM('allow', 'deny_removal');--> statement-breakpoint
CREATE TYPE "public"."role_authority_record_kind" AS ENUM('platform_assignment', 'role_activation');--> statement-breakpoint
CREATE TABLE "permission_authority_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_authority_id" uuid,
	"deny_removal_id" uuid,
	"purpose" "permission_authority_purpose" NOT NULL,
	"permission_key" text NOT NULL,
	"organization_id" uuid,
	"scope_key" text NOT NULL,
	"source_delegation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permission_authority_sources_parent_ck" CHECK (
      ("permission_authority_sources"."role_authority_id" is not null and "permission_authority_sources"."deny_removal_id" is null)
      or ("permission_authority_sources"."role_authority_id" is null and "permission_authority_sources"."deny_removal_id" is not null and "permission_authority_sources"."purpose" = 'deny_removal')
    ),
	CONSTRAINT "permission_authority_sources_scope_ck" CHECK (
      ("permission_authority_sources"."organization_id" is null and "permission_authority_sources"."scope_key" = 'platform')
      or ("permission_authority_sources"."organization_id" is not null and "permission_authority_sources"."scope_key" = 'organization:' || "permission_authority_sources"."organization_id"::text)
    )
);
--> statement-breakpoint
CREATE TABLE "permission_deny_removals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"override_id" uuid NOT NULL,
	"previous_removal_id" uuid,
	"identity_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"organization_id" uuid,
	"scope_key" text NOT NULL,
	"authority_kind" "grant_authority_kind" NOT NULL,
	"actor_identity_id" uuid NOT NULL,
	"guarded_until" timestamp with time zone,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permission_deny_removals_scope_ck" CHECK (
      ("permission_deny_removals"."organization_id" is null and "permission_deny_removals"."scope_key" = 'platform')
      or ("permission_deny_removals"."organization_id" is not null and "permission_deny_removals"."scope_key" = 'organization:' || "permission_deny_removals"."organization_id"::text)
    ),
	CONSTRAINT "permission_deny_removals_actor_ck" CHECK (
      "permission_deny_removals"."actor_identity_id" <> "permission_deny_removals"."identity_id" and "permission_deny_removals"."authority_kind" in ('super_admin', 'delegated')
    ),
	CONSTRAINT "permission_deny_removals_horizon_ck" CHECK ("permission_deny_removals"."guarded_until" is null or isfinite("permission_deny_removals"."guarded_until")),
	CONSTRAINT "permission_deny_removals_previous_ck" CHECK ("permission_deny_removals"."previous_removal_id" is null or "permission_deny_removals"."previous_removal_id" <> "permission_deny_removals"."id")
);
--> statement-breakpoint
CREATE TABLE "role_authority_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_kind" "role_authority_record_kind" NOT NULL,
	"authority_kind" "grant_authority_kind" NOT NULL,
	"platform_assignment_id" uuid,
	"role_definition_id" uuid NOT NULL,
	"previous_authority_id" uuid,
	"actor_identity_id" uuid,
	"activated_at" timestamp with time zone,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_authority_records_kind_ck" CHECK (
      ("role_authority_records"."record_kind" = 'platform_assignment' and "role_authority_records"."platform_assignment_id" is not null
        and "role_authority_records"."activated_at" is null and "role_authority_records"."previous_authority_id" is null)
      or ("role_authority_records"."record_kind" = 'role_activation' and "role_authority_records"."platform_assignment_id" is null
        and "role_authority_records"."activated_at" is not null and isfinite("role_authority_records"."activated_at"))
    ),
	CONSTRAINT "role_authority_records_actor_ck" CHECK (
      ("role_authority_records"."authority_kind" = 'reviewed_owner' and "role_authority_records"."actor_identity_id" is null)
      or ("role_authority_records"."authority_kind" in ('super_admin', 'delegated') and "role_authority_records"."actor_identity_id" is not null)
    ),
	CONSTRAINT "role_authority_records_previous_ck" CHECK (
      "role_authority_records"."previous_authority_id" is null or "role_authority_records"."previous_authority_id" <> "role_authority_records"."id"
    )
);
--> statement-breakpoint
ALTER TABLE "permission_authority_sources" ADD CONSTRAINT "permission_authority_sources_role_authority_id_role_authority_records_id_fk" FOREIGN KEY ("role_authority_id") REFERENCES "public"."role_authority_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_authority_sources" ADD CONSTRAINT "permission_authority_sources_deny_removal_id_permission_deny_removals_id_fk" FOREIGN KEY ("deny_removal_id") REFERENCES "public"."permission_deny_removals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_authority_sources" ADD CONSTRAINT "permission_authority_sources_permission_key_permission_definitions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permission_definitions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_authority_sources" ADD CONSTRAINT "permission_authority_sources_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_authority_sources" ADD CONSTRAINT "permission_authority_sources_source_delegation_id_admin_delegation_grants_id_fk" FOREIGN KEY ("source_delegation_id") REFERENCES "public"."admin_delegation_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_deny_removals" ADD CONSTRAINT "permission_deny_removals_override_id_user_permission_overrides_id_fk" FOREIGN KEY ("override_id") REFERENCES "public"."user_permission_overrides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_deny_removals" ADD CONSTRAINT "permission_deny_removals_previous_removal_id_permission_deny_removals_id_fk" FOREIGN KEY ("previous_removal_id") REFERENCES "public"."permission_deny_removals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_deny_removals" ADD CONSTRAINT "permission_deny_removals_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_deny_removals" ADD CONSTRAINT "permission_deny_removals_permission_key_permission_definitions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permission_definitions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_deny_removals" ADD CONSTRAINT "permission_deny_removals_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_deny_removals" ADD CONSTRAINT "permission_deny_removals_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_authority_records" ADD CONSTRAINT "role_authority_records_platform_assignment_id_platform_role_assignments_id_fk" FOREIGN KEY ("platform_assignment_id") REFERENCES "public"."platform_role_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_authority_records" ADD CONSTRAINT "role_authority_records_role_definition_id_role_definitions_id_fk" FOREIGN KEY ("role_definition_id") REFERENCES "public"."role_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_authority_records" ADD CONSTRAINT "role_authority_records_previous_authority_id_role_authority_records_id_fk" FOREIGN KEY ("previous_authority_id") REFERENCES "public"."role_authority_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_authority_records" ADD CONSTRAINT "role_authority_records_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_authority_sources_role_scope_uq" ON "permission_authority_sources" USING btree ("role_authority_id","purpose","permission_key","scope_key") WHERE "permission_authority_sources"."role_authority_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_authority_sources_removal_scope_uq" ON "permission_authority_sources" USING btree ("deny_removal_id","permission_key","scope_key") WHERE "permission_authority_sources"."deny_removal_id" is not null;--> statement-breakpoint
CREATE INDEX "permission_authority_sources_delegation_idx" ON "permission_authority_sources" USING btree ("source_delegation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_deny_removals_override_uq" ON "permission_deny_removals" USING btree ("override_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_deny_removals_successor_uq" ON "permission_deny_removals" USING btree ("previous_removal_id") WHERE "permission_deny_removals"."previous_removal_id" is not null;--> statement-breakpoint
CREATE INDEX "permission_deny_removals_scope_idx" ON "permission_deny_removals" USING btree ("identity_id","permission_key","scope_key");--> statement-breakpoint
CREATE INDEX "permission_deny_removals_actor_idx" ON "permission_deny_removals" USING btree ("actor_identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_authority_records_assignment_uq" ON "role_authority_records" USING btree ("platform_assignment_id") WHERE "role_authority_records"."platform_assignment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "role_authority_records_activation_uq" ON "role_authority_records" USING btree ("role_definition_id","activated_at") WHERE "role_authority_records"."record_kind" = 'role_activation';--> statement-breakpoint
CREATE INDEX "role_authority_records_actor_idx" ON "role_authority_records" USING btree ("actor_identity_id");--> statement-breakpoint
CREATE INDEX "role_authority_records_previous_idx" ON "role_authority_records" USING btree ("previous_authority_id");
--> statement-breakpoint

-- Forward-only provenance expansion. The old records and role versions stay
-- intact. Missing evidence denies positive access; it never becomes root trust.
-- Recovery uses a reviewed owner migration or a fresh authorized grant, not
-- mutation of these records. All changes below share the security writer lock.
SELECT mmhr_private.r1_lock_security();--> statement-breakpoint
ALTER TABLE public.role_authority_records ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.permission_deny_removals ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.permission_authority_sources ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON public.role_authority_records, public.permission_deny_removals,
  public.permission_authority_sources FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
CREATE POLICY r1_deny_role_authority_records ON public.role_authority_records
  FOR ALL TO anon, authenticated, mmhr_worker USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY r1_deny_permission_deny_removals ON public.permission_deny_removals
  FOR ALL TO anon, authenticated, mmhr_worker USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY r1_deny_permission_authority_sources ON public.permission_authority_sources
  FOR ALL TO anon, authenticated, mmhr_worker USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE TRIGGER role_authority_records_append_only BEFORE UPDATE OR DELETE
  ON public.role_authority_records FOR EACH ROW
  EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint
CREATE TRIGGER role_authority_records_no_truncate BEFORE TRUNCATE
  ON public.role_authority_records FOR EACH STATEMENT
  EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint
CREATE TRIGGER permission_deny_removals_append_only BEFORE UPDATE OR DELETE
  ON public.permission_deny_removals FOR EACH ROW
  EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint
CREATE TRIGGER permission_deny_removals_no_truncate BEFORE TRUNCATE
  ON public.permission_deny_removals FOR EACH STATEMENT
  EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint
CREATE TRIGGER permission_authority_sources_append_only BEFORE UPDATE OR DELETE
  ON public.permission_authority_sources FOR EACH ROW
  EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint
CREATE TRIGGER permission_authority_sources_no_truncate BEFORE TRUNCATE
  ON public.permission_authority_sources FOR EACH STATEMENT
  EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint

-- A matching immutable owner event proves the current activation, including
-- its exact activation time. A previous event cannot bless a later activation.
INSERT INTO public.role_authority_records(record_kind,authority_kind,role_definition_id,
  activated_at,correlation_id,created_at)
SELECT 'role_activation','reviewed_owner',r.id,r.activated_at,e.correlation_id,r.activated_at
FROM public.role_definitions r
JOIN LATERAL (
  SELECT a.correlation_id FROM public.audit_events a
  WHERE a.actor_type = 'migration' AND a.action = 'role_version.activate'
    AND a.entity_type = 'role_definition' AND a.entity_id = r.id::text
    AND a.occurred_at = r.activated_at
    AND a.after_summary ->> 'stable_key' = r.stable_key
    AND a.after_summary ->> 'version' = r.version::text
    AND a.after_summary ->> 'state' = 'active'
  ORDER BY a.id LIMIT 1
) e ON true
WHERE r.state = 'active' AND r.approved_at IS NOT NULL;--> statement-breakpoint

-- Paired bootstrap and reviewed owner assignments are independent authority.
-- Current role labels or an unrecorded owner INSERT do not prove past approval.
INSERT INTO public.role_authority_records(record_kind,authority_kind,platform_assignment_id,
  role_definition_id,correlation_id,created_at)
SELECT 'platform_assignment','reviewed_owner',a.id,r.id,e.correlation_id,a.assigned_at
FROM public.platform_role_assignments a
JOIN public.role_definitions r ON r.stable_key = a.role_key AND r.kind = 'platform' AND r.state = 'active'
JOIN LATERAL (
  SELECT event.correlation_id FROM public.audit_events event
  WHERE event.action = 'platform_role.assign' AND event.entity_type = 'platform_role_assignment'
    AND event.entity_id = a.id::text AND event.after_summary ->> 'stable_key' = a.role_key
    AND event.after_summary ->> 'state' = 'active'
    AND (event.actor_type = 'migration' OR (
      event.actor_type = 'system' AND event.actor_reference = 'reviewed-bootstrap'
      AND event.command = 'super_admin.bootstrap.complete' AND a.role_key = 'super_admin'
      AND EXISTS (SELECT 1 FROM public.security_bootstrap_state b
        WHERE b.singleton_key = 1 AND b.state = 'consumed' AND b.second_target_identity_id IS NOT NULL
          AND a.identity_id IN (b.target_identity_id,b.second_target_identity_id)
          AND a.assigned_at = b.consumed_at)
    ))
  ORDER BY event.id LIMIT 1
) e ON true
WHERE a.assigned_by_identity_id IS NULL;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_current_role_authority(p_role_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT a.id FROM public.role_authority_records a
  JOIN public.role_definitions r ON r.id = a.role_definition_id
  WHERE r.id = $1 AND r.state = 'active' AND a.record_kind = 'role_activation'
    AND a.activated_at = r.activated_at
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_role_authority_allows(
  p_authority_id uuid, p_permission_key text, p_organization_id uuid, p_purpose text,
  p_authorization_time timestamptz, p_durable boolean, p_visited uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE authority public.role_authority_records%ROWTYPE;
BEGIN
  IF p_authority_id IS NULL OR p_authorization_time IS NULL OR p_durable IS NULL
    OR p_visited IS NULL OR p_authority_id = ANY(p_visited) OR cardinality(p_visited) >= 32
    OR p_purpose IS NULL OR p_purpose NOT IN ('allow','deny_removal')
    OR NOT mmhr_private.r1_scope_supported(p_permission_key,p_organization_id)
  THEN RETURN false; END IF;
  SELECT * INTO authority FROM public.role_authority_records a WHERE a.id = p_authority_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF authority.authority_kind IN ('reviewed_owner','super_admin') THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.permission_authority_sources s
    JOIN public.admin_delegation_grants g ON g.id = s.source_delegation_id
    WHERE s.role_authority_id = authority.id AND s.deny_removal_id IS NULL
      AND s.purpose::text = p_purpose AND s.permission_key = p_permission_key
      AND s.organization_id IS NOT DISTINCT FROM p_organization_id
      AND g.grantee_identity_id = authority.actor_identity_id
      AND mmhr_private.r1_delegation_is_valid(g.id,p_permission_key,p_organization_id,
        'grant',p_authorization_time,p_durable,array_append(p_visited,authority.id))
  );
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_assignment_authority_allows(
  p_assignment_id uuid, p_permission_key text, p_organization_id uuid,
  p_authorization_time timestamptz, p_durable boolean, p_visited uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE authority public.role_authority_records%ROWTYPE;
BEGIN
  SELECT source.* INTO authority FROM public.role_authority_records source
  JOIN public.platform_role_assignments a ON a.id = source.platform_assignment_id
  JOIN public.role_definitions original ON original.id = source.role_definition_id
  WHERE a.id = p_assignment_id AND a.state = 'active' AND source.record_kind = 'platform_assignment'
    AND source.actor_identity_id IS NOT DISTINCT FROM a.assigned_by_identity_id
    AND source.created_at = a.assigned_at AND original.kind = 'platform'
    AND original.stable_key = a.role_key AND original.approved_at IS NOT NULL
    AND (source.authority_kind <> 'delegated' OR a.role_key <> 'super_admin');
  IF NOT FOUND OR p_visited IS NULL OR authority.id = ANY(p_visited)
    OR cardinality(p_visited) >= 32 THEN RETURN false; END IF;
  -- New keys come from the new activation. Existing keys always retain their
  -- original source, including exact org scopes absent when assignment occurred.
  IF NOT EXISTS (SELECT 1 FROM public.role_permission_defaults d
    WHERE d.role_definition_id = authority.role_definition_id
      AND d.permission_key = p_permission_key AND d.effect = 'allow')
  THEN RETURN true; END IF;
  RETURN mmhr_private.r1_role_authority_allows(authority.id,p_permission_key,p_organization_id,
    'allow',p_authorization_time,p_durable,p_visited);
END
$$;--> statement-breakpoint

-- A removed role deny can expose another role's allow. Absence-only revisions
-- retain that grant's original source. A newly added explicit allow is a fresh
-- grant; merely replacing a ceiling or copying an absence is not.
CREATE FUNCTION mmhr_private.r1_role_deny_guard_origin(
  p_authority_id uuid, p_permission_key text, p_visited uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS TABLE(proven boolean, authority_id uuid, purpose text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  current_record public.role_authority_records%ROWTYPE;
  previous_record public.role_authority_records%ROWTYPE;
  current_effect public.permission_effect;
  previous_effect public.permission_effect;
  inherited record;
BEGIN
  IF p_authority_id IS NULL OR p_visited IS NULL OR p_authority_id = ANY(p_visited)
    OR cardinality(p_visited) >= 32
  THEN RETURN QUERY SELECT false,NULL::uuid,NULL::text; RETURN; END IF;
  SELECT * INTO current_record FROM public.role_authority_records a WHERE a.id = p_authority_id;
  IF NOT FOUND OR current_record.record_kind <> 'role_activation'
  THEN RETURN QUERY SELECT false,NULL::uuid,NULL::text; RETURN; END IF;
  SELECT d.effect INTO current_effect FROM public.role_permission_defaults d
    WHERE d.role_definition_id = current_record.role_definition_id AND d.permission_key = p_permission_key;
  IF current_effect = 'deny'
  THEN RETURN QUERY SELECT true,NULL::uuid,NULL::text; RETURN; END IF;
  IF current_record.previous_authority_id IS NULL THEN
    RETURN QUERY SELECT current_record.authority_kind = 'reviewed_owner',NULL::uuid,NULL::text; RETURN;
  END IF;
  SELECT prior.* INTO previous_record FROM public.role_authority_records prior
  JOIN public.role_definitions old_role ON old_role.id = prior.role_definition_id
  JOIN public.role_definitions new_role ON new_role.id = current_record.role_definition_id
  WHERE prior.id = current_record.previous_authority_id AND prior.record_kind = 'role_activation'
    AND old_role.stable_key = new_role.stable_key AND old_role.kind = new_role.kind;
  IF NOT FOUND THEN RETURN QUERY SELECT false,NULL::uuid,NULL::text; RETURN; END IF;
  SELECT d.effect INTO previous_effect FROM public.role_permission_defaults d
    WHERE d.role_definition_id = previous_record.role_definition_id AND d.permission_key = p_permission_key;
  IF previous_effect = 'deny' THEN
    RETURN QUERY SELECT true,current_record.id,'deny_removal'::text; RETURN;
  END IF;
  SELECT * INTO inherited FROM mmhr_private.r1_role_deny_guard_origin(
    previous_record.id,p_permission_key,array_append(p_visited,current_record.id));
  IF inherited.proven IS DISTINCT FROM true
  THEN RETURN QUERY SELECT false,NULL::uuid,NULL::text; RETURN; END IF;
  IF inherited.authority_id IS NOT NULL AND current_effect = 'allow' THEN
    RETURN QUERY SELECT true,current_record.id,'allow'::text; RETURN;
  END IF;
  RETURN QUERY SELECT true,inherited.authority_id,inherited.purpose;
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_role_deny_guard_is_valid(
  p_role_id uuid, p_permission_key text, p_organization_id uuid,
  p_authorization_time timestamptz, p_durable boolean, p_visited uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE origin record;
BEGIN
  IF p_role_id IS NULL THEN RETURN true; END IF;
  SELECT * INTO origin FROM mmhr_private.r1_role_deny_guard_origin(
    mmhr_private.r1_current_role_authority(p_role_id),p_permission_key,p_visited);
  IF origin.proven IS DISTINCT FROM true THEN RETURN false; END IF;
  IF origin.authority_id IS NULL THEN RETURN true; END IF;
  RETURN mmhr_private.r1_role_authority_allows(origin.authority_id,p_permission_key,p_organization_id,
    origin.purpose,p_authorization_time,p_durable,p_visited);
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_override_deny_guards_are_valid(
  p_identity_id uuid, p_permission_key text, p_organization_id uuid,
  p_authorization_time timestamptz, p_durable boolean, p_visited uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  original_scope record;
  removal public.permission_deny_removals%ROWTYPE;
  removal_count integer;
BEGIN
  IF p_authorization_time IS NULL OR p_durable IS NULL OR p_visited IS NULL
    OR cardinality(p_visited) >= 32 THEN RETURN false; END IF;
  FOR original_scope IN
    SELECT DISTINCT o.organization_id,o.scope_key FROM public.user_permission_overrides o
    WHERE o.identity_id = p_identity_id AND o.permission_key = p_permission_key
      AND o.effect = 'deny' AND o.state = 'revoked'
      AND (o.organization_id IS NULL OR o.organization_id = p_organization_id)
  LOOP
    SELECT count(*) INTO removal_count FROM public.permission_deny_removals r
    WHERE r.identity_id = p_identity_id AND r.permission_key = p_permission_key
      AND r.scope_key = original_scope.scope_key
      AND NOT EXISTS (SELECT 1 FROM public.permission_deny_removals child WHERE child.previous_removal_id = r.id);
    IF removal_count > 1 THEN RETURN false; END IF;
    SELECT * INTO removal FROM public.permission_deny_removals r
    WHERE r.identity_id = p_identity_id AND r.permission_key = p_permission_key
      AND r.scope_key = original_scope.scope_key
      AND NOT EXISTS (SELECT 1 FROM public.permission_deny_removals child WHERE child.previous_removal_id = r.id);
    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM public.user_permission_overrides o
        WHERE o.identity_id = p_identity_id AND o.permission_key = p_permission_key
          AND o.scope_key = original_scope.scope_key AND o.effect = 'deny' AND o.state = 'revoked'
          AND (o.expires_at IS NULL OR o.expires_at > p_authorization_time))
      THEN RETURN false; END IF;
      CONTINUE;
    END IF;
    IF removal.guarded_until IS NOT NULL AND removal.guarded_until <= p_authorization_time THEN CONTINUE; END IF;
    IF removal.id = ANY(p_visited) THEN RETURN false; END IF;
    -- Every guarded historical removal must precede this immutable successor.
    -- Unrecorded later removals do not inherit its authority.
    IF EXISTS (SELECT 1 FROM public.user_permission_overrides o
      WHERE o.identity_id = p_identity_id AND o.permission_key = p_permission_key
        AND o.scope_key = original_scope.scope_key AND o.effect = 'deny' AND o.state = 'revoked'
        AND (o.expires_at IS NULL OR o.expires_at > p_authorization_time)
        AND (o.revoked_at > removal.created_at OR
          removal.guarded_until IS NOT NULL AND (o.expires_at IS NULL OR o.expires_at > removal.guarded_until)))
    THEN RETURN false; END IF;
    IF removal.authority_kind = 'super_admin' THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.permission_authority_sources s
      JOIN public.admin_delegation_grants g ON g.id = s.source_delegation_id
      WHERE s.deny_removal_id = removal.id AND s.role_authority_id IS NULL AND s.purpose = 'deny_removal'
        AND s.permission_key = p_permission_key AND s.organization_id IS NOT DISTINCT FROM p_organization_id
        AND g.grantee_identity_id = removal.actor_identity_id
        AND mmhr_private.r1_delegation_is_valid(g.id,p_permission_key,p_organization_id,
          'grant',p_authorization_time,p_durable,array_append(p_visited,removal.id))
    ) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$$;--> statement-breakpoint

-- A Super Admin assignment supplies independent ceiling authority only when
-- both the assignment and active version have proven independent provenance.
CREATE OR REPLACE FUNCTION mmhr_private.r1_is_super_admin(identity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT mmhr_private.r1_verified_identity($1,true) AND EXISTS (
    SELECT 1 FROM public.platform_role_assignments a
    JOIN public.role_definitions r ON r.stable_key = a.role_key
      AND r.kind = 'platform' AND r.state = 'active'
    JOIN public.role_authority_records origin ON origin.platform_assignment_id = a.id
      AND origin.record_kind = 'platform_assignment'
      AND origin.authority_kind IN ('reviewed_owner','super_admin')
      AND origin.actor_identity_id IS NOT DISTINCT FROM a.assigned_by_identity_id
      AND origin.created_at = a.assigned_at
    JOIN public.role_definitions original ON original.id = origin.role_definition_id
      AND original.kind = 'platform' AND original.stable_key = 'super_admin'
    JOIN public.role_authority_records version_source ON version_source.role_definition_id = r.id
      AND version_source.record_kind = 'role_activation' AND version_source.activated_at = r.activated_at
      AND version_source.authority_kind IN ('reviewed_owner','super_admin')
    WHERE a.identity_id = $1 AND a.state = 'active' AND a.role_key = 'super_admin'
  )
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_role_source_scopes(
  p_role_id uuid, p_assignment_id uuid, p_permission_key text
)
RETURNS TABLE(organization_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT NULL::uuid FROM public.role_definitions r
  JOIN public.permission_definitions p ON p.key = $3
  WHERE r.id = $1 AND r.kind = 'platform' AND p.platform_scope
  UNION
  SELECT m.org_id FROM public.role_definitions r
  JOIN public.permission_definitions p ON p.key = $3 AND p.organization_scope
  JOIN public.org_members m ON m.status IN ('active','suspended')
  JOIN public.orgs o ON o.id = m.org_id AND o.status <> 'archived'
  WHERE r.id = $1 AND (
    ($2 IS NOT NULL AND EXISTS (SELECT 1 FROM public.platform_role_assignments a
      WHERE a.id = $2 AND a.identity_id = m.identity_id AND a.role_key = r.stable_key AND a.state = 'active'))
    OR ($2 IS NULL AND r.kind = 'organization' AND m.role_key = r.stable_key)
    OR ($2 IS NULL AND r.kind = 'platform' AND EXISTS (SELECT 1 FROM public.platform_role_assignments a
      WHERE a.identity_id = m.identity_id AND a.role_key = r.stable_key AND a.state = 'active'))
  )
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_capture_role_authority(
  p_actor uuid, p_assignment_id uuid, p_role_id uuid, p_previous_authority_id uuid,
  p_authorization_time timestamptz, p_correlation_id uuid
)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  target_role public.role_definitions%ROWTYPE;
  previous public.role_authority_records%ROWTYPE;
  authority_id uuid;
  source_id uuid;
  root_authority boolean;
  permission record;
  scope record;
BEGIN
  IF p_actor IS NULL OR p_authorization_time IS NULL OR p_correlation_id IS NULL
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  SELECT * INTO target_role FROM public.role_definitions r WHERE r.id = p_role_id AND r.approved_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  root_authority := mmhr_private.r1_is_super_admin(p_actor);
  IF NOT root_authority AND target_role.stable_key = 'super_admin'
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  IF p_assignment_id IS NOT NULL THEN
    IF p_previous_authority_id IS NOT NULL OR target_role.kind <> 'platform' OR target_role.state <> 'active'
      OR NOT EXISTS (SELECT 1 FROM public.platform_role_assignments a
        WHERE a.id = p_assignment_id AND a.role_key = target_role.stable_key AND a.state = 'active'
          AND a.assigned_by_identity_id = p_actor AND a.assigned_at = p_authorization_time)
    THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  ELSE
    SELECT source.* INTO previous FROM public.role_authority_records source
    JOIN public.role_definitions r ON r.id = source.role_definition_id
    WHERE source.id = p_previous_authority_id AND source.record_kind = 'role_activation'
      AND r.stable_key = target_role.stable_key AND r.kind = target_role.kind
      AND r.state = 'active' AND source.activated_at = r.activated_at;
    IF NOT FOUND OR target_role.state <> 'approved'
    THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  END IF;
  INSERT INTO public.role_authority_records(record_kind,authority_kind,platform_assignment_id,
    role_definition_id,previous_authority_id,actor_identity_id,activated_at,correlation_id,created_at)
  VALUES(CASE WHEN p_assignment_id IS NULL THEN 'role_activation' ELSE 'platform_assignment' END::public.role_authority_record_kind,
    CASE WHEN root_authority THEN 'super_admin' ELSE 'delegated' END::public.grant_authority_kind,
    p_assignment_id,p_role_id,p_previous_authority_id,p_actor,
    CASE WHEN p_assignment_id IS NULL THEN p_authorization_time END,p_correlation_id,p_authorization_time)
  RETURNING id INTO authority_id;
  IF root_authority THEN RETURN authority_id; END IF;
  FOR permission IN
    SELECT d.permission_key,'allow'::text AS purpose FROM public.role_permission_defaults d
      WHERE d.role_definition_id = p_role_id AND d.effect = 'allow'
    UNION
    SELECT d.permission_key,'deny_removal'::text FROM public.role_permission_defaults d
      WHERE d.role_definition_id = previous.role_definition_id AND d.effect = 'deny'
        AND NOT EXISTS (SELECT 1 FROM public.role_permission_defaults current_default
          WHERE current_default.role_definition_id = p_role_id AND current_default.permission_key = d.permission_key
            AND current_default.effect = 'deny')
  LOOP
    FOR scope IN SELECT * FROM mmhr_private.r1_role_source_scopes(p_role_id,p_assignment_id,permission.permission_key)
    LOOP
      source_id := mmhr_private.r1_assert_permission_ceiling(p_actor,permission.permission_key,
        scope.organization_id,'grant',NULL::uuid,NULL::timestamptz,false,p_authorization_time);
      IF source_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
      INSERT INTO public.permission_authority_sources(role_authority_id,purpose,permission_key,
        organization_id,scope_key,source_delegation_id,created_at)
      VALUES(authority_id,permission.purpose::public.permission_authority_purpose,permission.permission_key,
        scope.organization_id,CASE WHEN scope.organization_id IS NULL THEN 'platform'
          ELSE 'organization:' || scope.organization_id::text END,source_id,p_authorization_time);
    END LOOP;
  END LOOP;
  RETURN authority_id;
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_capture_override_deny_removal(
  p_actor uuid, p_override_id uuid, p_authorization_time timestamptz, p_correlation_id uuid
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  target public.user_permission_overrides%ROWTYPE;
  previous public.permission_deny_removals%ROWTYPE;
  head_count integer;
  guarded_until timestamptz;
  removal_id uuid;
  source_id uuid;
  root_authority boolean;
  scope record;
BEGIN
  SELECT * INTO target FROM public.user_permission_overrides o WHERE o.id = p_override_id;
  IF NOT FOUND OR target.effect <> 'deny' OR target.state <> 'active'
    OR p_actor IS NULL OR p_actor = target.identity_id OR p_authorization_time IS NULL OR p_correlation_id IS NULL
    OR NOT mmhr_private.r1_scope_supported(target.permission_key,target.organization_id)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  SELECT count(*) INTO head_count FROM public.permission_deny_removals r
  WHERE r.identity_id = target.identity_id AND r.permission_key = target.permission_key AND r.scope_key = target.scope_key
    AND NOT EXISTS (SELECT 1 FROM public.permission_deny_removals child WHERE child.previous_removal_id = r.id);
  IF head_count > 1 THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  SELECT * INTO previous FROM public.permission_deny_removals r
  WHERE r.identity_id = target.identity_id AND r.permission_key = target.permission_key AND r.scope_key = target.scope_key
    AND NOT EXISTS (SELECT 1 FROM public.permission_deny_removals child WHERE child.previous_removal_id = r.id);
  -- The horizon includes unproven legacy removals. A newly authorized removal
  -- can repair them, but a short replacement deny cannot shorten their horizon.
  SELECT CASE WHEN bool_or(o.expires_at IS NULL) THEN NULL ELSE max(o.expires_at) END INTO guarded_until
  FROM public.user_permission_overrides o WHERE o.identity_id = target.identity_id
    AND o.permission_key = target.permission_key AND o.scope_key = target.scope_key AND o.effect = 'deny';
  IF previous.id IS NOT NULL THEN
    guarded_until := CASE WHEN previous.guarded_until IS NULL OR guarded_until IS NULL THEN NULL
      ELSE greatest(previous.guarded_until,guarded_until) END;
  END IF;
  root_authority := mmhr_private.r1_is_super_admin(p_actor);
  INSERT INTO public.permission_deny_removals(override_id,previous_removal_id,identity_id,
    permission_key,organization_id,scope_key,authority_kind,actor_identity_id,guarded_until,correlation_id,created_at)
  VALUES(target.id,previous.id,target.identity_id,target.permission_key,target.organization_id,target.scope_key,
    CASE WHEN root_authority THEN 'super_admin' ELSE 'delegated' END::public.grant_authority_kind,
    p_actor,guarded_until,p_correlation_id,p_authorization_time)
  RETURNING id INTO removal_id;
  IF root_authority THEN RETURN; END IF;
  FOR scope IN
    SELECT target.organization_id AS organization_id
    UNION
    SELECT m.org_id FROM public.org_members m JOIN public.orgs o ON o.id = m.org_id AND o.status <> 'archived'
    JOIN public.permission_definitions p ON p.key = target.permission_key AND p.organization_scope
    WHERE target.organization_id IS NULL AND m.identity_id = target.identity_id AND m.status IN ('active','suspended')
  LOOP
    source_id := mmhr_private.r1_assert_permission_ceiling(p_actor,target.permission_key,
      scope.organization_id,'grant',NULL::uuid,NULL::timestamptz,false,p_authorization_time);
    IF source_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    INSERT INTO public.permission_authority_sources(deny_removal_id,purpose,permission_key,
      organization_id,scope_key,source_delegation_id,created_at)
    VALUES(removal_id,'deny_removal',target.permission_key,scope.organization_id,
      CASE WHEN scope.organization_id IS NULL THEN 'platform' ELSE 'organization:' || scope.organization_id::text END,
      source_id,p_authorization_time);
  END LOOP;
END
$$;--> statement-breakpoint

-- Fixed commands retain their existing request/session checks and receipt binding.
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

CREATE OR REPLACE FUNCTION mmhr_private.r1_complete_super_admin_bootstrap(
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
    INSERT INTO public.role_authority_records(record_kind,authority_kind,platform_assignment_id,
      role_definition_id,correlation_id,created_at)
    SELECT 'platform_assignment','reviewed_owner',assignment_id,r.id,correlation_id,checked_at
    FROM public.role_definitions r WHERE r.stable_key = 'super_admin' AND r.kind = 'platform' AND r.state = 'active';
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

CREATE OR REPLACE FUNCTION public.mmhr_assign_platform_role(
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
  PERFORM mmhr_private.r1_capture_role_authority(context.actor_identity_id,new_id,target_role.id,
    NULL::uuid,context.authorization_time,correlation_id);
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'platform_role.assign',
    'platform_role.assign','platform_role_assignment',new_id,NULL::uuid,reason,correlation_id,idempotency_key,input,
    NULL,jsonb_build_object('identity_id',target_identity_id,'stable_key',role_key,'state','active'),context.authorization_time);
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_activate_role_version(
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
  PERFORM mmhr_private.r1_capture_role_authority(context.actor_identity_id,NULL::uuid,target.id,
    mmhr_private.r1_current_role_authority(previous.id),context.authorization_time,correlation_id);
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

CREATE OR REPLACE FUNCTION public.mmhr_set_permission_override(
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
    IF previous.effect = 'deny' THEN
      PERFORM mmhr_private.r1_capture_override_deny_removal(context.actor_identity_id,previous.id,
        context.authorization_time,correlation_id);
    END IF;
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

CREATE OR REPLACE FUNCTION public.mmhr_revoke_permission_override(
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
  IF target.effect = 'deny' THEN
    PERFORM mmhr_private.r1_capture_override_deny_removal(context.actor_identity_id,target.id,
      context.authorization_time,correlation_id);
  END IF;
  UPDATE public.user_permission_overrides SET state = 'revoked',revoked_at = context.authorization_time,
    revoked_by_identity_id = context.actor_identity_id,revocation_reason = btrim(reason)
    WHERE id = target.id RETURNING * INTO changed;
  RETURN mmhr_private.r1_finish_security_command(context.actor_identity_id,'permission_override.revoke',
    'permission_override.revoke','permission_override',target.id,target.organization_id,reason,correlation_id,idempotency_key,input,
    mmhr_private.r1_override_summary(target),mmhr_private.r1_override_summary(changed),context.authorization_time);
END
$$;--> statement-breakpoint
-- End of fixed source-aware command replacements.

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
  ), ancestors(id) AS (
    SELECT $1
    UNION
    SELECT e.issuer FROM edges e JOIN ancestors a ON a.id = e.grantee
  )
  SELECT $2 IS NULL OR EXISTS (SELECT 1 FROM ancestors WHERE id = $2)
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION
  mmhr_private.r1_current_role_authority(uuid),
  mmhr_private.r1_role_authority_allows(uuid,text,uuid,text,timestamptz,boolean,uuid[]),
  mmhr_private.r1_assignment_authority_allows(uuid,text,uuid,timestamptz,boolean,uuid[]),
  mmhr_private.r1_role_deny_guard_origin(uuid,text,uuid[]),
  mmhr_private.r1_role_deny_guard_is_valid(uuid,text,uuid,timestamptz,boolean,uuid[]),
  mmhr_private.r1_override_deny_guards_are_valid(uuid,text,uuid,timestamptz,boolean,uuid[]),
  mmhr_private.r1_role_source_scopes(uuid,uuid,text),
  mmhr_private.r1_capture_role_authority(uuid,uuid,uuid,uuid,timestamptz,uuid),
  mmhr_private.r1_capture_override_deny_removal(uuid,uuid,timestamptz,uuid)
FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint

-- Refuse a populated migration that removes required current capacity. The
-- bootstrap function checks capacity atomically when an empty install is set up.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.security_bootstrap_state b
    WHERE b.state = 'consumed' AND b.second_target_identity_id IS NOT NULL)
  THEN PERFORM mmhr_private.r1_assert_administration_capacity(clock_timestamp()); END IF;
END
$$;--> statement-breakpoint
INSERT INTO public.audit_events(actor_type,actor_reference,command,action,entity_type,entity_id,
  reason,correlation_id,after_summary)
SELECT 'migration','r1.4-role-authority','role_authority.backfill','role_authority.backfill',
  'security_provenance','r1.4','Retain proven owner authority without inferring delegated grants',
  gen_random_uuid(),jsonb_build_object(
    'role_definition_count',count(*) FILTER (WHERE record_kind = 'role_activation'),
    'identity_count',count(*) FILTER (WHERE record_kind = 'platform_assignment'))
FROM public.role_authority_records;
