CREATE INDEX "identities_auth_status_idx" ON "identities" USING btree ("auth_user_id","status");--> statement-breakpoint
CREATE INDEX "org_members_identity_org_status_idx" ON "org_members" USING btree ("identity_id","org_id","status");
--> statement-breakpoint

-- R1.3 closes the default Data API surface. User requests use the fixed
-- functions below, while the direct worker pool remains separate and has no
-- raw application-table privileges.
REVOKE ALL ON TABLE
  "public"."audit_events",
  "public"."audit_log",
  "public"."identity_admin_intents",
  "public"."identity_recovery_approvals",
  "public"."identity_recovery_presence",
  "public"."identity_recovery_requests",
  "public"."security_bootstrap_state",
  "public"."identities",
  "public"."invitations",
  "public"."org_members",
  "public"."orgs",
  "public"."leads",
  "public"."admin_delegation_grants",
  "public"."permission_definitions",
  "public"."platform_role_assignments",
  "public"."portal_access_grants",
  "public"."role_definitions",
  "public"."role_permission_defaults",
  "public"."user_permission_overrides"
FROM "anon", "authenticated";--> statement-breakpoint

ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
  REVOKE ALL ON TABLES FROM "anon", "authenticated";--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_request_identity_id"()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "identity"."id"
  FROM "public"."identities" AS "identity"
  WHERE "identity"."auth_user_id" = "auth"."uid"()
    AND "identity"."status" = 'active'
    AND "identity"."email_verified_at" IS NOT NULL
  LIMIT 1
$$;--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_request_has_membership"("organization_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."org_members" AS "membership"
    INNER JOIN "public"."orgs" AS "organization"
      ON "organization"."id" = "membership"."org_id"
    WHERE "membership"."org_id" = "organization_id"
      AND "membership"."identity_id" = "mmhr_private"."r1_request_identity_id"()
      AND "membership"."status" = 'active'
      AND "organization"."status" = 'active'
  )
