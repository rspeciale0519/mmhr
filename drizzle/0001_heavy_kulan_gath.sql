CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'worker', 'system', 'migration');--> statement-breakpoint
CREATE TYPE "public"."authentication_assurance" AS ENUM('aal1', 'aal2');--> statement-breakpoint
CREATE TYPE "public"."bootstrap_state" AS ENUM('prepared', 'consumed');--> statement-breakpoint
CREATE TYPE "public"."identity_intent_operation" AS ENUM('invitation_delivery', 'identity_relink', 'mfa_enrollment_reset');--> statement-breakpoint
CREATE TYPE "public"."identity_intent_state" AS ENUM('pending', 'in_flight', 'succeeded', 'failed', 'outcome_unknown', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."phone_check_result" AS ENUM('confirmed', 'no_preexisting_number', 'no_answer', 'not_confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."recovery_action" AS ENUM('mfa_enrollment_reset');--> statement-breakpoint
CREATE TYPE "public"."recovery_decision" AS ENUM('approved', 'denied');--> statement-breakpoint
CREATE TYPE "public"."recovery_presence_state" AS ENUM('pending', 'linked', 'completed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."recovery_request_state" AS ENUM('pending', 'approved', 'completed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."identity_status" AS ENUM('pending', 'active', 'recovery_pending', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('pending', 'active', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."organization_type" AS ENUM('internal', 'customer', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."permission_effect" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."permission_kind" AS ENUM('feature', 'action', 'field');--> statement-breakpoint
CREATE TYPE "public"."permission_scope_kind" AS ENUM('platform', 'organization');--> statement-breakpoint
CREATE TYPE "public"."portal_kind" AS ENUM('customer', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."role_definition_state" AS ENUM('draft', 'approved', 'active', 'rejected', 'retired');--> statement-breakpoint
CREATE TYPE "public"."role_kind" AS ENUM('platform', 'organization');--> statement-breakpoint
CREATE TYPE "public"."security_record_state" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_identity_id" uuid,
	"actor_reference" text,
	"organization_id" uuid,
	"command" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"idempotency_key" text,
	"before_summary" jsonb,
	"after_summary" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_version_ck" CHECK ("audit_events"."event_version" > 0),
	CONSTRAINT "audit_events_actor_ck" CHECK (("audit_events"."actor_type" = 'user' and "audit_events"."actor_identity_id" is not null) or ("audit_events"."actor_type" <> 'user' and "audit_events"."actor_reference" is not null and length(btrim("audit_events"."actor_reference")) > 0)),
	CONSTRAINT "audit_events_reason_ck" CHECK (length(btrim("audit_events"."reason")) > 0),
	CONSTRAINT "audit_events_command_ck" CHECK (length(btrim("audit_events"."command")) > 0),
	CONSTRAINT "audit_events_action_ck" CHECK (length(btrim("audit_events"."action")) > 0)
);
--> statement-breakpoint
CREATE TABLE "identity_admin_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation" "identity_intent_operation" NOT NULL,
	"target_identity_id" uuid,
	"invitation_id" uuid,
	"recovery_request_id" uuid,
	"idempotency_key" text NOT NULL,
	"state" "identity_intent_state" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"maximum_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"safe_error_code" text,
	"result_code" text,
	"provider_reference" text,
	"confirmed_factor_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "identity_admin_intents_attempts_ck" CHECK ("identity_admin_intents"."attempt_count" >= 0 and "identity_admin_intents"."maximum_attempts" > 0 and "identity_admin_intents"."attempt_count" <= "identity_admin_intents"."maximum_attempts"),
	CONSTRAINT "identity_admin_intents_target_ck" CHECK (("identity_admin_intents"."operation" = 'invitation_delivery' and "identity_admin_intents"."invitation_id" is not null and "identity_admin_intents"."recovery_request_id" is null) or ("identity_admin_intents"."operation" = 'identity_relink' and "identity_admin_intents"."target_identity_id" is not null and "identity_admin_intents"."invitation_id" is null and "identity_admin_intents"."recovery_request_id" is null) or ("identity_admin_intents"."operation" = 'mfa_enrollment_reset' and "identity_admin_intents"."target_identity_id" is not null and "identity_admin_intents"."recovery_request_id" is not null and "identity_admin_intents"."invitation_id" is null)),
	CONSTRAINT "identity_admin_intents_factor_result_ck" CHECK ("identity_admin_intents"."confirmed_factor_count" is null or ("identity_admin_intents"."operation" = 'mfa_enrollment_reset' and "identity_admin_intents"."confirmed_factor_count" >= 0)),
	CONSTRAINT "identity_admin_intents_lifecycle_ck" CHECK (("identity_admin_intents"."state" = 'pending' and "identity_admin_intents"."claimed_at" is null and "identity_admin_intents"."lease_expires_at" is null and "identity_admin_intents"."completed_at" is null) or ("identity_admin_intents"."state" = 'in_flight' and "identity_admin_intents"."claimed_at" is not null and "identity_admin_intents"."lease_expires_at" is not null and "identity_admin_intents"."completed_at" is null) or ("identity_admin_intents"."state" in ('succeeded', 'failed', 'outcome_unknown') and "identity_admin_intents"."claimed_at" is not null and "identity_admin_intents"."completed_at" is not null) or ("identity_admin_intents"."state" = 'cancelled' and "identity_admin_intents"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "identity_recovery_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"approver_identity_id" uuid NOT NULL,
	"decision" "recovery_decision" NOT NULL,
	"assurance" "authentication_assurance" NOT NULL,
	"pre_existing_contact_attested" boolean DEFAULT false NOT NULL,
	"phone_check_result" "phone_check_result" NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"evidence_reference" text,
	"decision_reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_recovery_approvals_approved_ck" CHECK ("identity_recovery_approvals"."decision" <> 'approved' or ("identity_recovery_approvals"."assurance" = 'aal2' and "identity_recovery_approvals"."pre_existing_contact_attested" and "identity_recovery_approvals"."phone_check_result" = 'confirmed' and "identity_recovery_approvals"."evidence_reference" is not null and length(btrim("identity_recovery_approvals"."evidence_reference")) > 0)),
	CONSTRAINT "identity_recovery_approvals_reason_ck" CHECK (length(btrim("identity_recovery_approvals"."decision_reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "identity_recovery_presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_identity_id" uuid NOT NULL,
	"auth_session_id" text NOT NULL,
	"opaque_reference_hash" text NOT NULL,
	"state" "recovery_presence_state" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"linked_request_id" uuid,
	"expected_replacement_factor_id" text,
	"linked_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_recovery_presence_hash_ck" CHECK ("identity_recovery_presence"."opaque_reference_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "identity_recovery_presence_expiry_ck" CHECK ("identity_recovery_presence"."expires_at" > "identity_recovery_presence"."created_at" and "identity_recovery_presence"."expires_at" <= "identity_recovery_presence"."created_at" + interval '30 minutes'),
	CONSTRAINT "identity_recovery_presence_lifecycle_ck" CHECK (("identity_recovery_presence"."state" = 'pending' and "identity_recovery_presence"."linked_request_id" is null and "identity_recovery_presence"."linked_at" is null and "identity_recovery_presence"."completed_at" is null and "identity_recovery_presence"."cancelled_at" is null) or ("identity_recovery_presence"."state" = 'linked' and "identity_recovery_presence"."linked_request_id" is not null and "identity_recovery_presence"."linked_at" is not null and "identity_recovery_presence"."completed_at" is null and "identity_recovery_presence"."cancelled_at" is null) or ("identity_recovery_presence"."state" = 'completed' and "identity_recovery_presence"."linked_request_id" is not null and "identity_recovery_presence"."completed_at" is not null and "identity_recovery_presence"."cancelled_at" is null) or ("identity_recovery_presence"."state" = 'cancelled' and "identity_recovery_presence"."cancelled_at" is not null and "identity_recovery_presence"."completed_at" is null) or ("identity_recovery_presence"."state" = 'expired' and "identity_recovery_presence"."completed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "identity_recovery_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_identity_id" uuid NOT NULL,
	"recovery_presence_id" uuid NOT NULL,
	"initiated_by_identity_id" uuid NOT NULL,
	"action" "recovery_action" NOT NULL,
	"reason" text NOT NULL,
	"state" "recovery_request_state" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_recovery_requests_expiry_ck" CHECK ("identity_recovery_requests"."expires_at" > "identity_recovery_requests"."created_at" and "identity_recovery_requests"."expires_at" <= "identity_recovery_requests"."created_at" + interval '30 minutes'),
	CONSTRAINT "identity_recovery_requests_reason_ck" CHECK (length(btrim("identity_recovery_requests"."reason")) > 0),
	CONSTRAINT "identity_recovery_requests_lifecycle_ck" CHECK (("identity_recovery_requests"."state" = 'pending' and "identity_recovery_requests"."approved_at" is null and "identity_recovery_requests"."completed_at" is null and "identity_recovery_requests"."cancelled_at" is null) or ("identity_recovery_requests"."state" = 'approved' and "identity_recovery_requests"."approved_at" is not null and "identity_recovery_requests"."completed_at" is null and "identity_recovery_requests"."cancelled_at" is null) or ("identity_recovery_requests"."state" = 'completed' and "identity_recovery_requests"."approved_at" is not null and "identity_recovery_requests"."completed_at" is not null and "identity_recovery_requests"."cancelled_at" is null) or ("identity_recovery_requests"."state" in ('expired', 'cancelled') and "identity_recovery_requests"."completed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "security_bootstrap_state" (
	"singleton_key" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"target_identity_id" uuid NOT NULL,
	"product_approval_reference" text NOT NULL,
	"security_approval_reference" text NOT NULL,
	"state" "bootstrap_state" DEFAULT 'prepared' NOT NULL,
	"prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "security_bootstrap_state_singleton_ck" CHECK ("security_bootstrap_state"."singleton_key" = 1),
	CONSTRAINT "security_bootstrap_state_consumed_ck" CHECK (("security_bootstrap_state"."state" = 'prepared' and "security_bootstrap_state"."consumed_at" is null) or ("security_bootstrap_state"."state" = 'consumed' and "security_bootstrap_state"."consumed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid,
	"normalized_email" text,
	"email_verified_at" timestamp with time zone,
	"status" "identity_status" DEFAULT 'pending' NOT NULL,
	"activated_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"synchronized_at" timestamp with time zone,
	"migration_review_required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identities_normalized_email_ck" CHECK ("identities"."normalized_email" is null or "identities"."normalized_email" = lower(btrim("identities"."normalized_email"))),
	CONSTRAINT "identities_lifecycle_ck" CHECK (("identities"."status" = 'pending' and "identities"."activated_at" is null and "identities"."suspended_at" is null and "identities"."archived_at" is null) or ("identities"."status" in ('active', 'recovery_pending') and "identities"."activated_at" is not null and "identities"."suspended_at" is null and "identities"."archived_at" is null) or ("identities"."status" = 'suspended' and "identities"."activated_at" is not null and "identities"."suspended_at" is not null and "identities"."archived_at" is null) or ("identities"."status" = 'archived' and "identities"."archived_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "admin_delegation_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grantee_identity_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"scope_kind" "permission_scope_kind" NOT NULL,
	"organization_id" uuid,
	"scope_key" text NOT NULL,
	"state" "security_record_state" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"issued_by_identity_id" uuid NOT NULL,
	"issue_reason" text NOT NULL,
	"revoked_by_identity_id" uuid,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_delegation_grants_scope_ck" CHECK (("admin_delegation_grants"."scope_kind" = 'platform' and "admin_delegation_grants"."organization_id" is null and "admin_delegation_grants"."scope_key" = 'platform') or ("admin_delegation_grants"."scope_kind" = 'organization' and "admin_delegation_grants"."organization_id" is not null and "admin_delegation_grants"."scope_key" = 'organization:' || "admin_delegation_grants"."organization_id"::text)),
	CONSTRAINT "admin_delegation_grants_no_self_ck" CHECK ("admin_delegation_grants"."issued_by_identity_id" <> "admin_delegation_grants"."grantee_identity_id"),
	CONSTRAINT "admin_delegation_grants_revocation_ck" CHECK (("admin_delegation_grants"."state" = 'active' and "admin_delegation_grants"."revoked_at" is null and "admin_delegation_grants"."revoked_by_identity_id" is null and "admin_delegation_grants"."revocation_reason" is null) or ("admin_delegation_grants"."state" = 'revoked' and "admin_delegation_grants"."revoked_at" is not null and "admin_delegation_grants"."revocation_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "permission_definitions" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" "permission_kind" NOT NULL,
	"description" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permission_definitions_key_ck" CHECK ("permission_definitions"."key" ~ '^[a-z][a-z0-9_]*([.][a-z][a-z0-9_]*)+$'),
	CONSTRAINT "permission_definitions_retirement_ck" CHECK (("permission_definitions"."active" and "permission_definitions"."retired_at" is null) or (not "permission_definitions"."active" and "permission_definitions"."retired_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "platform_role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"state" "security_record_state" DEFAULT 'active' NOT NULL,
	"assigned_by_identity_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assignment_reason" text NOT NULL,
	"revoked_by_identity_id" uuid,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_role_assignments_actor_ck" CHECK ("platform_role_assignments"."assigned_by_identity_id" is null or "platform_role_assignments"."assigned_by_identity_id" <> "platform_role_assignments"."identity_id"),
	CONSTRAINT "platform_role_assignments_revocation_ck" CHECK (("platform_role_assignments"."state" = 'active' and "platform_role_assignments"."revoked_at" is null and "platform_role_assignments"."revoked_by_identity_id" is null and "platform_role_assignments"."revocation_reason" is null) or ("platform_role_assignments"."state" = 'revoked' and "platform_role_assignments"."revoked_at" is not null and "platform_role_assignments"."revocation_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "portal_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"portal" "portal_kind" NOT NULL,
	"state" "security_record_state" DEFAULT 'active' NOT NULL,
	"issued_by_identity_id" uuid NOT NULL,
	"issue_reason" text NOT NULL,
	"revoked_by_identity_id" uuid,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_access_grants_revocation_ck" CHECK (("portal_access_grants"."state" = 'active' and "portal_access_grants"."revoked_at" is null and "portal_access_grants"."revoked_by_identity_id" is null and "portal_access_grants"."revocation_reason" is null) or ("portal_access_grants"."state" = 'revoked' and "portal_access_grants"."revoked_at" is not null and "portal_access_grants"."revocation_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "role_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stable_key" text NOT NULL,
	"version" integer NOT NULL,
	"kind" "role_kind" NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"state" "role_definition_state" DEFAULT 'draft' NOT NULL,
	"approved_by_identity_id" uuid,
	"approved_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_definitions_version_ck" CHECK ("role_definitions"."version" > 0),
	CONSTRAINT "role_definitions_stable_key_ck" CHECK ("role_definitions"."stable_key" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "role_definitions_lifecycle_ck" CHECK (("role_definitions"."state" = 'draft' and "role_definitions"."approved_at" is null and "role_definitions"."activated_at" is null and "role_definitions"."retired_at" is null) or ("role_definitions"."state" = 'approved' and "role_definitions"."approved_at" is not null and "role_definitions"."activated_at" is null and "role_definitions"."retired_at" is null) or ("role_definitions"."state" = 'active' and "role_definitions"."approved_at" is not null and "role_definitions"."activated_at" is not null and "role_definitions"."retired_at" is null) or ("role_definitions"."state" = 'rejected' and "role_definitions"."activated_at" is null and "role_definitions"."retired_at" is null) or ("role_definitions"."state" = 'retired' and "role_definitions"."retired_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "role_permission_defaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_definition_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"effect" "permission_effect" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permission_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"scope_kind" "permission_scope_kind" NOT NULL,
	"organization_id" uuid,
	"scope_key" text NOT NULL,
	"effect" "permission_effect" NOT NULL,
	"state" "security_record_state" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"issued_by_identity_id" uuid NOT NULL,
	"issue_reason" text NOT NULL,
	"revoked_by_identity_id" uuid,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_permission_overrides_scope_ck" CHECK (("user_permission_overrides"."scope_kind" = 'platform' and "user_permission_overrides"."organization_id" is null and "user_permission_overrides"."scope_key" = 'platform') or ("user_permission_overrides"."scope_kind" = 'organization' and "user_permission_overrides"."organization_id" is not null and "user_permission_overrides"."scope_key" = 'organization:' || "user_permission_overrides"."organization_id"::text)),
	CONSTRAINT "user_permission_overrides_actor_ck" CHECK ("user_permission_overrides"."issued_by_identity_id" <> "user_permission_overrides"."identity_id"),
	CONSTRAINT "user_permission_overrides_revocation_ck" CHECK (("user_permission_overrides"."state" = 'active' and "user_permission_overrides"."revoked_at" is null and "user_permission_overrides"."revoked_by_identity_id" is null and "user_permission_overrides"."revocation_reason" is null) or ("user_permission_overrides"."state" = 'revoked' and "user_permission_overrides"."revoked_at" is not null and "user_permission_overrides"."revocation_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_org_id_orgs_id_fk";
--> statement-breakpoint
ALTER TABLE "org_members" DROP CONSTRAINT "org_members_org_id_orgs_id_fk";
--> statement-breakpoint
DROP INDEX "org_members_org_user_uq";--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "token" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" DROP CONSTRAINT IF EXISTS "org_members_user_id_auth_users_id_fk";--> statement-breakpoint
ALTER TABLE "org_members" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" ALTER COLUMN "role" SET DEFAULT 'contributor';--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "normalized_email" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "role_key" text DEFAULT 'contributor' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "status" "invitation_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "created_by_identity_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "accepted_by_identity_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "revoked_by_identity_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "revoked_reason" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "migration_review_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "identity_id" uuid;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "role_key" text DEFAULT 'contributor' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "status" "membership_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "activated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "revoked_by_identity_id" uuid;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "revoked_reason" text;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "migration_review_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "type" "organization_type";--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "status" "organization_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "migration_review_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "format_version" text DEFAULT 'legacy_snapshot_v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "frozen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

-- Preserve every existing Auth account as a stable pending identity. Email
-- confirmation remains synchronized only when its normalized value is unique.
WITH "auth_source" AS (
	SELECT
		"u"."id",
		NULLIF(lower(btrim("u"."email")), '') AS "normalized_email",
		"u"."email_confirmed_at",
		"u"."created_at",
		count(*) FILTER (WHERE "u"."email_confirmed_at" IS NOT NULL)
			OVER (PARTITION BY lower(btrim("u"."email"))) AS "verified_count"
	FROM "auth"."users" AS "u"
)
INSERT INTO "identities" (
	"auth_user_id",
	"normalized_email",
	"email_verified_at",
	"status",
	"synchronized_at",
	"migration_review_required",
	"created_at",
	"updated_at"
)
SELECT
	"id",
	"normalized_email",
	CASE
		WHEN "normalized_email" IS NOT NULL AND "verified_count" = 1
			THEN "email_confirmed_at"
		ELSE NULL
	END,
	'pending'::"identity_status",
	now(),
	true,
	COALESCE("created_at", now()),
	now()
FROM "auth_source";--> statement-breakpoint

UPDATE "org_members" AS "member"
SET
	"identity_id" = "identity"."id",
	"role_key" = CASE "member"."role"
		WHEN 'admin' THEN 'organization_admin'
		WHEN 'contributor' THEN 'contributor'
		WHEN 'viewer' THEN 'viewer'
	END,
	"activated_at" = "member"."created_at",
	"migration_review_required" = ("member"."role" = 'admin'),
	"updated_at" = now()
FROM "identities" AS "identity"
WHERE "identity"."auth_user_id" = "member"."user_id";--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "org_members" WHERE "identity_id" IS NULL) THEN
		RAISE EXCEPTION 'R1.2 cannot map every legacy membership to a stable identity';
	END IF;
END
$$;--> statement-breakpoint

UPDATE "invitations"
SET
	"normalized_email" = lower(btrim("email")),
	"role_key" = CASE "role"
		WHEN 'admin' THEN 'organization_admin'
		WHEN 'contributor' THEN 'contributor'
		WHEN 'viewer' THEN 'viewer'
	END,
	"status" = CASE
		WHEN "accepted_at" IS NOT NULL THEN 'accepted'::"invitation_status"
		WHEN "expires_at" <= now() THEN 'expired'::"invitation_status"
		ELSE 'pending'::"invitation_status"
	END,
	"migration_review_required" = (
		"accepted_at" IS NOT NULL
		OR "expires_at" > now()
		OR length(btrim("email")) = 0
	),
	"updated_at" = now();--> statement-breakpoint

ALTER TABLE "invitations" ALTER COLUMN "normalized_email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" ALTER COLUMN "identity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_auth_user_id_auth_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_recovery_presence" ADD CONSTRAINT "identity_recovery_presence_linked_request_id_fk" FOREIGN KEY ("linked_request_id") REFERENCES "public"."identity_recovery_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_recovery_presence_linked_request_uq" ON "identity_recovery_presence" USING btree ("linked_request_id") WHERE "linked_request_id" IS NOT NULL;--> statement-breakpoint

-- These approved version-one roles define the stable keys used by the backfill.
INSERT INTO "role_definitions" (
	"stable_key", "version", "kind", "display_name", "description",
	"state", "approved_at", "activated_at"
)
VALUES
	('super_admin', 1, 'platform', 'Super Admin', 'Full configured platform control through audited workflows.', 'active', now(), now()),
	('admin', 1, 'platform', 'Admin', 'Delegated internal administration within an active ceiling.', 'active', now(), now()),
	('staff', 1, 'platform', 'Staff', 'Scoped internal workflow access.', 'active', now(), now()),
	('organization_admin', 1, 'organization', 'Organization Admin', 'Bounded member administration for one organization.', 'active', now(), now()),
	('contributor', 1, 'organization', 'Contributor', 'Scoped organization contribution access.', 'active', now(), now()),
	('viewer', 1, 'organization', 'Viewer', 'Read-only organization access where a permission allows it.', 'active', now(), now());--> statement-breakpoint

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_admin_intents" ADD CONSTRAINT "identity_admin_intents_target_identity_id_identities_id_fk" FOREIGN KEY ("target_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_admin_intents" ADD CONSTRAINT "identity_admin_intents_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_admin_intents" ADD CONSTRAINT "identity_admin_intents_recovery_request_id_identity_recovery_requests_id_fk" FOREIGN KEY ("recovery_request_id") REFERENCES "public"."identity_recovery_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_recovery_approvals" ADD CONSTRAINT "identity_recovery_approvals_request_id_identity_recovery_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."identity_recovery_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_recovery_approvals" ADD CONSTRAINT "identity_recovery_approvals_approver_identity_id_identities_id_fk" FOREIGN KEY ("approver_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_recovery_presence" ADD CONSTRAINT "identity_recovery_presence_target_identity_id_identities_id_fk" FOREIGN KEY ("target_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_recovery_requests" ADD CONSTRAINT "identity_recovery_requests_target_identity_id_identities_id_fk" FOREIGN KEY ("target_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_recovery_requests" ADD CONSTRAINT "identity_recovery_requests_recovery_presence_id_identity_recovery_presence_id_fk" FOREIGN KEY ("recovery_presence_id") REFERENCES "public"."identity_recovery_presence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_recovery_requests" ADD CONSTRAINT "identity_recovery_requests_initiated_by_identity_id_identities_id_fk" FOREIGN KEY ("initiated_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_bootstrap_state" ADD CONSTRAINT "security_bootstrap_state_target_identity_id_identities_id_fk" FOREIGN KEY ("target_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_delegation_grants" ADD CONSTRAINT "admin_delegation_grants_grantee_identity_id_identities_id_fk" FOREIGN KEY ("grantee_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_delegation_grants" ADD CONSTRAINT "admin_delegation_grants_permission_key_permission_definitions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permission_definitions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_delegation_grants" ADD CONSTRAINT "admin_delegation_grants_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_delegation_grants" ADD CONSTRAINT "admin_delegation_grants_issued_by_identity_id_identities_id_fk" FOREIGN KEY ("issued_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_delegation_grants" ADD CONSTRAINT "admin_delegation_grants_revoked_by_identity_id_identities_id_fk" FOREIGN KEY ("revoked_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_assigned_by_identity_id_identities_id_fk" FOREIGN KEY ("assigned_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_revoked_by_identity_id_identities_id_fk" FOREIGN KEY ("revoked_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_access_grants" ADD CONSTRAINT "portal_access_grants_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_access_grants" ADD CONSTRAINT "portal_access_grants_issued_by_identity_id_identities_id_fk" FOREIGN KEY ("issued_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_access_grants" ADD CONSTRAINT "portal_access_grants_revoked_by_identity_id_identities_id_fk" FOREIGN KEY ("revoked_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_definitions" ADD CONSTRAINT "role_definitions_approved_by_identity_id_identities_id_fk" FOREIGN KEY ("approved_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission_defaults" ADD CONSTRAINT "role_permission_defaults_role_definition_id_role_definitions_id_fk" FOREIGN KEY ("role_definition_id") REFERENCES "public"."role_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission_defaults" ADD CONSTRAINT "role_permission_defaults_permission_key_permission_definitions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permission_definitions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_permission_key_permission_definitions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permission_definitions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_issued_by_identity_id_identities_id_fk" FOREIGN KEY ("issued_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_revoked_by_identity_id_identities_id_fk" FOREIGN KEY ("revoked_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_actor_time_idx" ON "audit_events" USING btree ("actor_identity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_entity_time_idx" ON "audit_events" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_org_time_idx" ON "audit_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_admin_intents_idempotency_uq" ON "identity_admin_intents" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "identity_admin_intents_dispatch_idx" ON "identity_admin_intents" USING btree ("state","next_attempt_at","lease_expires_at");--> statement-breakpoint
CREATE INDEX "identity_admin_intents_target_idx" ON "identity_admin_intents" USING btree ("target_identity_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_recovery_approvals_request_uq" ON "identity_recovery_approvals" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "identity_recovery_approvals_approver_idx" ON "identity_recovery_approvals" USING btree ("approver_identity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_recovery_presence_reference_hash_uq" ON "identity_recovery_presence" USING btree ("opaque_reference_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_recovery_presence_active_session_uq" ON "identity_recovery_presence" USING btree ("target_identity_id","auth_session_id") WHERE "identity_recovery_presence"."state" in ('pending', 'linked');--> statement-breakpoint
CREATE INDEX "identity_recovery_presence_expiry_idx" ON "identity_recovery_presence" USING btree ("state","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_recovery_requests_presence_uq" ON "identity_recovery_requests" USING btree ("recovery_presence_id");--> statement-breakpoint
CREATE INDEX "identity_recovery_requests_target_state_idx" ON "identity_recovery_requests" USING btree ("target_identity_id","state");--> statement-breakpoint
CREATE INDEX "identity_recovery_requests_expiry_idx" ON "identity_recovery_requests" USING btree ("state","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identities_auth_user_id_uq" ON "identities" USING btree ("auth_user_id") WHERE "identities"."auth_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "identities_verified_email_uq" ON "identities" USING btree ("normalized_email") WHERE "identities"."normalized_email" is not null and "identities"."email_verified_at" is not null and "identities"."status" <> 'archived';--> statement-breakpoint
CREATE INDEX "identities_status_idx" ON "identities" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_delegation_grants_active_scope_uq" ON "admin_delegation_grants" USING btree ("grantee_identity_id","permission_key","scope_key") WHERE "admin_delegation_grants"."state" = 'active';--> statement-breakpoint
CREATE INDEX "admin_delegation_grants_issuer_idx" ON "admin_delegation_grants" USING btree ("issued_by_identity_id","state");--> statement-breakpoint
CREATE INDEX "permission_definitions_kind_active_idx" ON "permission_definitions" USING btree ("kind","active");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_role_assignments_active_identity_uq" ON "platform_role_assignments" USING btree ("identity_id") WHERE "platform_role_assignments"."state" = 'active';--> statement-breakpoint
CREATE INDEX "platform_role_assignments_role_state_idx" ON "platform_role_assignments" USING btree ("role_key","state");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_access_grants_active_org_portal_uq" ON "portal_access_grants" USING btree ("organization_id","portal") WHERE "portal_access_grants"."state" = 'active';--> statement-breakpoint
CREATE INDEX "portal_access_grants_issuer_idx" ON "portal_access_grants" USING btree ("issued_by_identity_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "role_definitions_key_version_uq" ON "role_definitions" USING btree ("stable_key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "role_definitions_active_key_uq" ON "role_definitions" USING btree ("stable_key") WHERE "role_definitions"."state" = 'active';--> statement-breakpoint
CREATE INDEX "role_definitions_kind_state_idx" ON "role_definitions" USING btree ("kind","state");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permission_defaults_role_permission_uq" ON "role_permission_defaults" USING btree ("role_definition_id","permission_key");--> statement-breakpoint
CREATE INDEX "role_permission_defaults_permission_idx" ON "role_permission_defaults" USING btree ("permission_key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_permission_overrides_active_scope_uq" ON "user_permission_overrides" USING btree ("identity_id","permission_key","scope_key") WHERE "user_permission_overrides"."state" = 'active';--> statement-breakpoint
CREATE INDEX "user_permission_overrides_lookup_idx" ON "user_permission_overrides" USING btree ("identity_id","state","expires_at");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_identity_id_identities_id_fk" FOREIGN KEY ("created_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_identity_id_identities_id_fk" FOREIGN KEY ("accepted_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_revoked_by_identity_id_identities_id_fk" FOREIGN KEY ("revoked_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_revoked_by_identity_id_identities_id_fk" FOREIGN KEY ("revoked_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_org_email_uq" ON "invitations" USING btree ("org_id","normalized_email") WHERE "invitations"."status" = 'pending' and not "invitations"."migration_review_required";--> statement-breakpoint
CREATE INDEX "invitations_org_status_idx" ON "invitations" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_nonterminal_uq" ON "org_members" USING btree ("org_id","identity_id") WHERE "org_members"."status" in ('active', 'suspended');--> statement-breakpoint
CREATE INDEX "org_members_identity_idx" ON "org_members" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "org_members_org_status_idx" ON "org_members" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "orgs_status_idx" ON "orgs" USING btree ("status");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_normalized_email_ck" CHECK ("invitations"."normalized_email" = lower(btrim("invitations"."email")));--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_map_ck" CHECK (("invitations"."role" = 'admin' and "invitations"."role_key" = 'organization_admin') or ("invitations"."role" = 'contributor' and "invitations"."role_key" = 'contributor') or ("invitations"."role" = 'viewer' and "invitations"."role_key" = 'viewer'));--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_terminal_fields_ck" CHECK (("invitations"."status" = 'accepted' and "invitations"."accepted_at" is not null and ("invitations"."accepted_by_identity_id" is not null or "invitations"."migration_review_required") and "invitations"."revoked_at" is null) or ("invitations"."status" = 'revoked' and "invitations"."revoked_at" is not null and "invitations"."revoked_reason" is not null and "invitations"."accepted_at" is null) or ("invitations"."status" in ('pending', 'expired') and "invitations"."accepted_at" is null and "invitations"."accepted_by_identity_id" is null and "invitations"."revoked_at" is null and "invitations"."revoked_by_identity_id" is null and "invitations"."revoked_reason" is null));--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_role_map_ck" CHECK (("org_members"."role" = 'admin' and "org_members"."role_key" = 'organization_admin') or ("org_members"."role" = 'contributor' and "org_members"."role_key" = 'contributor') or ("org_members"."role" = 'viewer' and "org_members"."role_key" = 'viewer'));--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_revocation_ck" CHECK (("org_members"."status" = 'revoked' and "org_members"."revoked_at" is not null and "org_members"."revoked_reason" is not null) or ("org_members"."status" <> 'revoked' and "org_members"."revoked_at" is null and "org_members"."revoked_by_identity_id" is null and "org_members"."revoked_reason" is null));--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_lifecycle_ck" CHECK (("org_members"."status" = 'active' and "org_members"."suspended_at" is null) or ("org_members"."status" = 'suspended' and "org_members"."suspended_at" is not null) or "org_members"."status" = 'revoked');--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_active_type_ck" CHECK ("orgs"."status" = 'pending' or "orgs"."type" is not null);--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_lifecycle_ck" CHECK (("orgs"."status" = 'pending' and "orgs"."activated_at" is null and "orgs"."suspended_at" is null and "orgs"."archived_at" is null) or ("orgs"."status" = 'active' and "orgs"."activated_at" is not null and "orgs"."suspended_at" is null and "orgs"."archived_at" is null) or ("orgs"."status" = 'suspended' and "orgs"."activated_at" is not null and "orgs"."suspended_at" is not null and "orgs"."archived_at" is null) or ("orgs"."status" = 'archived' and "orgs"."archived_at" is not null));
--> statement-breakpoint

-- Supplemental reviewed constraints preserve ambiguous legacy facts while
-- rejecting incomplete new security records.
ALTER TABLE "identities" ADD CONSTRAINT "identities_nonempty_normalized_email_ck" CHECK ("normalized_email" IS NULL OR length(btrim("normalized_email")) > 0);--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_verified_email_requires_value_ck" CHECK ("email_verified_at" IS NULL OR "normalized_email" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_nonempty_email_or_review_ck" CHECK ("migration_review_required" OR length(btrim("normalized_email")) > 0);--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_terminal_actor_consistency_ck" CHECK (("status" = 'accepted' AND "revoked_by_identity_id" IS NULL AND "revoked_reason" IS NULL) OR ("status" = 'revoked' AND "accepted_by_identity_id" IS NULL AND "revoked_by_identity_id" IS NOT NULL AND length(btrim("revoked_reason")) > 0) OR "status" IN ('pending', 'expired'));--> statement-breakpoint
ALTER TABLE "identity_recovery_presence" ADD CONSTRAINT "identity_recovery_presence_cancellation_time_ck" CHECK (("state" = 'cancelled' AND "cancelled_at" IS NOT NULL) OR ("state" <> 'cancelled' AND "cancelled_at" IS NULL));--> statement-breakpoint
ALTER TABLE "identity_recovery_requests" ADD CONSTRAINT "identity_recovery_requests_cancellation_time_ck" CHECK (("state" = 'cancelled' AND "cancelled_at" IS NOT NULL) OR ("state" <> 'cancelled' AND "cancelled_at" IS NULL));--> statement-breakpoint

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identity_admin_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identity_recovery_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identity_recovery_presence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identity_recovery_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "security_bootstrap_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_delegation_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "permission_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_role_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "portal_access_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_permission_defaults" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "pg_catalog"."pg_namespace" WHERE "nspname" = 'mmhr_private'
	) THEN
		RAISE EXCEPTION 'R1.2 refuses to reuse an existing mmhr_private schema';
	END IF;
END
$$;--> statement-breakpoint
CREATE SCHEMA "mmhr_private";--> statement-breakpoint
REVOKE ALL ON SCHEMA "mmhr_private" FROM PUBLIC;--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "pg_catalog"."pg_roles" WHERE "rolname" = 'mmhr_worker'
	) THEN
		RAISE EXCEPTION 'R1.2 refuses to reuse an existing mmhr_worker role';
	END IF;
	EXECUTE 'CREATE ROLE mmhr_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS';
END
$$;--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_worker_role_is_safe"()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "pg_catalog"."pg_roles" AS "worker"
		WHERE "worker"."rolname" = 'mmhr_worker'
			AND NOT "worker"."rolcanlogin"
			AND NOT "worker"."rolsuper"
			AND NOT "worker"."rolcreatedb"
			AND NOT "worker"."rolcreaterole"
			AND NOT "worker"."rolinherit"
			AND NOT "worker"."rolreplication"
			AND NOT "worker"."rolbypassrls"
			AND NOT EXISTS (
				SELECT 1
				FROM "pg_catalog"."pg_auth_members"
				WHERE "member" = "worker"."oid"
			)
			AND 1 = (
				SELECT count(*)
				FROM "pg_catalog"."pg_auth_members" AS "owner_membership"
				INNER JOIN "pg_catalog"."pg_roles" AS "owner_role"
					ON "owner_role"."oid" = "owner_membership"."member"
				INNER JOIN "pg_catalog"."pg_roles" AS "grantor_role"
					ON "grantor_role"."oid" = "owner_membership"."grantor"
				WHERE "owner_membership"."roleid" = "worker"."oid"
					AND "owner_role"."rolname" = current_user
					AND "grantor_role"."rolsuper"
					AND "owner_membership"."admin_option"
					AND NOT "owner_membership"."inherit_option"
					AND NOT "owner_membership"."set_option"
			)
			AND NOT EXISTS (
				SELECT 1
				FROM "pg_catalog"."pg_auth_members" AS "membership"
				INNER JOIN "pg_catalog"."pg_roles" AS "member_role"
					ON "member_role"."oid" = "membership"."member"
				INNER JOIN "pg_catalog"."pg_roles" AS "membership_grantor"
					ON "membership_grantor"."oid" = "membership"."grantor"
				WHERE "membership"."roleid" = "worker"."oid"
					AND NOT (
						(
							"member_role"."rolname" = current_user
							AND "membership_grantor"."rolsuper"
							AND "membership"."admin_option"
							AND NOT "membership"."inherit_option"
							AND NOT "membership"."set_option"
						)
						OR (
							"member_role"."rolname" ~ '^mmhr_worker_[0-9a-f]{32}$'
							AND NOT "member_role"."rolsuper"
							AND NOT "member_role"."rolcreatedb"
							AND NOT "member_role"."rolcreaterole"
							AND "member_role"."rolinherit"
							AND NOT "member_role"."rolreplication"
							AND NOT "member_role"."rolbypassrls"
							AND "member_role"."rolvaliduntil" IS NOT NULL
							AND NOT "membership"."admin_option"
							AND "membership"."inherit_option"
							AND "membership"."set_option"
							AND 1 = (
							SELECT count(*)
							FROM "pg_catalog"."pg_auth_members" AS "forward_membership"
							WHERE "forward_membership"."member" = "member_role"."oid"
						)
							AND 1 = (
							SELECT count(*)
							FROM "pg_catalog"."pg_auth_members" AS "reverse_membership"
							WHERE "reverse_membership"."roleid" = "member_role"."oid"
						)
							AND EXISTS (
							SELECT 1
							FROM "pg_catalog"."pg_auth_members" AS "ownership"
							INNER JOIN "pg_catalog"."pg_roles" AS "owner_role"
								ON "owner_role"."oid" = "ownership"."member"
							INNER JOIN "pg_catalog"."pg_roles" AS "grantor_role"
								ON "grantor_role"."oid" = "ownership"."grantor"
							WHERE "ownership"."roleid" = "member_role"."oid"
								AND "owner_role"."rolname" = current_user
								AND "grantor_role"."rolsuper"
								AND "ownership"."admin_option"
								AND NOT "ownership"."inherit_option"
								AND NOT "ownership"."set_option"
						)
						)
					)
			)
	)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "mmhr_private"."r1_worker_role_is_safe"() FROM PUBLIC;--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_create_ephemeral_worker_login"(
	"login_name" text,
	"password_verifier" text,
	"expires_at" timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF "login_name" IS NULL OR "login_name" !~ '^mmhr_worker_[0-9a-f]{32}$' THEN
		RAISE EXCEPTION 'Invalid ephemeral worker login name';
	END IF;
	IF "password_verifier" IS NULL
		OR "password_verifier" !~ '^SCRAM-SHA-256[$]4096:[A-Za-z0-9+/]+={0,2}[$][A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$' THEN
		RAISE EXCEPTION 'Invalid ephemeral worker password verifier';
	END IF;
	IF "expires_at" IS NULL
		OR "expires_at" < clock_timestamp() + interval '1 minute'
		OR "expires_at" > clock_timestamp() + interval '10 minutes' THEN
		RAISE EXCEPTION 'Invalid ephemeral worker expiry';
	END IF;
	PERFORM "pg_catalog"."pg_advisory_xact_lock"(
		"pg_catalog"."hashtextextended"('mmhr.r1.worker.cleanup', 0)
	);
	IF NOT "mmhr_private"."r1_worker_role_is_safe"() THEN
		RAISE EXCEPTION 'Shared worker role is missing or unsafe';
	END IF;
	IF EXISTS (
		SELECT 1 FROM "pg_catalog"."pg_roles" WHERE "rolname" = "login_name"
	) THEN
		RAISE EXCEPTION 'Ephemeral worker login already exists';
	END IF;

	EXECUTE format(
		'CREATE ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L VALID UNTIL %L',
		"login_name",
		"password_verifier",
		"expires_at"
	);
	EXECUTE format(
		'GRANT mmhr_worker TO %I WITH ADMIN FALSE, INHERIT TRUE, SET TRUE',
		"login_name"
	);
	IF 1 <> (
		SELECT count(*)
		FROM "pg_catalog"."pg_auth_members"
		WHERE "member" = (
			SELECT "oid" FROM "pg_catalog"."pg_roles" WHERE "rolname" = "login_name"
		)
	) OR NOT EXISTS (
		SELECT 1
		FROM "pg_catalog"."pg_auth_members" AS "membership"
		INNER JOIN "pg_catalog"."pg_roles" AS "group_role"
			ON "group_role"."oid" = "membership"."roleid"
		WHERE "membership"."member" = (
			SELECT "oid" FROM "pg_catalog"."pg_roles" WHERE "rolname" = "login_name"
		)
			AND "group_role"."rolname" = 'mmhr_worker'
			AND NOT "membership"."admin_option"
			AND "membership"."inherit_option"
			AND "membership"."set_option"
	) OR 1 <> (
		SELECT count(*)
		FROM "pg_catalog"."pg_auth_members"
		WHERE "roleid" = (
			SELECT "oid" FROM "pg_catalog"."pg_roles" WHERE "rolname" = "login_name"
		)
	) OR NOT EXISTS (
		SELECT 1
		FROM "pg_catalog"."pg_auth_members" AS "ownership"
		INNER JOIN "pg_catalog"."pg_roles" AS "owner_role"
			ON "owner_role"."oid" = "ownership"."member"
		INNER JOIN "pg_catalog"."pg_roles" AS "grantor_role"
			ON "grantor_role"."oid" = "ownership"."grantor"
		WHERE "ownership"."roleid" = (
			SELECT "oid" FROM "pg_catalog"."pg_roles" WHERE "rolname" = "login_name"
		)
			AND "owner_role"."rolname" = current_user
			AND "grantor_role"."rolsuper"
			AND "ownership"."admin_option"
			AND NOT "ownership"."inherit_option"
			AND NOT "ownership"."set_option"
	) THEN
		RAISE EXCEPTION 'Ephemeral worker login owner membership is unsafe';
	END IF;
END
$$;--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_renew_ephemeral_worker_login"(
	"login_name" text,
	"expires_at" timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	"login" record;
BEGIN
	IF "login_name" IS NULL OR "login_name" !~ '^mmhr_worker_[0-9a-f]{32}$' THEN
		RAISE EXCEPTION 'Invalid ephemeral worker login name';
	END IF;
	IF "expires_at" IS NULL
		OR "expires_at" < clock_timestamp() + interval '1 minute'
		OR "expires_at" > clock_timestamp() + interval '10 minutes' THEN
		RAISE EXCEPTION 'Invalid ephemeral worker expiry';
	END IF;
	PERFORM "pg_catalog"."pg_advisory_xact_lock"(
		"pg_catalog"."hashtextextended"('mmhr.r1.worker.cleanup', 0)
	);
	IF NOT "mmhr_private"."r1_worker_role_is_safe"() THEN
		RAISE EXCEPTION 'Shared worker role is missing or unsafe';
	END IF;

	SELECT * INTO "login" FROM "pg_catalog"."pg_roles" WHERE "rolname" = "login_name";
	IF NOT FOUND
		OR "login"."rolsuper"
		OR "login"."rolcreatedb"
		OR "login"."rolcreaterole"
		OR NOT "login"."rolcanlogin"
		OR NOT "login"."rolinherit"
		OR "login"."rolreplication"
		OR "login"."rolbypassrls"
		OR NOT EXISTS (
			SELECT 1
			FROM "pg_catalog"."pg_auth_members" AS "membership"
			INNER JOIN "pg_catalog"."pg_roles" AS "group_role"
				ON "group_role"."oid" = "membership"."roleid"
			WHERE "membership"."member" = "login"."oid"
				AND "group_role"."rolname" = 'mmhr_worker'
				AND NOT "membership"."admin_option"
				AND "membership"."inherit_option"
				AND "membership"."set_option"
		)
		OR 1 <> (
			SELECT count(*) FROM "pg_catalog"."pg_auth_members"
			WHERE "member" = "login"."oid"
		)
		OR 1 <> (
			SELECT count(*) FROM "pg_catalog"."pg_auth_members"
			WHERE "roleid" = "login"."oid"
		)
		OR NOT EXISTS (
			SELECT 1
			FROM "pg_catalog"."pg_auth_members" AS "ownership"
			INNER JOIN "pg_catalog"."pg_roles" AS "owner_role"
				ON "owner_role"."oid" = "ownership"."member"
			INNER JOIN "pg_catalog"."pg_roles" AS "grantor_role"
				ON "grantor_role"."oid" = "ownership"."grantor"
			WHERE "ownership"."roleid" = "login"."oid"
				AND "owner_role"."rolname" = current_user
				AND "grantor_role"."rolsuper"
				AND "ownership"."admin_option"
				AND NOT "ownership"."inherit_option"
				AND NOT "ownership"."set_option"
		) THEN
		RAISE EXCEPTION 'Ephemeral worker login is missing or unsafe';
	END IF;

	EXECUTE format('ALTER ROLE %I VALID UNTIL %L', "login_name", "expires_at");
END
$$;--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_disable_ephemeral_worker_login"(
	"login_name" text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	"login" record;
BEGIN
	IF "login_name" IS NULL OR "login_name" !~ '^mmhr_worker_[0-9a-f]{32}$' THEN
		RAISE EXCEPTION 'Invalid ephemeral worker login name';
	END IF;
	PERFORM "pg_catalog"."pg_advisory_xact_lock"(
		"pg_catalog"."hashtextextended"('mmhr.r1.worker.cleanup', 0)
	);
	IF NOT "mmhr_private"."r1_worker_role_is_safe"() THEN
		RAISE EXCEPTION 'Shared worker role is missing or unsafe';
	END IF;

	SELECT * INTO "login" FROM "pg_catalog"."pg_roles" WHERE "rolname" = "login_name";
	IF NOT FOUND THEN
		RETURN;
	END IF;
	IF NOT EXISTS (
		SELECT 1
		FROM "pg_catalog"."pg_auth_members" AS "membership"
		INNER JOIN "pg_catalog"."pg_roles" AS "group_role"
			ON "group_role"."oid" = "membership"."roleid"
		WHERE "membership"."member" = "login"."oid"
			AND "group_role"."rolname" = 'mmhr_worker'
	) THEN
		RAISE EXCEPTION 'Ephemeral worker login is unsafe';
	END IF;

	EXECUTE format(
		'ALTER ROLE %I NOLOGIN PASSWORD NULL VALID UNTIL %L',
		"login_name",
		clock_timestamp()
	);
END
$$;--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_remove_ephemeral_worker_login"(
	"login_name" text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	"login" record;
	"activity" record;
BEGIN
	IF "login_name" IS NULL OR "login_name" !~ '^mmhr_worker_[0-9a-f]{32}$' THEN
		RAISE EXCEPTION 'Invalid ephemeral worker login name';
	END IF;
	PERFORM "pg_catalog"."pg_advisory_xact_lock"(
		"pg_catalog"."hashtextextended"('mmhr.r1.worker.cleanup', 0)
	);
	IF NOT "mmhr_private"."r1_worker_role_is_safe"() THEN
		RAISE EXCEPTION 'Shared worker role is missing or unsafe';
	END IF;

	SELECT * INTO "login" FROM "pg_catalog"."pg_roles" WHERE "rolname" = "login_name";
	IF NOT FOUND THEN
		RETURN;
	END IF;
	IF "login"."rolcanlogin"
		OR NOT EXISTS (
			SELECT 1
			FROM "pg_catalog"."pg_auth_members" AS "membership"
			INNER JOIN "pg_catalog"."pg_roles" AS "group_role"
				ON "group_role"."oid" = "membership"."roleid"
			WHERE "membership"."member" = "login"."oid"
				AND "group_role"."rolname" = 'mmhr_worker'
		) THEN
		RAISE EXCEPTION 'Ephemeral worker login must be disabled before removal';
	END IF;
	FOR "activity" IN
		SELECT "pid"
		FROM "pg_catalog"."pg_stat_activity"
		WHERE "usename" = "login_name"
			AND "pid" <> "pg_catalog"."pg_backend_pid"()
	LOOP
		IF NOT "pg_catalog"."pg_terminate_backend"("activity"."pid", 5000) THEN
			RAISE EXCEPTION 'Ephemeral worker session could not be terminated';
		END IF;
	END LOOP;
	PERFORM "pg_catalog"."pg_stat_clear_snapshot"();
	IF EXISTS (
		SELECT 1
		FROM "pg_catalog"."pg_stat_activity"
		WHERE "usename" = "login_name"
			AND "pid" <> "pg_catalog"."pg_backend_pid"()
	) THEN
		RAISE EXCEPTION 'Ephemeral worker sessions could not be terminated';
	END IF;

	EXECUTE format('REVOKE mmhr_worker FROM %I', "login_name");
	EXECUTE format('DROP ROLE %I', "login_name");
END
$$;--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_disable_expired_worker_logins"()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	"login" record;
	"disabled_count" integer := 0;
BEGIN
	PERFORM "pg_catalog"."pg_advisory_xact_lock"(
		"pg_catalog"."hashtextextended"('mmhr.r1.worker.cleanup', 0)
	);
	IF NOT "mmhr_private"."r1_worker_role_is_safe"() THEN
		RAISE EXCEPTION 'Shared worker role is missing or unsafe';
	END IF;

	FOR "login" IN
		SELECT *
		FROM "pg_catalog"."pg_roles"
		WHERE "rolname" ~ '^mmhr_worker_[0-9a-f]{32}$'
			AND "rolvaliduntil" IS NOT NULL
			AND "rolvaliduntil" <= clock_timestamp()
	LOOP
		PERFORM "mmhr_private"."r1_disable_ephemeral_worker_login"("login"."rolname");
		"disabled_count" := "disabled_count" + 1;
	END LOOP;
	RETURN "disabled_count";
END
$$;--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_remove_expired_worker_logins"()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	"login" record;
	"removed_count" integer := 0;
BEGIN
	PERFORM "pg_catalog"."pg_advisory_xact_lock"(
		"pg_catalog"."hashtextextended"('mmhr.r1.worker.cleanup', 0)
	);
	IF NOT "mmhr_private"."r1_worker_role_is_safe"() THEN
		RAISE EXCEPTION 'Shared worker role is missing or unsafe';
	END IF;

	FOR "login" IN
		SELECT *
		FROM "pg_catalog"."pg_roles"
		WHERE "rolname" ~ '^mmhr_worker_[0-9a-f]{32}$'
			AND NOT "rolcanlogin"
			AND "rolvaliduntil" IS NOT NULL
			AND "rolvaliduntil" <= clock_timestamp()
	LOOP
		PERFORM "mmhr_private"."r1_remove_ephemeral_worker_login"("login"."rolname");
		"removed_count" := "removed_count" + 1;
	END LOOP;
	RETURN "removed_count";
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "mmhr_private"."r1_create_ephemeral_worker_login"(text, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "mmhr_private"."r1_disable_ephemeral_worker_login"(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "mmhr_private"."r1_disable_expired_worker_logins"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "mmhr_private"."r1_renew_ephemeral_worker_login"(text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "mmhr_private"."r1_remove_ephemeral_worker_login"(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "mmhr_private"."r1_remove_expired_worker_logins"() FROM PUBLIC;--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_audit_summary_is_safe"("value" jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
	SELECT "value" IS NULL OR (
		"pg_catalog"."jsonb_typeof"("value") = 'object'
		AND NOT EXISTS (
			SELECT 1
			FROM "pg_catalog"."jsonb_each"("value") AS "entry"("key", "item")
			WHERE CASE "entry"."key"
				WHEN 'stable_key' THEN NOT (
					"pg_catalog"."jsonb_typeof"("entry"."item") = 'string'
					AND "entry"."item" #>> '{}' IN (
						'super_admin', 'admin', 'staff',
						'organization_admin', 'contributor', 'viewer'
					)
				)
				WHEN 'version' THEN NOT (
					"pg_catalog"."jsonb_typeof"("entry"."item") = 'number'
					AND "entry"."item" #>> '{}' ~ '^[1-9][0-9]{0,8}$'
				)
				WHEN 'state' THEN NOT (
					"pg_catalog"."jsonb_typeof"("entry"."item") = 'string'
					AND "entry"."item" #>> '{}' IN (
						'pending', 'active', 'recovery_pending', 'suspended',
						'archived', 'revoked', 'accepted', 'expired', 'draft',
						'approved', 'rejected', 'retired', 'verified', 'consumed',
						'cancelled', 'completed', 'in_flight', 'succeeded', 'failed',
						'outcome_unknown'
					)
				)
				WHEN 'status' THEN NOT (
					"pg_catalog"."jsonb_typeof"("entry"."item") = 'string'
					AND "entry"."item" #>> '{}' IN (
						'pending', 'active', 'recovery_pending', 'suspended',
						'archived', 'revoked', 'accepted', 'expired', 'draft',
						'approved', 'rejected', 'retired', 'verified', 'consumed',
						'cancelled', 'completed', 'in_flight', 'succeeded', 'failed',
						'outcome_unknown'
					)
				)
				WHEN 'identity_count' THEN NOT (
					"pg_catalog"."jsonb_typeof"("entry"."item") = 'number'
					AND "entry"."item" #>> '{}' ~ '^(0|[1-9][0-9]{0,8})$'
				)
				WHEN 'membership_count' THEN NOT (
					"pg_catalog"."jsonb_typeof"("entry"."item") = 'number'
					AND "entry"."item" #>> '{}' ~ '^(0|[1-9][0-9]{0,8})$'
				)
				WHEN 'invitation_count' THEN NOT (
					"pg_catalog"."jsonb_typeof"("entry"."item") = 'number'
					AND "entry"."item" #>> '{}' ~ '^(0|[1-9][0-9]{0,8})$'
				)
				WHEN 'role_definition_count' THEN NOT (
					"pg_catalog"."jsonb_typeof"("entry"."item") = 'number'
					AND "entry"."item" #>> '{}' ~ '^(0|[1-9][0-9]{0,8})$'
				)
				ELSE true
			END
		)
	)
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "mmhr_private"."r1_audit_summary_is_safe"(jsonb) FROM PUBLIC;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_before_summary_safe_ck" CHECK ("mmhr_private"."r1_audit_summary_is_safe"("before_summary"));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_after_summary_safe_ck" CHECK ("mmhr_private"."r1_audit_summary_is_safe"("after_summary"));--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_reject_immutable_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
	RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "mmhr_private"."r1_reject_immutable_mutation"() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER "audit_log_frozen" BEFORE INSERT OR UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_reject_immutable_mutation"();--> statement-breakpoint
CREATE TRIGGER "audit_log_frozen_truncate" BEFORE TRUNCATE ON "audit_log" FOR EACH STATEMENT EXECUTE FUNCTION "mmhr_private"."r1_reject_immutable_mutation"();--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only" BEFORE UPDATE OR DELETE ON "audit_events" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_reject_immutable_mutation"();--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only_truncate" BEFORE TRUNCATE ON "audit_events" FOR EACH STATEMENT EXECUTE FUNCTION "mmhr_private"."r1_reject_immutable_mutation"();--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_enforce_state_transition"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
	"old_state" text := to_jsonb(OLD) ->> TG_ARGV[0];
	"new_state" text := to_jsonb(NEW) ->> TG_ARGV[0];
	"allowed" boolean := false;
BEGIN
	IF "old_state" = "new_state" THEN
		RETURN NEW;
	END IF;

	CASE TG_TABLE_NAME
		WHEN 'identities' THEN
			"allowed" := ("old_state" = 'pending' AND "new_state" IN ('active', 'archived'))
				OR ("old_state" = 'active' AND "new_state" IN ('recovery_pending', 'suspended', 'archived'))
				OR ("old_state" = 'recovery_pending' AND "new_state" IN ('active', 'suspended', 'archived'))
				OR ("old_state" = 'suspended' AND "new_state" IN ('active', 'archived'));
		WHEN 'orgs' THEN
			"allowed" := ("old_state" = 'pending' AND "new_state" IN ('active', 'archived'))
				OR ("old_state" = 'active' AND "new_state" IN ('suspended', 'archived'))
				OR ("old_state" = 'suspended' AND "new_state" IN ('active', 'archived'));
		WHEN 'org_members' THEN
			"allowed" := ("old_state" = 'active' AND "new_state" IN ('suspended', 'revoked'))
				OR ("old_state" = 'suspended' AND "new_state" IN ('active', 'revoked'));
		WHEN 'invitations' THEN
			"allowed" := "old_state" = 'pending' AND "new_state" IN ('accepted', 'expired', 'revoked');
		WHEN 'role_definitions' THEN
			"allowed" := ("old_state" = 'draft' AND "new_state" IN ('approved', 'rejected'))
				OR ("old_state" = 'approved' AND "new_state" IN ('active', 'retired'))
				OR ("old_state" = 'active' AND "new_state" = 'approved');
		WHEN 'platform_role_assignments', 'user_permission_overrides', 'admin_delegation_grants', 'portal_access_grants' THEN
			"allowed" := "old_state" = 'active' AND "new_state" = 'revoked';
		WHEN 'identity_recovery_presence' THEN
			"allowed" := ("old_state" = 'pending' AND "new_state" IN ('linked', 'expired', 'cancelled'))
				OR ("old_state" = 'linked' AND "new_state" IN ('completed', 'cancelled'));
		WHEN 'identity_recovery_requests' THEN
			"allowed" := ("old_state" = 'pending' AND "new_state" IN ('approved', 'expired', 'cancelled'))
				OR ("old_state" = 'approved' AND "new_state" IN ('completed', 'expired', 'cancelled'));
		WHEN 'identity_admin_intents' THEN
			"allowed" := ("old_state" = 'pending' AND "new_state" IN ('in_flight', 'cancelled'))
				OR ("old_state" = 'in_flight' AND "new_state" IN ('succeeded', 'failed', 'outcome_unknown'))
				OR ("old_state" = 'outcome_unknown' AND "new_state" IN ('succeeded', 'failed'));
		WHEN 'security_bootstrap_state' THEN
			"allowed" := "old_state" = 'prepared' AND "new_state" = 'consumed';
	END CASE;

	IF NOT "allowed" THEN
		RAISE EXCEPTION 'Invalid state transition for %: % to %', TG_TABLE_NAME, "old_state", "new_state";
	END IF;
	RETURN NEW;
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "mmhr_private"."r1_enforce_state_transition"() FROM PUBLIC;--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_protect_role_definition_history"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		IF NEW."state" <> 'draft'
			OR NEW."approved_by_identity_id" IS NOT NULL
			OR NEW."approved_at" IS NOT NULL
			OR NEW."activated_at" IS NOT NULL
			OR NEW."retired_at" IS NOT NULL THEN
			RAISE EXCEPTION 'New role definitions must start as drafts';
		END IF;
		RETURN NEW;
	END IF;

	IF TG_OP = 'DELETE' THEN
		IF OLD."state" <> 'draft' THEN
			RAISE EXCEPTION 'Approved role definition history is immutable';
		END IF;
		RETURN OLD;
	END IF;

	IF OLD."state" <> 'draft' AND ROW(
		NEW."id",
		NEW."stable_key",
		NEW."version",
		NEW."kind",
		NEW."display_name",
		NEW."description",
		NEW."approved_by_identity_id",
		NEW."approved_at",
		NEW."created_at"
	) IS DISTINCT FROM ROW(
		OLD."id",
		OLD."stable_key",
		OLD."version",
		OLD."kind",
		OLD."display_name",
		OLD."description",
		OLD."approved_by_identity_id",
		OLD."approved_at",
		OLD."created_at"
	) THEN
		RAISE EXCEPTION 'Approved role definition content is immutable';
	END IF;
	IF OLD."state" = NEW."state" AND (
		NEW."activated_at" IS DISTINCT FROM OLD."activated_at"
		OR NEW."retired_at" IS DISTINCT FROM OLD."retired_at"
	) THEN
		RAISE EXCEPTION 'Role lifecycle times require a state transition';
	END IF;
	RETURN NEW;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "mmhr_private"."r1_protect_role_definition_history"() FROM PUBLIC;--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_protect_role_permission_defaults"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
	"old_role_state" text;
	"new_role_state" text;
BEGIN
	IF TG_OP IN ('UPDATE', 'DELETE') THEN
		SELECT "state"::text INTO "old_role_state"
		FROM "public"."role_definitions"
		WHERE "id" = OLD."role_definition_id";
		IF "old_role_state" IS DISTINCT FROM 'draft' THEN
			RAISE EXCEPTION 'Approved role permission defaults are immutable';
		END IF;
	END IF;

	IF TG_OP IN ('INSERT', 'UPDATE') THEN
		SELECT "state"::text INTO "new_role_state"
		FROM "public"."role_definitions"
		WHERE "id" = NEW."role_definition_id";
		IF "new_role_state" IS DISTINCT FROM 'draft' THEN
			RAISE EXCEPTION 'Permission defaults require a draft role definition';
		END IF;
	END IF;

	IF TG_OP = 'DELETE' THEN
		RETURN OLD;
	END IF;
	RETURN NEW;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "mmhr_private"."r1_protect_role_permission_defaults"() FROM PUBLIC;--> statement-breakpoint

CREATE FUNCTION "mmhr_private"."r1_protect_legacy_invitation_token"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
	IF TG_OP = 'INSERT' AND NEW."token" IS NOT NULL THEN
		RAISE EXCEPTION 'New invitations cannot store an application token';
	END IF;
	IF TG_OP = 'UPDATE' AND NEW."token" IS DISTINCT FROM OLD."token" THEN
		RAISE EXCEPTION 'Legacy invitation tokens are immutable';
	END IF;
	RETURN NEW;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "mmhr_private"."r1_protect_legacy_invitation_token"() FROM PUBLIC;--> statement-breakpoint

CREATE TRIGGER "role_definitions_history" BEFORE INSERT OR UPDATE OR DELETE ON "role_definitions" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_protect_role_definition_history"();--> statement-breakpoint
CREATE TRIGGER "role_permission_defaults_history" BEFORE INSERT OR UPDATE OR DELETE ON "role_permission_defaults" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_protect_role_permission_defaults"();--> statement-breakpoint
CREATE TRIGGER "role_definitions_no_truncate" BEFORE TRUNCATE ON "role_definitions" FOR EACH STATEMENT EXECUTE FUNCTION "mmhr_private"."r1_reject_immutable_mutation"();--> statement-breakpoint
CREATE TRIGGER "role_permission_defaults_no_truncate" BEFORE TRUNCATE ON "role_permission_defaults" FOR EACH STATEMENT EXECUTE FUNCTION "mmhr_private"."r1_reject_immutable_mutation"();--> statement-breakpoint
CREATE TRIGGER "invitations_legacy_token" BEFORE INSERT OR UPDATE OF "token" ON "invitations" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_protect_legacy_invitation_token"();--> statement-breakpoint
CREATE TRIGGER "identities_state_transition" BEFORE UPDATE OF "status" ON "identities" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_enforce_state_transition"('status');--> statement-breakpoint
CREATE TRIGGER "orgs_state_transition" BEFORE UPDATE OF "status" ON "orgs" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_enforce_state_transition"('status');--> statement-breakpoint
CREATE TRIGGER "org_members_state_transition" BEFORE UPDATE OF "status" ON "org_members" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_enforce_state_transition"('status');--> statement-breakpoint
CREATE TRIGGER "invitations_state_transition" BEFORE UPDATE OF "status" ON "invitations" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_enforce_state_transition"('status');--> statement-breakpoint
CREATE TRIGGER "role_definitions_state_transition" BEFORE UPDATE OF "state" ON "role_definitions" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_enforce_state_transition"('state');--> statement-breakpoint
CREATE TRIGGER "platform_role_assignments_state_transition" BEFORE UPDATE OF "state" ON "platform_role_assignments" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_enforce_state_transition"('state');--> statement-breakpoint
CREATE TRIGGER "user_permission_overrides_state_transition" BEFORE UPDATE OF "state" ON "user_permission_overrides" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_enforce_state_transition"('state');--> statement-breakpoint
CREATE TRIGGER "admin_delegation_grants_state_transition" BEFORE UPDATE OF "state" ON "admin_delegation_grants" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_enforce_state_transition"('state');--> statement-breakpoint
CREATE TRIGGER "portal_access_grants_state_transition" BEFORE UPDATE OF "state" ON "portal_access_grants" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_enforce_state_transition"('state');--> statement-breakpoint
CREATE TRIGGER "identity_recovery_presence_state_transition" BEFORE UPDATE OF "state" ON "identity_recovery_presence" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_enforce_state_transition"('state');--> statement-breakpoint
CREATE TRIGGER "identity_recovery_requests_state_transition" BEFORE UPDATE OF "state" ON "identity_recovery_requests" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_enforce_state_transition"('state');--> statement-breakpoint
CREATE TRIGGER "identity_admin_intents_state_transition" BEFORE UPDATE OF "state" ON "identity_admin_intents" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_enforce_state_transition"('state');--> statement-breakpoint
CREATE TRIGGER "security_bootstrap_state_transition" BEFORE UPDATE OF "state" ON "security_bootstrap_state" FOR EACH ROW EXECUTE FUNCTION "mmhr_private"."r1_enforce_state_transition"('state');--> statement-breakpoint

INSERT INTO "audit_events" (
	"actor_type", "actor_reference", "command", "action", "entity_type",
	"entity_id", "reason", "correlation_id", "after_summary"
)
SELECT
	'migration',
	'r1.2-migration',
	'role_definitions.seed',
	'role_version.activate',
	'role_definition',
	"id"::text,
	'Approved R1.2 baseline role definition.',
	gen_random_uuid(),
	jsonb_build_object('stable_key', "stable_key", 'version', "version", 'state', "state")
FROM "role_definitions"
WHERE "version" = 1;--> statement-breakpoint

INSERT INTO "audit_events" (
	"actor_type", "actor_reference", "command", "action", "entity_type",
	"entity_id", "reason", "correlation_id", "after_summary"
)
VALUES (
	'migration',
	'r1.2-migration',
	'schema.migrate',
	'r1.2_schema.add',
	'schema',
	'r1.2',
	'Add compatible identity and audit data without activating recovery.',
	gen_random_uuid(),
	jsonb_build_object(
		'identity_count', (SELECT count(*) FROM "identities"),
		'membership_count', (SELECT count(*) FROM "org_members"),
		'invitation_count', (SELECT count(*) FROM "invitations"),
		'role_definition_count', (SELECT count(*) FROM "role_definitions")
	)
);--> statement-breakpoint

COMMENT ON TABLE "identity_recovery_requests" IS 'R1.2 data only. No runtime recovery command or grant exists.';--> statement-breakpoint
COMMENT ON COLUMN "invitations"."token" IS 'Legacy value retained for rollback reads. New invitations must leave it null.';--> statement-breakpoint
COMMENT ON TABLE "audit_log" IS 'Frozen legacy snapshot format. New security events use audit_events.';