$$;--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_request_is_org_admin"("organization_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."org_members" AS "membership"
    INNER JOIN "public"."orgs" AS "organization"
      ON "organization"."id" = "membership"."org_id"
    WHERE "membership"."org_id" = "organization_id"
      AND "membership"."identity_id" = "mmhr_private"."r1_request_identity_id"()
      AND "membership"."status" = 'active'
      AND "membership"."role_key" = 'organization_admin'
      AND "organization"."status" = 'active'
  )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "mmhr_private"."r1_request_identity_id"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "mmhr_private"."r1_request_has_membership"(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "mmhr_private"."r1_request_is_org_admin"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "mmhr_private"."r1_request_identity_id"() TO "anon", "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "mmhr_private"."r1_request_has_membership"(uuid) TO "anon", "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "mmhr_private"."r1_request_is_org_admin"(uuid) TO "anon", "authenticated";--> statement-breakpoint

CREATE FUNCTION "public"."mmhr_get_my_identity"()
RETURNS TABLE (
  "id" uuid,
  "status" "public"."identity_status",
  "normalized_email" text,
  "email_verified_at" timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "identity"."id", "identity"."status", "identity"."normalized_email", "identity"."email_verified_at"
  FROM "public"."identities" AS "identity"
  WHERE "identity"."id" = "mmhr_private"."r1_request_identity_id"()
$$;--> statement-breakpoint

CREATE FUNCTION "public"."mmhr_get_organization"("organization_id" uuid)
RETURNS TABLE (
  "id" uuid,
  "name" text,
  "type" "public"."organization_type",
  "status" "public"."organization_status"
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "organization"."id", "organization"."name", "organization"."type", "organization"."status"
  FROM "public"."orgs" AS "organization"
  WHERE "organization"."id" = "organization_id"
    AND "mmhr_private"."r1_request_has_membership"("organization_id")
$$;--> statement-breakpoint

CREATE FUNCTION "public"."mmhr_get_my_memberships"()
RETURNS TABLE (
  "organization_id" uuid,
  "organization_name" text,
  "organization_type" "public"."organization_type",
  "organization_status" "public"."organization_status",
  "role_key" text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "organization"."id", "organization"."name", "organization"."type", "organization"."status", "membership"."role_key"
  FROM "public"."org_members" AS "membership"
  INNER JOIN "public"."orgs" AS "organization" ON "organization"."id" = "membership"."org_id"
  WHERE "membership"."identity_id" = "mmhr_private"."r1_request_identity_id"()
    AND "membership"."status" = 'active'
    AND "organization"."status" = 'active'
  ORDER BY "organization"."id"
$$;--> statement-breakpoint

CREATE FUNCTION "public"."mmhr_get_organization_members"("organization_id" uuid)
RETURNS TABLE (
  "membership_id" uuid,
  "identity_id" uuid,
  "role_key" text,
  "status" "public"."membership_status"
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "membership"."id", "membership"."identity_id", "membership"."role_key", "membership"."status"
  FROM "public"."org_members" AS "membership"
  WHERE "membership"."org_id" = "organization_id"
    AND "membership"."status" IN ('active', 'suspended')
    AND "mmhr_private"."r1_request_is_org_admin"("organization_id")
  ORDER BY "membership"."id"
$$;--> statement-breakpoint

CREATE FUNCTION "public"."mmhr_get_audit_events"("organization_id" uuid)
RETURNS TABLE (
  "id" uuid,
  "action" text,
  "entity_type" text,
  "entity_id" text,
  "occurred_at" timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "event"."id", "event"."action", "event"."entity_type", "event"."entity_id", "event"."occurred_at"
  FROM "public"."audit_events" AS "event"
  WHERE "event"."organization_id" = "organization_id"
    AND "mmhr_private"."r1_request_is_org_admin"("organization_id")
  ORDER BY "event"."occurred_at" DESC
  LIMIT 100
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "public"."mmhr_get_my_identity"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."mmhr_get_organization"(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."mmhr_get_my_memberships"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."mmhr_get_organization_members"(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."mmhr_get_audit_events"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."mmhr_get_my_identity"() TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."mmhr_get_organization"(uuid) TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."mmhr_get_my_memberships"() TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."mmhr_get_organization_members"(uuid) TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."mmhr_get_audit_events"(uuid) TO "authenticated";--> statement-breakpoint

-- Explicit deny policies make the current contract visible in PostgreSQL,
-- even when direct table privileges are absent. Future commands must use a
-- separate reviewed function and a matching policy.
CREATE POLICY "r1_deny_anon_authenticated_audit_events" ON "public"."audit_events"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_audit_log" ON "public"."audit_log"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_identity_admin_intents" ON "public"."identity_admin_intents"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_identity_recovery_approvals" ON "public"."identity_recovery_approvals"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_identity_recovery_presence" ON "public"."identity_recovery_presence"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_identity_recovery_requests" ON "public"."identity_recovery_requests"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_security_bootstrap_state" ON "public"."security_bootstrap_state"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_identities" ON "public"."identities"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_invitations" ON "public"."invitations"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_org_members" ON "public"."org_members"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_orgs" ON "public"."orgs"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_leads" ON "public"."leads"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_admin_delegation_grants" ON "public"."admin_delegation_grants"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_permission_definitions" ON "public"."permission_definitions"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_platform_role_assignments" ON "public"."platform_role_assignments"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_portal_access_grants" ON "public"."portal_access_grants"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_role_definitions" ON "public"."role_definitions"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_role_permission_defaults" ON "public"."role_permission_defaults"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r1_deny_anon_authenticated_user_permission_overrides" ON "public"."user_permission_overrides"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
--> statement-breakpoint

INSERT INTO "public"."audit_events" (
  "actor_type", "actor_reference", "command", "action", "entity_type",
  "entity_id", "reason", "correlation_id"
)
VALUES (
  'migration', 'r1.3-migration', 'r1.3 migration', 'r1.3_access.add',
  'authorization', 'r1.3', 'Add grants, RLS policies, and request-scoped access',
  gen_random_uuid()
);
