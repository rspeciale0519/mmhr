-- Expand managed finance with exact source, independent review, and immutable evidence.
-- Legacy rows keep strict money requirements. New managed downstream paths remain denied.
-- Recovery: disable new entry points and use a reviewed forward correction; preserve all evidence.
CREATE TABLE "finance_agreement_applicability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"predecessor_version_id" uuid,
	"series_revision" integer NOT NULL,
	"cutover_at" timestamp with time zone NOT NULL,
	"approval_receipt_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_agreement_applicability_revision_ck" CHECK ("finance_agreement_applicability"."series_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "finance_agreement_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vendor_organization_id" uuid NOT NULL,
	"business_scope" text DEFAULT 'commission' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_by_identity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_agreement_series_org_ck" CHECK ("finance_agreement_series"."organization_id" <> "finance_agreement_series"."vendor_organization_id"),
	CONSTRAINT "finance_agreement_series_business_ck" CHECK ("finance_agreement_series"."business_scope" = 'commission'),
	CONSTRAINT "finance_agreement_series_revision_ck" CHECK ("finance_agreement_series"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "finance_agreement_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"predecessor_version_id" uuid,
	"expected_series_revision" integer NOT NULL,
	"source_document_id" uuid NOT NULL,
	"source_version_id" uuid NOT NULL,
	"source_sha256" text NOT NULL,
	"source_digest" text NOT NULL,
	"source_observation" jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"stated_effective_end" timestamp with time zone,
	"replacement_source_reference" text,
	"calculation_type" text NOT NULL,
	"rate_basis_points" integer,
	"flat_amount_minor_units" bigint,
	"currency" text,
	"unsupported_source_term_reference" text,
	"condition_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"prepared_by_identity_id" uuid NOT NULL,
	"prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_identity_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"review_reference" text,
	"reviewed_access_id" uuid,
	"decision_receipt_id" uuid,
	"correlation_id" uuid NOT NULL,
	"prepare_receipt_id" uuid NOT NULL,
	"prepare_request" jsonb NOT NULL,
	"prepare_request_digest" text NOT NULL,
	"decision_request" jsonb,
	"decision_request_digest" text,
	"decision_correlation_id" uuid,
	CONSTRAINT "finance_agreement_versions_hash_ck" CHECK ("finance_agreement_versions"."source_sha256" ~ '^[a-f0-9]{64}$' and "finance_agreement_versions"."source_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "finance_agreement_versions_dates_ck" CHECK ("finance_agreement_versions"."stated_effective_end" is null or "finance_agreement_versions"."stated_effective_end" > "finance_agreement_versions"."effective_from"),
	CONSTRAINT "finance_agreement_versions_lineage_ck" CHECK ("finance_agreement_versions"."version" > 0 and "finance_agreement_versions"."expected_series_revision" >= 0
    and (("finance_agreement_versions"."predecessor_version_id" is null and "finance_agreement_versions"."expected_series_revision" = 0 and "finance_agreement_versions"."replacement_source_reference" is null)
      or ("finance_agreement_versions"."predecessor_version_id" is not null and "finance_agreement_versions"."expected_series_revision" > 0 and "finance_agreement_versions"."replacement_source_reference" is not null))),
	CONSTRAINT "finance_agreement_versions_rule_ck" CHECK (("finance_agreement_versions"."calculation_type" = 'flat_amount' and "finance_agreement_versions"."flat_amount_minor_units" is not null and "finance_agreement_versions"."flat_amount_minor_units" between 0 and 9007199254740991
      and "finance_agreement_versions"."rate_basis_points" is null and "finance_agreement_versions"."currency" is not null and "finance_agreement_versions"."currency" ~ '^[A-Z]{3}$' and "finance_agreement_versions"."unsupported_source_term_reference" is null)
    or ("finance_agreement_versions"."calculation_type" = 'contract_value_rate' and "finance_agreement_versions"."rate_basis_points" is not null and "finance_agreement_versions"."rate_basis_points" between 0 and 10000 and "finance_agreement_versions"."flat_amount_minor_units" is null
      and "finance_agreement_versions"."currency" is not null and "finance_agreement_versions"."currency" ~ '^[A-Z]{3}$' and "finance_agreement_versions"."unsupported_source_term_reference" is null)
    or ("finance_agreement_versions"."calculation_type" = 'unsupported' and "finance_agreement_versions"."flat_amount_minor_units" is null and "finance_agreement_versions"."rate_basis_points" is null
      and "finance_agreement_versions"."currency" is null and "finance_agreement_versions"."unsupported_source_term_reference" is not null)),
	CONSTRAINT "finance_agreement_versions_conditions_ck" CHECK (jsonb_typeof("finance_agreement_versions"."condition_references") = 'array'
    and jsonb_array_length("finance_agreement_versions"."condition_references") <= 50 and octet_length("finance_agreement_versions"."condition_references"::text) <= 30000),
	CONSTRAINT "finance_agreement_versions_receipt_ck" CHECK ("finance_agreement_versions"."prepare_request_digest" ~ '^[a-f0-9]{64}$'
    and jsonb_typeof("finance_agreement_versions"."prepare_request") = 'object' and octet_length("finance_agreement_versions"."prepare_request"::text) <= 100000
    and (("finance_agreement_versions"."state" = 'pending' and "finance_agreement_versions"."decision_request" is null and "finance_agreement_versions"."decision_request_digest" is null and "finance_agreement_versions"."decision_correlation_id" is null)
      or ("finance_agreement_versions"."state" in ('approved','rejected') and "finance_agreement_versions"."decision_request" is not null and jsonb_typeof("finance_agreement_versions"."decision_request") = 'object'
        and "finance_agreement_versions"."decision_request_digest" is not null and "finance_agreement_versions"."decision_request_digest" ~ '^[a-f0-9]{64}$' and "finance_agreement_versions"."decision_correlation_id" is not null))),
	CONSTRAINT "finance_agreement_versions_decision_ck" CHECK (("finance_agreement_versions"."state" = 'pending' and "finance_agreement_versions"."revision" = 1 and "finance_agreement_versions"."decided_by_identity_id" is null
      and "finance_agreement_versions"."decided_at" is null and "finance_agreement_versions"."decision_receipt_id" is null and "finance_agreement_versions"."reviewed_access_id" is null
      and "finance_agreement_versions"."decision_reason" is null and "finance_agreement_versions"."review_reference" is null)
    or ("finance_agreement_versions"."state" in ('approved','rejected') and "finance_agreement_versions"."revision" = 2 and "finance_agreement_versions"."decided_by_identity_id" is not null
      and "finance_agreement_versions"."decided_by_identity_id" <> "finance_agreement_versions"."prepared_by_identity_id" and "finance_agreement_versions"."decided_at" is not null and "finance_agreement_versions"."decided_at" >= "finance_agreement_versions"."prepared_at"
      and "finance_agreement_versions"."decision_receipt_id" is not null and "finance_agreement_versions"."reviewed_access_id" is not null and "finance_agreement_versions"."decision_reason" is not null and "finance_agreement_versions"."review_reference" is not null))
);
--> statement-breakpoint
CREATE TABLE "finance_contract_facts_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"handoff_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"predecessor_version_id" uuid,
	"expected_facts_revision" integer NOT NULL,
	"source_document_id" uuid NOT NULL,
	"source_version_id" uuid NOT NULL,
	"source_sha256" text NOT NULL,
	"source_digest" text NOT NULL,
	"source_reference" text NOT NULL,
	"source_observation" jsonb NOT NULL,
	"contract_value_minor_units" bigint,
	"contract_currency" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"prepared_by_identity_id" uuid NOT NULL,
	"prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_identity_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"review_reference" text,
	"reviewed_access_id" uuid,
	"decision_receipt_id" uuid,
	"correlation_id" uuid NOT NULL,
	"prepare_receipt_id" uuid NOT NULL,
	"prepare_request" jsonb NOT NULL,
	"prepare_request_digest" text NOT NULL,
	"decision_request" jsonb,
	"decision_request_digest" text,
	"decision_correlation_id" uuid,
	CONSTRAINT "finance_contract_facts_money_ck" CHECK (("finance_contract_facts_versions"."contract_value_minor_units" is null or ("finance_contract_facts_versions"."contract_value_minor_units" between 0 and 9007199254740991
    and "finance_contract_facts_versions"."contract_currency" is not null)) and ("finance_contract_facts_versions"."contract_currency" is null or "finance_contract_facts_versions"."contract_currency" ~ '^[A-Z]{3}$')),
	CONSTRAINT "finance_contract_facts_hash_ck" CHECK ("finance_contract_facts_versions"."source_sha256" ~ '^[a-f0-9]{64}$' and "finance_contract_facts_versions"."source_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "finance_contract_facts_receipt_ck" CHECK ("finance_contract_facts_versions"."prepare_request_digest" ~ '^[a-f0-9]{64}$'
    and jsonb_typeof("finance_contract_facts_versions"."prepare_request") = 'object' and octet_length("finance_contract_facts_versions"."prepare_request"::text) <= 100000
    and (("finance_contract_facts_versions"."state" = 'pending' and "finance_contract_facts_versions"."decision_request" is null and "finance_contract_facts_versions"."decision_request_digest" is null and "finance_contract_facts_versions"."decision_correlation_id" is null)
      or ("finance_contract_facts_versions"."state" in ('approved','rejected') and "finance_contract_facts_versions"."decision_request" is not null and jsonb_typeof("finance_contract_facts_versions"."decision_request") = 'object'
        and "finance_contract_facts_versions"."decision_request_digest" is not null and "finance_contract_facts_versions"."decision_request_digest" ~ '^[a-f0-9]{64}$' and "finance_contract_facts_versions"."decision_correlation_id" is not null))),
	CONSTRAINT "finance_contract_facts_lineage_ck" CHECK ("finance_contract_facts_versions"."version" > 0 and "finance_contract_facts_versions"."expected_facts_revision" >= 0
    and (("finance_contract_facts_versions"."predecessor_version_id" is null and "finance_contract_facts_versions"."expected_facts_revision" = 0)
      or ("finance_contract_facts_versions"."predecessor_version_id" is not null and "finance_contract_facts_versions"."expected_facts_revision" > 0))),
	CONSTRAINT "finance_contract_facts_decision_ck" CHECK (("finance_contract_facts_versions"."state" = 'pending' and "finance_contract_facts_versions"."revision" = 1 and "finance_contract_facts_versions"."decided_by_identity_id" is null
      and "finance_contract_facts_versions"."decided_at" is null and "finance_contract_facts_versions"."reviewed_access_id" is null and "finance_contract_facts_versions"."decision_receipt_id" is null
      and "finance_contract_facts_versions"."decision_reason" is null and "finance_contract_facts_versions"."review_reference" is null)
    or ("finance_contract_facts_versions"."state" in ('approved','rejected') and "finance_contract_facts_versions"."revision" = 2 and "finance_contract_facts_versions"."decided_by_identity_id" is not null
      and "finance_contract_facts_versions"."decided_by_identity_id" <> "finance_contract_facts_versions"."prepared_by_identity_id" and "finance_contract_facts_versions"."decided_at" is not null and "finance_contract_facts_versions"."decided_at" >= "finance_contract_facts_versions"."prepared_at"
      and "finance_contract_facts_versions"."reviewed_access_id" is not null and "finance_contract_facts_versions"."decision_receipt_id" is not null and "finance_contract_facts_versions"."decision_reason" is not null and "finance_contract_facts_versions"."review_reference" is not null))
);
--> statement-breakpoint
CREATE TABLE "managed_commission_calculations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"commission_event_id" uuid NOT NULL,
	"calculation_revision" integer NOT NULL,
	"facts_version_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"expected_event_revision" integer NOT NULL,
	"source_digest" text NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"result_snapshot" jsonb NOT NULL,
	"algorithm" text NOT NULL,
	"amount_minor_units" bigint,
	"currency" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"prepared_by_identity_id" uuid NOT NULL,
	"prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_identity_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"review_reference" text,
	"decision_receipt_id" uuid,
	"correlation_id" uuid NOT NULL,
	"prepare_receipt_id" uuid NOT NULL,
	"prepare_request" jsonb NOT NULL,
	"prepare_request_digest" text NOT NULL,
	"decision_request" jsonb,
	"decision_request_digest" text,
	"decision_correlation_id" uuid,
	CONSTRAINT "managed_commission_calculations_receipt_ck" CHECK ("managed_commission_calculations"."expected_event_revision" > 0 and "managed_commission_calculations"."prepare_request_digest" ~ '^[a-f0-9]{64}$'
    and jsonb_typeof("managed_commission_calculations"."prepare_request") = 'object' and octet_length("managed_commission_calculations"."prepare_request"::text) <= 100000
    and (("managed_commission_calculations"."state" = 'pending' and "managed_commission_calculations"."decision_request" is null and "managed_commission_calculations"."decision_request_digest" is null and "managed_commission_calculations"."decision_correlation_id" is null)
      or ("managed_commission_calculations"."state" in ('approved','rejected') and "managed_commission_calculations"."decision_request" is not null and jsonb_typeof("managed_commission_calculations"."decision_request") = 'object'
        and "managed_commission_calculations"."decision_request_digest" is not null and "managed_commission_calculations"."decision_request_digest" ~ '^[a-f0-9]{64}$' and "managed_commission_calculations"."decision_correlation_id" is not null))),
	CONSTRAINT "managed_commission_calculations_algorithm_ck" CHECK ("managed_commission_calculations"."algorithm" = 'managed_commission_minor_units_half_up_v1' and "managed_commission_calculations"."calculation_revision" > 0),
	CONSTRAINT "managed_commission_calculations_money_ck" CHECK (("managed_commission_calculations"."amount_minor_units" is null and "managed_commission_calculations"."currency" is null)
    or ("managed_commission_calculations"."amount_minor_units" is not null and "managed_commission_calculations"."amount_minor_units" between 0 and 9007199254740991 and "managed_commission_calculations"."currency" is not null and "managed_commission_calculations"."currency" ~ '^[A-Z]{3}$')),
	CONSTRAINT "managed_commission_calculations_snapshot_ck" CHECK ("managed_commission_calculations"."source_digest" ~ '^[a-f0-9]{64}$' and jsonb_typeof("managed_commission_calculations"."input_snapshot") = 'object'
    and jsonb_typeof("managed_commission_calculations"."result_snapshot") = 'object' and octet_length("managed_commission_calculations"."input_snapshot"::text) <= 100000
    and octet_length("managed_commission_calculations"."result_snapshot"::text) <= 100000),
	CONSTRAINT "managed_commission_calculations_decision_ck" CHECK (("managed_commission_calculations"."state" = 'pending' and "managed_commission_calculations"."revision" = 1 and "managed_commission_calculations"."decided_by_identity_id" is null
      and "managed_commission_calculations"."decided_at" is null and "managed_commission_calculations"."decision_receipt_id" is null and "managed_commission_calculations"."decision_reason" is null and "managed_commission_calculations"."review_reference" is null)
    or ("managed_commission_calculations"."state" in ('approved','rejected') and "managed_commission_calculations"."revision" = 2 and "managed_commission_calculations"."decided_by_identity_id" is not null
      and "managed_commission_calculations"."decided_by_identity_id" <> "managed_commission_calculations"."prepared_by_identity_id" and "managed_commission_calculations"."decided_at" is not null and "managed_commission_calculations"."decided_at" >= "managed_commission_calculations"."prepared_at"
      and "managed_commission_calculations"."decision_receipt_id" is not null and "managed_commission_calculations"."decision_reason" is not null and "managed_commission_calculations"."review_reference" is not null
      and ("managed_commission_calculations"."state" <> 'approved' or ("managed_commission_calculations"."amount_minor_units" is not null and "managed_commission_calculations"."currency" is not null))))
);
--> statement-breakpoint
CREATE TABLE "managed_commission_sources" (
	"commission_event_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"handoff_id" uuid NOT NULL,
	"structure_id" uuid,
	"agreement_organization_id" uuid NOT NULL,
	"agreement_version_id" uuid NOT NULL,
	"applicability_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"resolved_effective_from" timestamp with time zone NOT NULL,
	"resolved_effective_end" timestamp with time zone,
	"source_snapshot" jsonb NOT NULL,
	"source_digest" text NOT NULL,
	"created_by_identity_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"creation_request" jsonb NOT NULL,
	"creation_request_digest" text NOT NULL,
	"creation_correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "managed_commission_sources_request_ck" CHECK ("managed_commission_sources"."creation_request_digest" ~ '^[a-f0-9]{64}$' and jsonb_typeof("managed_commission_sources"."creation_request") = 'object' and octet_length("managed_commission_sources"."creation_request"::text) <= 100000),
	CONSTRAINT "managed_commission_sources_dates_ck" CHECK ("managed_commission_sources"."resolved_effective_end" is null or "managed_commission_sources"."resolved_effective_end" > "managed_commission_sources"."resolved_effective_from"),
	CONSTRAINT "managed_commission_sources_digest_ck" CHECK ("managed_commission_sources"."source_digest" ~ '^[a-f0-9]{64}$' and jsonb_typeof("managed_commission_sources"."source_snapshot") = 'object'
    and octet_length("managed_commission_sources"."source_snapshot"::text) <= 100000)
);
--> statement-breakpoint
CREATE TABLE "managed_finance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"actor_identity_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "managed_finance_events_type_ck" CHECK ("managed_finance_events"."entity_type" in ('finance_agreement_version','finance_contract_facts_version','managed_commission_calculation','commission_event')),
	CONSTRAINT "managed_finance_events_revision_ck" CHECK ("managed_finance_events"."revision" > 0),
	CONSTRAINT "managed_finance_events_snapshot_ck" CHECK (jsonb_typeof("managed_finance_events"."snapshot") = 'object' and octet_length("managed_finance_events"."snapshot"::text) <= 400000)
);
--> statement-breakpoint
ALTER TABLE "commission_events" DROP CONSTRAINT "commission_events_revision_ck";
--> statement-breakpoint
ALTER TABLE "commission_events" ALTER COLUMN "structure_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "commission_events" ALTER COLUMN "currency" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "commission_events" ALTER COLUMN "contract_value_minor_units" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "commission_events" ALTER COLUMN "commission_amount_minor_units" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "commission_event_history" ADD COLUMN "event_revision" integer;
--> statement-breakpoint
ALTER TABLE "commission_events" ADD COLUMN "source_mode" text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commission_events" ADD COLUMN "event_revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "commission_events" ADD COLUMN "contract_currency" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_agreement_applicability_scope_uq" ON "finance_agreement_applicability" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_agreement_applicability_binding_uq" ON "finance_agreement_applicability" USING btree ("organization_id","agreement_id","version_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_agreement_applicability_version_uq" ON "finance_agreement_applicability" USING btree ("version_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_agreement_applicability_predecessor_uq" ON "finance_agreement_applicability" USING btree ("predecessor_version_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_agreement_applicability_series_revision_uq" ON "finance_agreement_applicability" USING btree ("agreement_id","series_revision");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_agreement_applicability_cutover_uq" ON "finance_agreement_applicability" USING btree ("agreement_id","cutover_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_agreement_series_scope_uq" ON "finance_agreement_series" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_agreement_series_vendor_scope_uq" ON "finance_agreement_series" USING btree ("vendor_organization_id","business_scope");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_agreement_versions_scope_uq" ON "finance_agreement_versions" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_agreement_versions_series_identity_uq" ON "finance_agreement_versions" USING btree ("organization_id","agreement_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_agreement_versions_series_version_uq" ON "finance_agreement_versions" USING btree ("agreement_id","version");
--> statement-breakpoint
CREATE INDEX "finance_agreement_versions_effective_idx" ON "finance_agreement_versions" USING btree ("agreement_id","state","effective_from");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_contract_facts_versions_scope_uq" ON "finance_contract_facts_versions" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_contract_facts_versions_contract_identity_uq" ON "finance_contract_facts_versions" USING btree ("organization_id","contract_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_contract_facts_versions_contract_version_uq" ON "finance_contract_facts_versions" USING btree ("organization_id","contract_id","version");
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_commission_calculations_scope_uq" ON "managed_commission_calculations" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_commission_calculations_revision_uq" ON "managed_commission_calculations" USING btree ("commission_event_id","calculation_revision");
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_commission_sources_scope_uq" ON "managed_commission_sources" USING btree ("organization_id","commission_event_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_commission_sources_contract_uq" ON "managed_commission_sources" USING btree ("organization_id","contract_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_finance_events_entity_revision_uq" ON "managed_finance_events" USING btree ("entity_type","entity_id","revision");
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_finance_events_receipt_uq" ON "managed_finance_events" USING btree ("receipt_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_contract_handoff_details_contract_identity_uq" ON "portal_contract_handoff_details" USING btree ("organization_id","contract_id","handoff_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_document_sources_original_binding_uq" ON "finance_document_sources" USING btree ("organization_id","document_id","version_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "commission_event_history_managed_revision_uq" ON "commission_event_history" USING btree ("commission_event_id","event_revision");
--> statement-breakpoint
CREATE UNIQUE INDEX "commission_events_contract_identity_uq" ON "commission_events" USING btree ("organization_id","id","contract_id");
--> statement-breakpoint
ALTER TABLE "finance_agreement_applicability" ADD CONSTRAINT "finance_agreement_applicability_approval_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("approval_receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_agreement_applicability" ADD CONSTRAINT "finance_agreement_applicability_series_fk" FOREIGN KEY ("organization_id","agreement_id") REFERENCES "public"."finance_agreement_series"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_agreement_applicability" ADD CONSTRAINT "finance_agreement_applicability_version_fk" FOREIGN KEY ("organization_id","agreement_id","version_id") REFERENCES "public"."finance_agreement_versions"("organization_id","agreement_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_agreement_applicability" ADD CONSTRAINT "finance_agreement_applicability_predecessor_fk" FOREIGN KEY ("organization_id","agreement_id","predecessor_version_id") REFERENCES "public"."finance_agreement_versions"("organization_id","agreement_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_agreement_series" ADD CONSTRAINT "finance_agreement_series_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_agreement_series" ADD CONSTRAINT "finance_agreement_series_vendor_organization_id_orgs_id_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_agreement_series" ADD CONSTRAINT "finance_agreement_series_created_by_identity_id_identities_id_fk" FOREIGN KEY ("created_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_agreement_versions" ADD CONSTRAINT "finance_agreement_versions_prepared_by_identity_id_identities_id_fk" FOREIGN KEY ("prepared_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_agreement_versions" ADD CONSTRAINT "finance_agreement_versions_decided_by_identity_id_identities_id_fk" FOREIGN KEY ("decided_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_agreement_versions" ADD CONSTRAINT "finance_agreement_versions_decision_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("decision_receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_agreement_versions" ADD CONSTRAINT "finance_agreement_versions_prepare_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("prepare_receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_agreement_versions" ADD CONSTRAINT "finance_agreement_versions_series_fk" FOREIGN KEY ("organization_id","agreement_id") REFERENCES "public"."finance_agreement_series"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_agreement_versions" ADD CONSTRAINT "finance_agreement_versions_source_fk" FOREIGN KEY ("organization_id","source_document_id","source_version_id") REFERENCES "public"."finance_document_sources"("organization_id","document_id","version_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_agreement_versions" ADD CONSTRAINT "finance_agreement_versions_predecessor_fk" FOREIGN KEY ("organization_id","agreement_id","predecessor_version_id") REFERENCES "public"."finance_agreement_versions"("organization_id","agreement_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_contract_facts_versions" ADD CONSTRAINT "finance_contract_facts_versions_prepared_by_identity_id_identities_id_fk" FOREIGN KEY ("prepared_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_contract_facts_versions" ADD CONSTRAINT "finance_contract_facts_versions_decided_by_identity_id_identities_id_fk" FOREIGN KEY ("decided_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_contract_facts_versions" ADD CONSTRAINT "finance_contract_facts_versions_decision_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("decision_receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_contract_facts_versions" ADD CONSTRAINT "finance_contract_facts_versions_prepare_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("prepare_receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_contract_facts_versions" ADD CONSTRAINT "finance_contract_facts_contract_handoff_fk" FOREIGN KEY ("organization_id","contract_id","handoff_id") REFERENCES "public"."portal_contract_handoff_details"("organization_id","contract_id","handoff_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_contract_facts_versions" ADD CONSTRAINT "finance_contract_facts_original_fk" FOREIGN KEY ("organization_id","source_document_id","source_version_id") REFERENCES "public"."finance_document_sources"("organization_id","document_id","version_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_contract_facts_versions" ADD CONSTRAINT "finance_contract_facts_predecessor_fk" FOREIGN KEY ("organization_id","contract_id","predecessor_version_id") REFERENCES "public"."finance_contract_facts_versions"("organization_id","contract_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_commission_calculations" ADD CONSTRAINT "managed_commission_calculations_prepared_by_identity_id_identities_id_fk" FOREIGN KEY ("prepared_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_commission_calculations" ADD CONSTRAINT "managed_commission_calculations_decided_by_identity_id_identities_id_fk" FOREIGN KEY ("decided_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_commission_calculations" ADD CONSTRAINT "managed_commission_calculations_decision_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("decision_receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_commission_calculations" ADD CONSTRAINT "managed_commission_calculations_prepare_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("prepare_receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_commission_calculations" ADD CONSTRAINT "managed_commission_calculations_source_fk" FOREIGN KEY ("organization_id","commission_event_id") REFERENCES "public"."managed_commission_sources"("organization_id","commission_event_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_commission_calculations" ADD CONSTRAINT "managed_commission_calculations_event_contract_fk" FOREIGN KEY ("organization_id","commission_event_id","contract_id") REFERENCES "public"."commission_events"("organization_id","id","contract_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_commission_calculations" ADD CONSTRAINT "managed_commission_calculations_facts_fk" FOREIGN KEY ("organization_id","contract_id","facts_version_id") REFERENCES "public"."finance_contract_facts_versions"("organization_id","contract_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_commission_sources" ADD CONSTRAINT "managed_commission_sources_created_by_identity_id_identities_id_fk" FOREIGN KEY ("created_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_commission_sources" ADD CONSTRAINT "managed_commission_sources_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_commission_sources" ADD CONSTRAINT "managed_commission_sources_event_fk" FOREIGN KEY ("organization_id","commission_event_id","contract_id") REFERENCES "public"."commission_events"("organization_id","id","contract_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_commission_sources" ADD CONSTRAINT "managed_commission_sources_structure_fk" FOREIGN KEY ("organization_id","structure_id") REFERENCES "public"."commission_structures"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_commission_sources" ADD CONSTRAINT "managed_commission_sources_contract_handoff_fk" FOREIGN KEY ("organization_id","contract_id","handoff_id") REFERENCES "public"."portal_contract_handoff_details"("organization_id","contract_id","handoff_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_commission_sources" ADD CONSTRAINT "managed_commission_sources_applicability_fk" FOREIGN KEY ("agreement_organization_id","agreement_id","agreement_version_id","applicability_id") REFERENCES "public"."finance_agreement_applicability"("organization_id","agreement_id","version_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_finance_events" ADD CONSTRAINT "managed_finance_events_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_finance_events" ADD CONSTRAINT "managed_finance_events_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "commission_event_history" ADD CONSTRAINT "commission_event_history_managed_revision_ck" CHECK ("commission_event_history"."event_revision" is null or "commission_event_history"."event_revision" > 0);
--> statement-breakpoint
ALTER TABLE "commission_events" ADD CONSTRAINT "commission_events_source_mode_ck" CHECK ("commission_events"."source_mode" in ('legacy','managed') and "commission_events"."event_revision" > 0);
--> statement-breakpoint
ALTER TABLE "commission_events" ADD CONSTRAINT "commission_events_known_money_ck" CHECK (("commission_events"."source_mode" = 'legacy' and "commission_events"."structure_id" is not null
      and "commission_events"."currency" is not null and "commission_events"."contract_value_minor_units" is not null and "commission_events"."commission_amount_minor_units" is not null)
    or ("commission_events"."source_mode" = 'managed'
      and ("commission_events"."commission_amount_minor_units" is null or ("commission_events"."currency" is not null and "commission_events"."commission_amount_minor_units" <= 9007199254740991))
      and ("commission_events"."contract_value_minor_units" is null or ("commission_events"."contract_currency" is not null and "commission_events"."contract_value_minor_units" <= 9007199254740991))
      and ("commission_events"."contract_currency" is null or "commission_events"."contract_currency" ~ '^[A-Z]{3}$')
      and ("commission_events"."state" = 'pending_review' or ("commission_events"."structure_id" is not null and "commission_events"."currency" is not null and "commission_events"."commission_amount_minor_units" is not null))));
--> statement-breakpoint
ALTER TABLE "commission_events" ADD CONSTRAINT "commission_events_revision_ck" CHECK (("commission_events"."source_mode" = 'legacy' and "commission_events"."calculation_revision" > 0)
    or ("commission_events"."source_mode" = 'managed' and "commission_events"."calculation_revision" >= 0
      and ("commission_events"."state" = 'pending_review' or "commission_events"."calculation_revision" > 0)));
--> statement-breakpoint
-- Scratch-only draft. This validates the normalized wire payload. The server
-- wrapper removes correlationId/idempotencyKey and applies the shared schema.
CREATE FUNCTION mmhr_private.r7_managed_exact_keys(value jsonb,keys text[])
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' SET timezone='UTC' AS $$
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  RETURN value ?& keys AND (SELECT count(*) FROM jsonb_object_keys(value))=cardinality(keys);
END $$;

CREATE FUNCTION mmhr_private.r7_managed_uuid(value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' SET timezone='UTC' AS $$
  SELECT coalesce(jsonb_typeof(value)='string' AND value#>>'{}' ~
    '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$',false)
$$;

CREATE FUNCTION mmhr_private.r7_managed_integer(value jsonb,minimum numeric,maximum numeric)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE parsed numeric;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  parsed:=(value#>>'{}')::numeric;
  RETURN parsed=trunc(parsed) AND parsed BETWEEN minimum AND maximum;
END $$;

CREATE FUNCTION mmhr_private.r7_managed_reference(value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' SET timezone='UTC' AS $$
  SELECT coalesce(jsonb_typeof(value)='string' AND length(btrim(value#>>'{}')) BETWEEN 1 AND 500
    AND value#>>'{}' !~ '[\x01-\x1f\x7f]',false)
$$;

-- This is the frozen proposalQuoteCurrencyCodes inventory, not a guessed ISO
-- pattern. A future inventory change needs an explicit compatible SQL change.
CREATE FUNCTION mmhr_private.r7_managed_currency(value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' SET timezone='UTC' AS $$
  SELECT coalesce(jsonb_typeof(value)='string' AND value#>>'{}'=ANY(ARRAY[
    'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD',
    'CAD','CDF','CHF','CLP','CNY','COP','CRC','CUC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD',
    'HKD','HNL','HRK','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD',
    'MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG',
    'QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SLL','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS',
    'UAH','UGX','USD','UYU','UZS','VES','VND','VUV','WST','XAF','XCD','XCG','XDR','XOF','XPF','XSU','YER','ZAR','ZMW','ZWG','ZWL']),false)
$$;

CREATE FUNCTION mmhr_private.r7_managed_instant(value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE parsed timestamptz;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'string' OR value#>>'{}' !~
    '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
    THEN RETURN false; END IF;
  parsed:=(value#>>'{}')::timestamptz;
  RETURN isfinite(parsed);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $$;

CREATE FUNCTION mmhr_private.r7_managed_command_input_ok(p jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE a text; keys text[]; ids text[]; k text; source jsonb; rule jsonb;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>100000
    OR NOT mmhr_private.r7_managed_uuid(p->'organizationId')
    OR jsonb_typeof(p->'reason') IS DISTINCT FROM 'string'
    OR mmhr_private.r1_security_reason_is_safe(p->>'reason') IS NOT TRUE THEN RETURN false; END IF;
  a:=p->>'action'; keys:=ARRAY['organizationId','action','reason']; ids:=ARRAY[]::text[];
  CASE a
    WHEN 'prepare_agreement' THEN
      keys:=keys||ARRAY['agreementId','versionId','vendorOrganizationId','expectedSeriesRevision','predecessorVersionId','source',
        'effectiveFrom','statedEffectiveEnd','replacementSourceReference','rule','conditionReferences'];
      ids:=ARRAY['agreementId','versionId','vendorOrganizationId'];
      IF NOT mmhr_private.r7_managed_integer(p->'expectedSeriesRevision',0,2147483646)
        OR NOT mmhr_private.r7_managed_instant(p->'effectiveFrom')
        OR NOT (p->'statedEffectiveEnd'='null'::jsonb OR mmhr_private.r7_managed_instant(p->'statedEffectiveEnd'))
        OR NOT (p->'replacementSourceReference'='null'::jsonb OR mmhr_private.r7_managed_reference(p->'replacementSourceReference'))
        OR jsonb_typeof(p->'conditionReferences') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
      IF jsonb_array_length(p->'conditionReferences')>50 OR octet_length((p->'conditionReferences')::text)>30000
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'conditionReferences') item WHERE NOT mmhr_private.r7_managed_reference(item))
        OR (p->>'statedEffectiveEnd' IS NOT NULL AND (p->>'statedEffectiveEnd')::timestamptz<=(p->>'effectiveFrom')::timestamptz)
        OR p->'organizationId'=p->'vendorOrganizationId'
        OR (p->'predecessorVersionId'='null'::jsonb) IS DISTINCT FROM (p->'replacementSourceReference'='null'::jsonb) THEN RETURN false; END IF;
      rule:=p->'rule';
      CASE rule->>'kind'
        WHEN 'flat_amount' THEN
          IF NOT mmhr_private.r7_managed_exact_keys(rule,ARRAY['kind','amountMinorUnits','currency'])
            OR NOT mmhr_private.r7_managed_integer(rule->'amountMinorUnits',0,9007199254740991)
            OR NOT mmhr_private.r7_managed_currency(rule->'currency') THEN RETURN false; END IF;
        WHEN 'contract_value_rate' THEN
          IF NOT mmhr_private.r7_managed_exact_keys(rule,ARRAY['kind','rateBasisPoints','currency'])
            OR NOT mmhr_private.r7_managed_integer(rule->'rateBasisPoints',0,10000)
            OR NOT mmhr_private.r7_managed_currency(rule->'currency') THEN RETURN false; END IF;
        WHEN 'unsupported' THEN
          IF NOT mmhr_private.r7_managed_exact_keys(rule,ARRAY['kind','sourceTermReference'])
            OR NOT mmhr_private.r7_managed_reference(rule->'sourceTermReference') THEN RETURN false; END IF;
        ELSE RETURN false;
      END CASE;
    WHEN 'approve_agreement','reject_agreement' THEN
      keys:=keys||ARRAY['agreementId','versionId','expectedSeriesRevision','predecessorVersionId','expectedRevision','expectedSourceDigest',
        'reviewedAccessId','contentsReviewed','reviewReference']; ids:=ARRAY['agreementId','versionId','reviewedAccessId'];
      IF NOT mmhr_private.r7_managed_integer(p->'expectedSeriesRevision',0,2147483646) THEN RETURN false; END IF;
    WHEN 'prepare_contract_facts' THEN
      keys:=keys||ARRAY['contractId','handoffId','versionId','predecessorVersionId','expectedFactsRevision','source','contractValue','sourceReference'];
      ids:=ARRAY['contractId','handoffId','versionId'];
      IF NOT mmhr_private.r7_managed_integer(p->'expectedFactsRevision',0,2147483646)
        OR NOT mmhr_private.r7_managed_reference(p->'sourceReference')
        OR NOT mmhr_private.r7_managed_exact_keys(p->'contractValue',ARRAY['amountMinorUnits','currency']) THEN RETURN false; END IF;
      IF NOT (p->'contractValue'->'amountMinorUnits'='null'::jsonb OR mmhr_private.r7_managed_integer(p->'contractValue'->'amountMinorUnits',0,9007199254740991))
        OR NOT (p->'contractValue'->'currency'='null'::jsonb OR mmhr_private.r7_managed_currency(p->'contractValue'->'currency'))
        OR (p->'contractValue'->'amountMinorUnits'<>'null'::jsonb AND p->'contractValue'->'currency'='null'::jsonb) THEN RETURN false; END IF;
    WHEN 'approve_contract_facts','reject_contract_facts' THEN
      keys:=keys||ARRAY['contractId','versionId','expectedFactsRevision','predecessorVersionId','expectedRevision','expectedSourceDigest',
        'reviewedAccessId','contentsReviewed','reviewReference']; ids:=ARRAY['contractId','versionId','reviewedAccessId'];
      IF NOT mmhr_private.r7_managed_integer(p->'expectedFactsRevision',0,2147483646) THEN RETURN false; END IF;
    WHEN 'resolve_eligibility' THEN
      keys:=keys||ARRAY['contractId','handoffId']; ids:=ARRAY['contractId','handoffId'];
    WHEN 'prepare_calculation' THEN
      keys:=keys||ARRAY['commissionEventId','calculationId','expectedEventRevision','expectedSourceDigest']; ids:=ARRAY['commissionEventId','calculationId'];
    WHEN 'approve_calculation','reject_calculation' THEN
      keys:=keys||ARRAY['commissionEventId','calculationId','expectedEventRevision','expectedCalculationRevision','expectedSourceDigest','reviewReference'];
      ids:=ARRAY['commissionEventId','calculationId'];
      IF NOT mmhr_private.r7_managed_integer(p->'expectedCalculationRevision',1,2147483646)
        OR NOT mmhr_private.r7_managed_reference(p->'reviewReference') THEN RETURN false; END IF;
    ELSE RETURN false;
  END CASE;
  IF NOT mmhr_private.r7_managed_exact_keys(p,keys)
    OR EXISTS(SELECT 1 FROM unnest(ids) key WHERE NOT mmhr_private.r7_managed_uuid(p->key)) THEN RETURN false; END IF;
  IF p ? 'expectedSourceDigest' AND (jsonb_typeof(p->'expectedSourceDigest') IS DISTINCT FROM 'string'
    OR p->>'expectedSourceDigest' !~ '^[a-f0-9]{64}$') THEN RETURN false; END IF;
  IF p ? 'expectedEventRevision' AND NOT mmhr_private.r7_managed_integer(p->'expectedEventRevision',1,2147483646) THEN RETURN false; END IF;
  IF p ? 'expectedRevision' AND (NOT mmhr_private.r7_managed_integer(p->'expectedRevision',1,2147483646)
    OR p->'contentsReviewed' IS DISTINCT FROM 'true'::jsonb OR NOT mmhr_private.r7_managed_reference(p->'reviewReference')) THEN RETURN false; END IF;
  IF p ? 'predecessorVersionId' THEN
    IF NOT (p->'predecessorVersionId'='null'::jsonb OR mmhr_private.r7_managed_uuid(p->'predecessorVersionId'))
      OR (p->'predecessorVersionId'='null'::jsonb) IS DISTINCT FROM
        (coalesce(p->>'expectedSeriesRevision',p->>'expectedFactsRevision')::integer=0)
      OR (a IN ('prepare_agreement','prepare_contract_facts') AND p->'predecessorVersionId'=p->'versionId') THEN RETURN false; END IF;
  END IF;
  IF p ? 'source' THEN
    source:=p->'source';
    IF NOT mmhr_private.r7_managed_exact_keys(source,ARRAY['organizationId','documentId','versionId','sha256'])
      OR EXISTS(SELECT 1 FROM unnest(ARRAY['organizationId','documentId','versionId']) key WHERE NOT mmhr_private.r7_managed_uuid(source->key))
      OR source->'organizationId' IS DISTINCT FROM p->'organizationId' OR jsonb_typeof(source->'sha256') IS DISTINCT FROM 'string'
      OR source->>'sha256' !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  END IF;
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $$;

REVOKE ALL ON FUNCTION mmhr_private.r7_managed_exact_keys(jsonb,text[]),mmhr_private.r7_managed_uuid(jsonb),
  mmhr_private.r7_managed_integer(jsonb,numeric,numeric),mmhr_private.r7_managed_reference(jsonb),
  mmhr_private.r7_managed_currency(jsonb),mmhr_private.r7_managed_instant(jsonb),mmhr_private.r7_managed_command_input_ok(jsonb)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;

--> statement-breakpoint
-- Scratch-only draft. Append after generated DDL and the canonical expansion.
-- These indexes support exact composite references without changing old rows.
-- Composite-supporting indexes appear before the generated foreign keys.

CREATE FUNCTION mmhr_private.r7_managed_digest(value jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path='' SET timezone='UTC' AS $$
  SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex')
$$;

CREATE FUNCTION mmhr_private.r7_managed_receipt_ok(p_receipt_id uuid,p_actor uuid,p_org_id uuid,p_entity uuid,
  p_entity_type text,p_action text,p_correlation_id uuid,p_request jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT EXISTS(SELECT 1 FROM public.security_command_receipts r JOIN public.audit_events a ON a.id=r.audit_event_id
    WHERE r.id=p_receipt_id AND r.actor_identity_id=p_actor AND r.entity_id=p_entity
      AND r.command='r7.finance.managed.'||p_action AND r.action='finance.'||p_action
      AND r.request_digest=mmhr_private.r7_managed_digest(p_request)
      AND a.actor_type='user' AND a.actor_identity_id=p_actor AND a.organization_id=p_org_id AND a.entity_type=p_entity_type
      AND a.reason=btrim(p_request->>'reason') AND a.occurred_at=r.created_at
      AND a.before_summary IS NOT DISTINCT FROM CASE WHEN p_action IN ('approve_agreement','reject_agreement',
        'approve_contract_facts','reject_contract_facts','approve_calculation','reject_calculation')
        THEN jsonb_build_object('status','completed') ELSE NULL END
      AND a.after_summary=jsonb_build_object('status','completed')
      AND a.entity_id=p_entity::text AND a.command=r.command AND a.action=r.action
      AND a.idempotency_key=r.idempotency_key::text AND a.correlation_id=p_correlation_id)
$$;

-- Historical approval is immutable evidence. The current preparer/decision actor
-- and the supported source association remain live authorization checks.
CREATE FUNCTION mmhr_private.r7_managed_original_ok(p_org_id uuid,p_doc_id uuid,p_version_id uuid,p_sha text,p_source jsonb)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT EXISTS(SELECT 1 FROM public.finance_document_sources f
    JOIN public.workflow_document_uploads u ON u.version_id=f.version_id AND u.organization_id=f.organization_id AND u.document_id=f.document_id
    JOIN public.workflow_document_versions v ON v.id=u.version_id AND v.organization_id=u.organization_id AND v.document_id=u.document_id
    JOIN public.finance_document_approvals approved ON approved.version_id=v.id AND approved.organization_id=v.organization_id
      AND approved.document_id=v.document_id AND approved.sha256=lower(v.sha256)
    WHERE f.organization_id=p_org_id AND f.document_id=p_doc_id AND f.version_id=p_version_id
      AND f.source_snapshot=p_source AND lower(v.sha256)=p_sha
      AND mmhr_private.r7_finance_document_source_valid(p_org_id,p_source)
      AND mmhr_private.r7_finance_document_content_actor(p_org_id,p_doc_id,p_version_id,u.revision,'finance_original')
        IS NOT NULL)
$$;

CREATE FUNCTION mmhr_private.r7_managed_review_access_ok(p_org_id uuid,p_doc_id uuid,p_version_id uuid,
  p_actor uuid,p_access_id uuid,p_decided_at timestamptz)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT EXISTS(SELECT 1 FROM mmhr_private.finance_document_access_grants g
    JOIN public.workflow_document_uploads u ON u.organization_id=g.organization_id AND u.document_id=g.document_id AND u.version_id=g.version_id
    WHERE g.id=p_access_id AND g.organization_id=p_org_id AND g.document_id=p_doc_id AND g.version_id=p_version_id
      AND g.actor_identity_id=p_actor AND p_actor=mmhr_private.r7_finance_document_actor(p_org_id)
      AND g.purpose='finance_original' AND g.session_id=(auth.jwt()->>'session_id')::uuid
      AND g.revision=u.revision AND g.created_at<=p_decided_at AND g.created_at>p_decided_at-interval '30 minutes'
      AND p_decided_at<=clock_timestamp() AND p_decided_at>clock_timestamp()-interval '10 seconds')
$$;

CREATE FUNCTION mmhr_private.r7_managed_agreement_rule(row_value public.finance_agreement_versions)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' SET timezone='UTC' AS $$
  SELECT CASE row_value.calculation_type WHEN 'flat_amount' THEN jsonb_build_object('kind','flat_amount',
    'amountMinorUnits',row_value.flat_amount_minor_units,'currency',row_value.currency)
    WHEN 'contract_value_rate' THEN jsonb_build_object('kind','contract_value_rate','rateBasisPoints',row_value.rate_basis_points,'currency',row_value.currency)
    ELSE jsonb_build_object('kind','unsupported','sourceTermReference',row_value.unsupported_source_term_reference) END
$$;

CREATE FUNCTION mmhr_private.r7_managed_document_observation(p_org uuid,p_doc uuid,p_original uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT jsonb_build_object('original',jsonb_build_object('organizationId',p_org,'documentId',p_doc,'versionId',p_original,
      'sha256',lower(original.sha256)),
    'tip',jsonb_build_object('versionId',tip.id,'version',tip.version,'sha256',lower(tip.sha256)))
  FROM public.workflow_documents d JOIN public.workflow_document_versions original
    ON original.organization_id=d.organization_id AND original.document_id=d.id AND original.id=p_original
    JOIN public.workflow_document_versions tip ON tip.organization_id=d.organization_id AND tip.document_id=d.id AND tip.version=d.current_version
  WHERE d.organization_id=p_org AND d.id=p_doc AND d.state='active'
$$;

-- Use timestamp JSON serialization under UTC. Do not convert source times to JS
-- Date or round microseconds. Client payload spelling is retained in receipts.
CREATE FUNCTION mmhr_private.r7_managed_calculation_observation(event_id uuid,facts_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT jsonb_build_object('source',to_jsonb(s),'contract',jsonb_build_object('contractId',e.contract_id,
      'handoffId',s.handoff_id,'dealId',e.deal_id,'vendorOrganizationId',e.vendor_organization_id,'signedAt',e.signed_at),
    'agreement',to_jsonb(a),'facts',to_jsonb(f),'approvedFactsTip',tip.id,
    'agreementDocumentTip',jsonb_build_object('documentId',ad.id,'versionId',av.id,'version',av.version,'sha256',lower(av.sha256)),
    'contractDocumentTip',jsonb_build_object('documentId',fd.id,'versionId',fv.id,'version',fv.version,'sha256',lower(fv.sha256)))
  FROM public.commission_events e JOIN public.managed_commission_sources s ON s.commission_event_id=e.id AND s.organization_id=e.organization_id
    JOIN public.finance_agreement_versions a ON a.id=s.agreement_version_id AND a.organization_id=s.agreement_organization_id AND a.agreement_id=s.agreement_id
    JOIN public.finance_contract_facts_versions f ON f.id=facts_id AND f.organization_id=e.organization_id AND f.contract_id=e.contract_id AND f.handoff_id=s.handoff_id
    JOIN public.workflow_documents ad ON ad.id=a.source_document_id AND ad.organization_id=a.organization_id AND ad.state='active'
    JOIN public.workflow_document_versions av ON av.document_id=ad.id AND av.organization_id=ad.organization_id AND av.version=ad.current_version
    JOIN public.workflow_documents fd ON fd.id=f.source_document_id AND fd.organization_id=f.organization_id AND fd.state='active'
    JOIN public.workflow_document_versions fv ON fv.document_id=fd.id AND fv.organization_id=fd.organization_id AND fv.version=fd.current_version
    JOIN LATERAL (SELECT latest.id FROM public.finance_contract_facts_versions latest WHERE latest.organization_id=e.organization_id
      AND latest.contract_id=e.contract_id AND latest.state='approved' ORDER BY latest.version DESC LIMIT 1) tip ON tip.id=f.id
  WHERE e.id=event_id AND e.source_mode='managed' AND a.state='approved' AND f.state='approved'
    AND mmhr_private.r7_finance_document_actor(e.organization_id) IS NOT NULL
    AND mmhr_private.r7_finance_document_actor(a.organization_id) IS NOT NULL
$$;

CREATE FUNCTION mmhr_private.r7_managed_calculation_result(observation jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE terms jsonb:=observation->'agreement'; facts jsonb:=observation->'facts'; amount numeric; blockers jsonb:='[]';
BEGIN
  IF observation IS NULL OR jsonb_typeof(observation) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  IF terms->>'calculation_type'='unsupported' THEN blockers:=blockers||jsonb_build_array('rule_unsupported'); END IF;
  IF terms->'condition_references' IS DISTINCT FROM '[]'::jsonb THEN blockers:=blockers||jsonb_build_array('conditions_unsupported'); END IF;
  IF terms->>'currency' IS NULL THEN blockers:=blockers||jsonb_build_array('commission_currency_missing'); END IF;
  IF terms->>'calculation_type'='contract_value_rate' THEN
    IF facts->>'contract_value_minor_units' IS NULL THEN blockers:=blockers||jsonb_build_array('contract_value_missing'); END IF;
    IF facts->>'contract_currency' IS NULL THEN blockers:=blockers||jsonb_build_array('contract_currency_missing');
    ELSIF terms->>'currency' IS NOT NULL AND facts->>'contract_currency'<>terms->>'currency' THEN
      blockers:=blockers||jsonb_build_array('currency_conversion_unsupported'); END IF;
  END IF;
  IF jsonb_array_length(blockers)>0 THEN RETURN jsonb_build_object('algorithm','managed_commission_minor_units_half_up_v1',
    'status','blocked','blockers',blockers,'commission',NULL); END IF;
  IF terms->>'calculation_type'='flat_amount' THEN amount:=(terms->>'flat_amount_minor_units')::numeric;
  ELSIF terms->>'calculation_type'='contract_value_rate' THEN
    amount:=floor(((facts->>'contract_value_minor_units')::numeric*(terms->>'rate_basis_points')::numeric+5000)/10000);
  ELSE RETURN NULL; END IF;
  IF amount IS NULL OR amount<0 OR amount>9007199254740991 OR trunc(amount)<>amount THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('algorithm','managed_commission_minor_units_half_up_v1','status','calculated','blockers','[]'::jsonb,
    'commission',jsonb_build_object('amountMinorUnits',amount,'currency',terms->>'currency'));
END $$;

REVOKE ALL ON FUNCTION mmhr_private.r7_managed_digest(jsonb),
  mmhr_private.r7_managed_receipt_ok(uuid,uuid,uuid,uuid,text,text,uuid,jsonb),
  mmhr_private.r7_managed_original_ok(uuid,uuid,uuid,text,jsonb),
  mmhr_private.r7_managed_review_access_ok(uuid,uuid,uuid,uuid,uuid,timestamptz),
  mmhr_private.r7_managed_agreement_rule(public.finance_agreement_versions),
  mmhr_private.r7_managed_document_observation(uuid,uuid,uuid),
  mmhr_private.r7_managed_calculation_observation(uuid,uuid),mmhr_private.r7_managed_calculation_result(jsonb)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;

-- Rejecting a stale source preserves its exact approved historical original.
-- Current finance/content authority remains mandatory; new source publication
-- continues to require r7_managed_original_ok and live source eligibility.
CREATE FUNCTION mmhr_private.r7_managed_original_retained_ok(p_org_id uuid,p_doc_id uuid,p_version_id uuid,p_sha text,p_source jsonb)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT EXISTS(SELECT 1 FROM public.finance_document_sources f
    JOIN public.workflow_document_uploads u ON u.version_id=f.version_id AND u.organization_id=f.organization_id AND u.document_id=f.document_id
    JOIN public.workflow_document_versions v ON v.id=u.version_id AND v.organization_id=u.organization_id AND v.document_id=u.document_id
    JOIN public.finance_document_approvals approved ON approved.version_id=v.id AND approved.organization_id=v.organization_id
      AND approved.document_id=v.document_id AND approved.sha256=lower(v.sha256)
    WHERE f.organization_id=p_org_id AND f.document_id=p_doc_id AND f.version_id=p_version_id
      AND f.source_snapshot=p_source AND lower(v.sha256)=p_sha
      AND mmhr_private.r7_finance_document_source_integrity(p_org_id,p_source)
      AND mmhr_private.r7_finance_document_content_actor(p_org_id,p_doc_id,p_version_id,u.revision,'finance_original') IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION mmhr_private.r7_managed_original_retained_ok(uuid,uuid,uuid,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;

--> statement-breakpoint
-- Scratch-only draft. No public commands are enabled by these guards.
CREATE FUNCTION mmhr_private.r7_managed_source_version_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_actor uuid; v_expected jsonb; v_source jsonb; v_document jsonb; v_action text;
  v_parent uuid; v_revision integer; v_latest uuid; v_max integer; v_rejection boolean;
BEGIN
  IF TG_OP NOT IN ('INSERT','UPDATE') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance source is immutable'; END IF;
  PERFORM mmhr_private.r1_lock_security();
  v_actor:=mmhr_private.r7_finance_document_actor(NEW.organization_id);
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance source authority denied'; END IF;
  v_rejection:=TG_OP='UPDATE' AND NEW.state='rejected';
  v_document:=CASE WHEN v_rejection THEN OLD.source_observation
    ELSE mmhr_private.r7_managed_document_observation(NEW.organization_id,NEW.source_document_id,NEW.source_version_id) END;
  IF mmhr_private.r1_security_reason_is_safe(NEW.prepare_request->>'reason') IS NOT TRUE
    OR (TG_OP='UPDATE' AND mmhr_private.r1_security_reason_is_safe(NEW.decision_reason) IS NOT TRUE) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance source reason denied'; END IF;
  IF TG_TABLE_NAME='finance_agreement_versions' THEN
    IF (NEW.currency IS NOT NULL AND mmhr_private.r7_managed_currency(to_jsonb(NEW.currency)) IS NOT TRUE)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.condition_references) condition
      WHERE jsonb_typeof(condition) IS DISTINCT FROM 'string' OR length(btrim(condition#>>'{}')) NOT BETWEEN 1 AND 500
        OR condition#>>'{}' ~ '[\x01-\x1f\x7f]')
      OR (NEW.unsupported_source_term_reference IS NOT NULL AND (length(btrim(NEW.unsupported_source_term_reference)) NOT BETWEEN 1 AND 500
        OR NEW.unsupported_source_term_reference ~ '[\x01-\x1f\x7f]'))
      OR (NEW.replacement_source_reference IS NOT NULL AND (length(btrim(NEW.replacement_source_reference)) NOT BETWEEN 1 AND 500
        OR NEW.replacement_source_reference ~ '[\x01-\x1f\x7f]')) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance agreement references denied'; END IF;
    SELECT s.id,s.revision INTO v_parent,v_revision FROM public.finance_agreement_series s
      JOIN public.orgs o ON o.id=s.organization_id AND o.type='internal' AND o.status='active' AND NOT o.migration_review_required
      WHERE s.id=NEW.agreement_id AND s.organization_id=NEW.organization_id FOR UPDATE OF s;
    SELECT jsonb_build_object('sourceClass','agreement','vendorOrganizationId',s.vendor_organization_id) INTO v_source
      FROM public.finance_agreement_series s WHERE s.id=v_parent;
    SELECT a.id INTO v_latest FROM public.finance_agreement_versions a WHERE a.agreement_id=v_parent AND a.state='approved' ORDER BY a.version DESC LIMIT 1;
    SELECT coalesce(max(a.version),0) INTO v_max FROM public.finance_agreement_versions a WHERE a.agreement_id=v_parent;
    v_expected:=jsonb_build_object('organizationId',NEW.organization_id,'action','prepare_agreement','agreementId',NEW.agreement_id,
      'versionId',NEW.id,'vendorOrganizationId',v_source->'vendorOrganizationId','expectedSeriesRevision',NEW.expected_series_revision,
      'predecessorVersionId',NEW.predecessor_version_id,'source',v_document->'original',
      'effectiveFrom',NEW.prepare_request->'effectiveFrom','statedEffectiveEnd',NEW.prepare_request->'statedEffectiveEnd',
      'replacementSourceReference',NEW.replacement_source_reference,'rule',mmhr_private.r7_managed_agreement_rule(NEW),
      'conditionReferences',NEW.condition_references,'reason',NEW.prepare_request->'reason');
    IF (NEW.prepare_request->>'effectiveFrom')::timestamptz IS DISTINCT FROM NEW.effective_from
      OR (NEW.prepare_request->>'statedEffectiveEnd')::timestamptz IS DISTINCT FROM NEW.stated_effective_end THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance agreement dates denied'; END IF;
    IF NOT v_rejection AND (v_revision IS DISTINCT FROM NEW.expected_series_revision OR v_latest IS DISTINCT FROM NEW.predecessor_version_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance agreement lineage denied'; END IF;
    IF v_rejection THEN v_revision:=OLD.expected_series_revision; END IF;
  ELSE
    IF (NEW.contract_currency IS NOT NULL AND mmhr_private.r7_managed_currency(to_jsonb(NEW.contract_currency)) IS NOT TRUE)
      OR length(btrim(NEW.source_reference)) NOT BETWEEN 1 AND 500 OR NEW.source_reference ~ '[\x01-\x1f\x7f]' THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance facts reference denied'; END IF;
    SELECT p.contract_id INTO v_parent FROM public.portal_contract_handoff_details p
      WHERE p.organization_id=NEW.organization_id AND p.contract_id=NEW.contract_id AND p.handoff_id=NEW.handoff_id;
    SELECT f.source_snapshot INTO v_source FROM public.finance_document_sources f
      WHERE f.organization_id=NEW.organization_id AND f.document_id=NEW.source_document_id AND f.version_id=NEW.source_version_id
        AND f.source_class='signed_contract' AND f.contract_id=NEW.contract_id AND f.handoff_id=NEW.handoff_id;
    SELECT f.id,f.version INTO v_latest,v_revision FROM public.finance_contract_facts_versions f
      WHERE f.organization_id=NEW.organization_id AND f.contract_id=NEW.contract_id AND f.state='approved' ORDER BY f.version DESC LIMIT 1;
    SELECT coalesce(max(f.version),0) INTO v_max FROM public.finance_contract_facts_versions f
      WHERE f.organization_id=NEW.organization_id AND f.contract_id=NEW.contract_id;
    v_revision:=coalesce(v_revision,0);
    v_expected:=jsonb_build_object('organizationId',NEW.organization_id,'action','prepare_contract_facts','contractId',NEW.contract_id,
      'handoffId',NEW.handoff_id,'versionId',NEW.id,'predecessorVersionId',NEW.predecessor_version_id,
      'expectedFactsRevision',NEW.expected_facts_revision,'source',v_document->'original',
      'contractValue',jsonb_build_object('amountMinorUnits',NEW.contract_value_minor_units,'currency',NEW.contract_currency),
      'sourceReference',NEW.source_reference,'reason',NEW.prepare_request->'reason');
    IF NOT v_rejection AND (v_revision IS DISTINCT FROM NEW.expected_facts_revision OR v_latest IS DISTINCT FROM NEW.predecessor_version_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance facts lineage denied'; END IF;
    IF v_rejection THEN v_revision:=OLD.expected_facts_revision; END IF;
  END IF;
  IF v_parent IS NULL OR v_source IS NULL OR v_document IS NULL OR NEW.prepare_request IS DISTINCT FROM v_expected
    OR jsonb_typeof(NEW.prepare_request->'reason') IS DISTINCT FROM 'string'
    OR length(btrim(NEW.prepare_request->>'reason')) NOT BETWEEN 1 AND 2000
    OR NEW.source_sha256 IS DISTINCT FROM v_document->'original'->>'sha256'
    OR NEW.source_observation IS DISTINCT FROM v_document
    OR NEW.source_digest IS DISTINCT FROM mmhr_private.r7_managed_digest(jsonb_build_object('request',v_expected,'document',v_document))
    OR NEW.prepare_request_digest IS DISTINCT FROM mmhr_private.r7_managed_digest(v_expected)
    OR (CASE WHEN v_rejection THEN mmhr_private.r7_managed_original_retained_ok(NEW.organization_id,NEW.source_document_id,NEW.source_version_id,NEW.source_sha256,v_source)
      ELSE mmhr_private.r7_managed_original_ok(NEW.organization_id,NEW.source_document_id,NEW.source_version_id,NEW.source_sha256,v_source) END) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance source evidence denied'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'pending' OR NEW.revision<>1 OR NEW.prepared_by_identity_id<>v_actor OR NEW.version<>v_max+1
      OR NEW.prepared_at>clock_timestamp() OR NEW.prepared_at<clock_timestamp()-interval '10 seconds' THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance preparation denied'; END IF;
  ELSE
    IF OLD.state<>'pending' OR OLD.revision<>1 OR NEW.state NOT IN ('approved','rejected') OR NEW.revision<>2
      OR NEW.decided_by_identity_id IS DISTINCT FROM v_actor OR NEW.decided_by_identity_id=OLD.prepared_by_identity_id
      OR length(btrim(NEW.decision_reason)) NOT BETWEEN 1 AND 2000 OR length(btrim(NEW.review_reference)) NOT BETWEEN 1 AND 500
      OR NEW.review_reference ~ '[\x01-\x1f\x7f]'
      OR (to_jsonb(NEW)-ARRAY['state','revision','decided_by_identity_id','decided_at','decision_reason','review_reference',
        'reviewed_access_id','decision_receipt_id','decision_request','decision_request_digest','decision_correlation_id'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','decided_by_identity_id','decided_at','decision_reason','review_reference',
        'reviewed_access_id','decision_receipt_id','decision_request','decision_request_digest','decision_correlation_id'])
      OR mmhr_private.r7_managed_review_access_ok(NEW.organization_id,NEW.source_document_id,NEW.source_version_id,
        v_actor,NEW.reviewed_access_id,NEW.decided_at) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance source decision denied'; END IF;
    v_action:=(CASE WHEN NEW.state='approved' THEN 'approve_' ELSE 'reject_' END)||
      CASE WHEN TG_TABLE_NAME='finance_agreement_versions' THEN 'agreement' ELSE 'contract_facts' END;
    v_expected:=jsonb_build_object('organizationId',NEW.organization_id,'action',v_action,'versionId',NEW.id,'expectedRevision',1,
      'expectedSourceDigest',OLD.source_digest,'reviewedAccessId',NEW.reviewed_access_id,'contentsReviewed',true,
      'reason',NEW.decision_reason,'reviewReference',NEW.review_reference,'predecessorVersionId',NEW.predecessor_version_id)
      ||CASE WHEN TG_TABLE_NAME='finance_agreement_versions' THEN jsonb_build_object('agreementId',v_parent,'expectedSeriesRevision',v_revision)
        ELSE jsonb_build_object('contractId',v_parent,'expectedFactsRevision',v_revision) END;
    IF NEW.decision_request IS DISTINCT FROM v_expected OR NEW.decision_request_digest IS DISTINCT FROM mmhr_private.r7_managed_digest(v_expected) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance decision request denied'; END IF;
  END IF;
  RETURN NEW;
END $$;

-- Deferred receipt/history checks permit the command to finish within the same
-- transaction, while rejecting owner writes that lack the exact final evidence.
CREATE FUNCTION mmhr_private.r7_managed_source_version_commit_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_type text; v_action text; v_actor uuid; v_receipt uuid; v_correlation uuid; v_request jsonb;
BEGIN
  v_type:=CASE WHEN TG_TABLE_NAME='finance_agreement_versions' THEN 'finance_agreement_version' ELSE 'finance_contract_facts_version' END;
  v_action:=CASE WHEN TG_OP='INSERT' THEN 'prepare_' WHEN NEW.state='approved' THEN 'approve_' ELSE 'reject_' END||
    CASE WHEN TG_TABLE_NAME='finance_agreement_versions' THEN 'agreement' ELSE 'contract_facts' END;
  v_actor:=CASE WHEN TG_OP='INSERT' THEN NEW.prepared_by_identity_id ELSE NEW.decided_by_identity_id END;
  v_receipt:=CASE WHEN TG_OP='INSERT' THEN NEW.prepare_receipt_id ELSE NEW.decision_receipt_id END;
  v_correlation:=CASE WHEN TG_OP='INSERT' THEN NEW.correlation_id ELSE NEW.decision_correlation_id END;
  v_request:=CASE WHEN TG_OP='INSERT' THEN NEW.prepare_request ELSE NEW.decision_request END;
  IF mmhr_private.r7_managed_receipt_ok(v_receipt,v_actor,NEW.organization_id,NEW.id,v_type,v_action,v_correlation,v_request) IS NOT TRUE
    OR NOT EXISTS(SELECT 1 FROM public.managed_finance_events e WHERE e.entity_type=v_type AND e.entity_id=NEW.id
      AND e.organization_id=NEW.organization_id AND e.revision=NEW.revision AND e.actor_identity_id=v_actor
      AND e.receipt_id=v_receipt AND e.correlation_id=v_correlation AND e.action=v_action AND e.snapshot=to_jsonb(NEW)
      AND e.occurred_at=CASE WHEN TG_OP='INSERT' THEN NEW.prepared_at ELSE NEW.decided_at END)
    OR NOT EXISTS(SELECT 1 FROM public.security_command_receipts r WHERE r.id=v_receipt
      AND r.created_at=CASE WHEN TG_OP='INSERT' THEN NEW.prepared_at ELSE NEW.decided_at END) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance source receipt or history denied'; END IF;
  IF TG_OP='UPDATE' AND NEW.state='approved' AND TG_TABLE_NAME='finance_agreement_versions' THEN
    IF NOT EXISTS(SELECT 1 FROM public.finance_agreement_applicability app JOIN public.finance_agreement_series s
      ON s.id=app.agreement_id AND s.organization_id=app.organization_id
      WHERE app.version_id=NEW.id AND app.agreement_id=NEW.agreement_id AND app.organization_id=NEW.organization_id
        AND app.approval_receipt_id=NEW.decision_receipt_id AND app.series_revision=NEW.expected_series_revision+1
        AND s.revision=app.series_revision) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed agreement publication missing'; END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION mmhr_private.r7_managed_source_version_guard(),mmhr_private.r7_managed_source_version_commit_guard()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE TRIGGER finance_agreement_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.finance_agreement_versions
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_source_version_guard();
CREATE TRIGGER finance_contract_facts_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.finance_contract_facts_versions
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_source_version_guard();
CREATE CONSTRAINT TRIGGER finance_agreement_versions_commit_guard AFTER INSERT OR UPDATE ON public.finance_agreement_versions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_source_version_commit_guard();
CREATE CONSTRAINT TRIGGER finance_contract_facts_versions_commit_guard AFTER INSERT OR UPDATE ON public.finance_contract_facts_versions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_source_version_commit_guard();

--> statement-breakpoint
-- Scratch-only draft. Current authorization precedes every new association.
CREATE FUNCTION mmhr_private.r7_managed_eligibility_observation(p_org uuid,p_contract uuid,p_handoff uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT jsonb_build_object('organizationId',p_org,'contractId',p.contract_id,'handoffId',p.handoff_id,
    'dealId',d.id,'vendorOrganizationId',h.vendor_organization_id,'signedAt',p.signed_at,
    'agreementOrganizationId',a.organization_id,'agreementId',a.agreement_id,'agreementVersionId',a.id,
    'applicabilityId',app.id,'effectiveFrom',app.cutover_at,
    'effectiveEnd',least(a.stated_effective_end,next_app.cutover_at),'agreement',to_jsonb(a))
  FROM public.portal_contract_handoff_details p JOIN public.contract_handoffs h ON h.id=p.handoff_id AND h.organization_id=p.organization_id
    JOIN public.deals d ON d.id=h.deal_id AND d.organization_id=h.organization_id AND d.contract_id=p.contract_id
    JOIN public.finance_agreement_series series ON series.vendor_organization_id=h.vendor_organization_id AND series.business_scope='commission'
    JOIN public.finance_agreement_versions a ON a.agreement_id=series.id AND a.organization_id=series.organization_id AND a.state='approved'
    JOIN public.finance_agreement_applicability app ON app.version_id=a.id AND app.agreement_id=a.agreement_id AND app.organization_id=a.organization_id
    LEFT JOIN LATERAL (SELECT later.cutover_at FROM public.finance_agreement_applicability later
      WHERE later.agreement_id=app.agreement_id AND later.cutover_at>app.cutover_at ORDER BY later.cutover_at LIMIT 1) next_app ON true
  WHERE p.organization_id=p_org AND p.contract_id=p_contract AND p.handoff_id=p_handoff
    AND app.cutover_at<=p.signed_at AND (least(a.stated_effective_end,next_app.cutover_at) IS NULL
      OR p.signed_at<least(a.stated_effective_end,next_app.cutover_at))
    AND mmhr_private.r7_finance_document_actor(p_org) IS NOT NULL
    AND mmhr_private.r7_finance_document_actor(a.organization_id) IS NOT NULL
    AND mmhr_private.r7_finance_document_source_valid(p_org,jsonb_build_object('sourceClass','signed_contract',
      'vendorOrganizationId',h.vendor_organization_id,'contractId',p.contract_id,'handoffId',p.handoff_id,'dealId',d.id))
$$;

CREATE FUNCTION mmhr_private.r7_managed_series_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
BEGIN
  IF TG_OP NOT IN ('INSERT','UPDATE') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed agreement series is immutable'; END IF;
  PERFORM mmhr_private.r1_lock_security();
  IF mmhr_private.r7_finance_document_actor(NEW.organization_id) IS NULL OR NOT EXISTS(SELECT 1 FROM public.orgs o
    WHERE o.id=NEW.organization_id AND o.type='internal' AND o.status='active' AND NOT o.migration_review_required) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed agreement series denied'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.revision<>0 OR NEW.created_by_identity_id IS DISTINCT FROM mmhr_private.r7_finance_document_actor(NEW.organization_id)
      OR NEW.created_at>clock_timestamp() OR NEW.created_at<clock_timestamp()-interval '10 seconds' THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed agreement series creation denied'; END IF;
  ELSIF NEW.revision<>OLD.revision+1 OR (to_jsonb(NEW)-'revision') IS DISTINCT FROM (to_jsonb(OLD)-'revision') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed agreement series revision denied'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mmhr_private.r7_managed_series_commit_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
BEGIN
  IF NEW.revision=0 THEN
    IF NOT EXISTS(SELECT 1 FROM public.finance_agreement_versions a WHERE a.agreement_id=NEW.id AND a.organization_id=NEW.organization_id
      AND a.version=1 AND a.prepared_by_identity_id=NEW.created_by_identity_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed agreement series preparation missing'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.finance_agreement_applicability app JOIN public.finance_agreement_versions a
    ON a.id=app.version_id AND a.organization_id=app.organization_id AND a.agreement_id=app.agreement_id
    WHERE app.agreement_id=NEW.id AND app.organization_id=NEW.organization_id AND app.series_revision=NEW.revision
      AND a.state='approved' AND a.expected_series_revision=NEW.revision-1
      AND a.decided_by_identity_id=mmhr_private.r7_finance_document_actor(NEW.organization_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed agreement series approval missing'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mmhr_private.r7_managed_applicability_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_version public.finance_agreement_versions%ROWTYPE; v_previous public.finance_agreement_applicability%ROWTYPE;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed applicability is immutable'; END IF;
  PERFORM mmhr_private.r1_lock_security();
  SELECT * INTO v_version FROM public.finance_agreement_versions a WHERE a.id=NEW.version_id AND a.organization_id=NEW.organization_id
    AND a.agreement_id=NEW.agreement_id AND a.state='approved';
  IF NOT FOUND OR v_version.decided_by_identity_id IS DISTINCT FROM mmhr_private.r7_finance_document_actor(NEW.organization_id)
    OR NEW.approval_receipt_id IS DISTINCT FROM v_version.decision_receipt_id OR NEW.cutover_at IS DISTINCT FROM v_version.effective_from
    OR NEW.predecessor_version_id IS DISTINCT FROM v_version.predecessor_version_id OR NEW.series_revision<>v_version.expected_series_revision+1
    OR NEW.recorded_at IS DISTINCT FROM v_version.decided_at THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed applicability approval denied'; END IF;
  SELECT * INTO v_previous FROM public.finance_agreement_applicability app WHERE app.agreement_id=NEW.agreement_id ORDER BY app.series_revision DESC LIMIT 1;
  IF NEW.series_revision=1 THEN
    IF FOUND OR NEW.predecessor_version_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed applicability origin denied'; END IF;
  ELSIF NOT FOUND OR NEW.series_revision<>v_previous.series_revision+1 OR NEW.predecessor_version_id<>v_previous.version_id
    OR NEW.cutover_at<=v_previous.cutover_at THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed applicability lineage denied'; END IF;
  IF NEW.series_revision>1 AND (NEW.cutover_at<v_version.decided_at OR EXISTS(
    SELECT 1 FROM public.managed_commission_sources source JOIN public.commission_events event
      ON event.id=source.commission_event_id AND event.organization_id=source.organization_id
    WHERE source.agreement_id=NEW.agreement_id AND event.signed_at>=NEW.cutover_at)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed applicability retroactive cutover denied'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mmhr_private.r7_managed_source_binding_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_observation jsonb; v_event public.commission_events%ROWTYPE; v_agreement public.finance_agreement_versions%ROWTYPE; v_request jsonb;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed commission source is immutable'; END IF;
  PERFORM mmhr_private.r1_lock_security();
  v_observation:=mmhr_private.r7_managed_eligibility_observation(NEW.organization_id,NEW.contract_id,NEW.handoff_id);
  SELECT * INTO v_event FROM public.commission_events e WHERE e.id=NEW.commission_event_id AND e.organization_id=NEW.organization_id;
  SELECT * INTO v_agreement FROM public.finance_agreement_versions a WHERE a.id=NEW.agreement_version_id AND a.organization_id=NEW.agreement_organization_id;
  v_request:=jsonb_build_object('organizationId',NEW.organization_id,'action','resolve_eligibility','contractId',NEW.contract_id,
    'handoffId',NEW.handoff_id,'reason',NEW.creation_request->'reason');
  IF v_observation IS NULL OR v_event.id IS NULL OR v_agreement.id IS NULL OR v_event.source_mode<>'managed'
    OR v_event.event_revision<>1 OR v_event.calculation_revision<>0 OR v_event.state<>'pending_review' OR v_event.commission_amount_minor_units IS NOT NULL
    OR v_event.contract_value_minor_units IS NOT NULL OR v_event.contract_currency IS NOT NULL
    OR v_event.contract_id<>NEW.contract_id OR v_event.deal_id IS DISTINCT FROM (v_observation->>'dealId')::uuid
    OR v_event.vendor_organization_id IS DISTINCT FROM (v_observation->>'vendorOrganizationId')::uuid
    OR v_event.signed_at IS DISTINCT FROM (v_observation->>'signedAt')::timestamptz
    OR NEW.source_snapshot IS DISTINCT FROM v_observation OR NEW.source_digest IS DISTINCT FROM mmhr_private.r7_managed_digest(v_observation)
    OR NEW.agreement_id IS DISTINCT FROM (v_observation->>'agreementId')::uuid
    OR NEW.agreement_organization_id IS DISTINCT FROM (v_observation->>'agreementOrganizationId')::uuid
    OR NEW.agreement_version_id IS DISTINCT FROM (v_observation->>'agreementVersionId')::uuid
    OR NEW.applicability_id IS DISTINCT FROM (v_observation->>'applicabilityId')::uuid
    OR NEW.resolved_effective_from IS DISTINCT FROM (v_observation->>'effectiveFrom')::timestamptz
    OR NEW.resolved_effective_end IS DISTINCT FROM (v_observation->>'effectiveEnd')::timestamptz
    OR NEW.created_by_identity_id IS DISTINCT FROM mmhr_private.r7_finance_document_actor(NEW.organization_id)
    OR NEW.creation_request IS DISTINCT FROM v_request OR NEW.creation_request_digest IS DISTINCT FROM mmhr_private.r7_managed_digest(v_request)
    OR jsonb_typeof(NEW.creation_request->'reason') IS DISTINCT FROM 'string'
    OR mmhr_private.r1_security_reason_is_safe(NEW.creation_request->>'reason') IS NOT TRUE
    OR length(btrim(NEW.creation_request->>'reason')) NOT BETWEEN 1 AND 500
    OR v_event.created_at IS DISTINCT FROM NEW.created_at
    OR v_event.idempotency_key IS DISTINCT FROM (SELECT r.idempotency_key FROM public.security_command_receipts r WHERE r.id=NEW.receipt_id)
    OR NEW.created_at>clock_timestamp() OR NEW.created_at<clock_timestamp()-interval '10 seconds'
    OR NEW.structure_id IS DISTINCT FROM v_event.structure_id OR v_event.currency IS DISTINCT FROM v_agreement.currency THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed commission eligibility binding denied'; END IF;
  IF v_agreement.calculation_type='unsupported' THEN
    IF NEW.structure_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Unsupported managed rule has no structure'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.commission_structures s WHERE s.id=NEW.structure_id AND s.organization_id=NEW.organization_id
    AND s.vendor_organization_id=v_event.vendor_organization_id AND s.source_agreement_id=v_agreement.id
    AND s.calculation_type=v_agreement.calculation_type AND s.currency=v_agreement.currency
    AND s.rate_basis_points IS NOT DISTINCT FROM v_agreement.rate_basis_points
    AND s.flat_amount_minor_units IS NOT DISTINCT FROM v_agreement.flat_amount_minor_units
    AND s.revision=1 AND s.created_by_identity_id=NEW.created_by_identity_id AND s.created_at=NEW.created_at
    AND s.effective_from=NEW.resolved_effective_from AND s.effective_to IS NOT DISTINCT FROM NEW.resolved_effective_end) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed commission supported structure denied'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mmhr_private.r7_managed_source_binding_commit_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
BEGIN
  IF mmhr_private.r7_managed_receipt_ok(NEW.receipt_id,NEW.created_by_identity_id,NEW.organization_id,NEW.commission_event_id,
    'commission_event','resolve_eligibility',NEW.creation_correlation_id,NEW.creation_request) IS NOT TRUE
    OR NOT EXISTS(SELECT 1 FROM public.managed_finance_events e WHERE e.entity_type='commission_event' AND e.entity_id=NEW.commission_event_id
      AND e.organization_id=NEW.organization_id AND e.revision=1 AND e.action='resolve_eligibility'
      AND e.actor_identity_id=NEW.created_by_identity_id AND e.receipt_id=NEW.receipt_id
      AND e.correlation_id=NEW.creation_correlation_id AND e.snapshot=to_jsonb(NEW) AND e.occurred_at=NEW.created_at)
    OR NOT EXISTS(SELECT 1 FROM public.security_command_receipts r WHERE r.id=NEW.receipt_id AND r.created_at=NEW.created_at) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed commission eligibility receipt or history denied'; END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION mmhr_private.r7_managed_eligibility_observation(uuid,uuid,uuid),
  mmhr_private.r7_managed_series_guard(),mmhr_private.r7_managed_series_commit_guard(),
  mmhr_private.r7_managed_applicability_guard(),mmhr_private.r7_managed_source_binding_guard(),mmhr_private.r7_managed_source_binding_commit_guard()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE TRIGGER finance_agreement_series_guard BEFORE INSERT OR UPDATE OR DELETE ON public.finance_agreement_series FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_series_guard();
CREATE CONSTRAINT TRIGGER finance_agreement_series_commit_guard AFTER INSERT OR UPDATE ON public.finance_agreement_series DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_series_commit_guard();
CREATE TRIGGER finance_agreement_applicability_guard BEFORE INSERT OR UPDATE OR DELETE ON public.finance_agreement_applicability FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_applicability_guard();
CREATE TRIGGER managed_commission_sources_guard BEFORE INSERT OR UPDATE OR DELETE ON public.managed_commission_sources FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_source_binding_guard();
CREATE CONSTRAINT TRIGGER managed_commission_sources_commit_guard AFTER INSERT ON public.managed_commission_sources DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_source_binding_commit_guard();

--> statement-breakpoint
-- Scratch-only draft. Preparation and rejection never mutate canonical money.
CREATE FUNCTION mmhr_private.r7_managed_calculation_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_actor uuid; v_event public.commission_events%ROWTYPE; v_observation jsonb; v_result jsonb;
  v_expected jsonb; v_action text; v_latest integer; v_rejection boolean;
BEGIN
  IF TG_OP NOT IN ('INSERT','UPDATE') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed calculation is immutable'; END IF;
  PERFORM mmhr_private.r1_lock_security();
  v_actor:=mmhr_private.r7_finance_document_actor(NEW.organization_id);
  SELECT * INTO v_event FROM public.commission_events e WHERE e.id=NEW.commission_event_id AND e.organization_id=NEW.organization_id FOR UPDATE;
  v_rejection:=TG_OP='UPDATE' AND NEW.state='rejected';
  v_observation:=mmhr_private.r7_managed_calculation_observation(NEW.commission_event_id,NEW.facts_version_id);
  v_result:=mmhr_private.r7_managed_calculation_result(v_observation);
  IF mmhr_private.r1_security_reason_is_safe(NEW.prepare_request->>'reason') IS NOT TRUE
    OR (TG_OP='UPDATE' AND mmhr_private.r1_security_reason_is_safe(NEW.decision_reason) IS NOT TRUE)
    OR (NEW.currency IS NOT NULL AND mmhr_private.r7_managed_currency(to_jsonb(NEW.currency)) IS NOT TRUE)
    OR v_actor IS NULL OR v_event.id IS NULL OR v_event.source_mode<>'managed' OR v_event.state<>'pending_review'
    OR NEW.contract_id<>v_event.contract_id OR NEW.expected_event_revision<>v_event.event_revision
    OR (NOT v_rejection AND (v_observation IS NULL OR v_result IS NULL OR NEW.input_snapshot IS DISTINCT FROM v_observation
    OR NEW.result_snapshot IS DISTINCT FROM v_result OR NEW.source_digest IS DISTINCT FROM mmhr_private.r7_managed_digest(v_observation)
    OR NEW.amount_minor_units IS DISTINCT FROM (v_result->'commission'->>'amountMinorUnits')::bigint
    OR NEW.currency IS DISTINCT FROM v_result->'commission'->>'currency'
    OR NOT EXISTS(SELECT 1 FROM public.finance_agreement_versions a
      JOIN public.managed_commission_sources s ON s.agreement_version_id=a.id AND s.agreement_organization_id=a.organization_id
      JOIN public.finance_document_sources original ON original.version_id=a.source_version_id AND original.document_id=a.source_document_id AND original.organization_id=a.organization_id
      WHERE s.commission_event_id=NEW.commission_event_id AND mmhr_private.r7_managed_original_ok(a.organization_id,
        a.source_document_id,a.source_version_id,a.source_sha256,original.source_snapshot))
    OR NOT EXISTS(SELECT 1 FROM public.finance_contract_facts_versions f
      JOIN public.finance_document_sources original ON original.version_id=f.source_version_id AND original.document_id=f.source_document_id AND original.organization_id=f.organization_id
      WHERE f.id=NEW.facts_version_id AND f.organization_id=NEW.organization_id AND f.contract_id=v_event.contract_id
        AND mmhr_private.r7_managed_original_ok(f.organization_id,f.source_document_id,f.source_version_id,f.source_sha256,original.source_snapshot))))
    OR NOT EXISTS(SELECT 1 FROM public.managed_commission_sources s WHERE s.commission_event_id=NEW.commission_event_id
      AND s.organization_id=NEW.organization_id AND mmhr_private.r7_finance_document_actor(s.agreement_organization_id) IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed calculation current source denied'; END IF;
  v_expected:=jsonb_build_object('organizationId',NEW.organization_id,'action','prepare_calculation','commissionEventId',NEW.commission_event_id,
    'calculationId',NEW.id,'expectedEventRevision',NEW.expected_event_revision,'expectedSourceDigest',NEW.source_digest,'reason',NEW.prepare_request->'reason');
  IF NEW.prepare_request IS DISTINCT FROM v_expected OR NEW.prepare_request_digest IS DISTINCT FROM mmhr_private.r7_managed_digest(v_expected)
    OR jsonb_typeof(NEW.prepare_request->'reason') IS DISTINCT FROM 'string' OR length(btrim(NEW.prepare_request->>'reason')) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed calculation preparation request denied'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT coalesce(max(c.calculation_revision),0) INTO v_latest FROM public.managed_commission_calculations c WHERE c.commission_event_id=NEW.commission_event_id;
    IF NEW.state<>'pending' OR NEW.revision<>1 OR NEW.calculation_revision<>v_latest+1
      OR NEW.prepared_by_identity_id<>v_actor OR NEW.prepared_at>clock_timestamp() OR NEW.prepared_at<clock_timestamp()-interval '10 seconds' THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed calculation preparation denied'; END IF;
  ELSE
    IF OLD.state<>'pending' OR OLD.revision<>1 OR NEW.state NOT IN ('approved','rejected') OR NEW.revision<>2
      OR NEW.decided_by_identity_id IS DISTINCT FROM v_actor OR NEW.decided_by_identity_id=OLD.prepared_by_identity_id
      OR length(btrim(NEW.decision_reason)) NOT BETWEEN 1 AND 2000 OR length(btrim(NEW.review_reference)) NOT BETWEEN 1 AND 500
      OR NEW.review_reference ~ '[\x01-\x1f\x7f]'
      OR NEW.decided_at>clock_timestamp() OR NEW.decided_at<clock_timestamp()-interval '10 seconds'
      OR (NEW.state='approved' AND v_result->>'status'<>'calculated')
      OR (to_jsonb(NEW)-ARRAY['state','revision','decided_by_identity_id','decided_at','decision_reason','review_reference',
        'decision_receipt_id','decision_request','decision_request_digest','decision_correlation_id'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','decided_by_identity_id','decided_at','decision_reason','review_reference',
        'decision_receipt_id','decision_request','decision_request_digest','decision_correlation_id']) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed calculation decision denied'; END IF;
    v_action:=CASE WHEN NEW.state='approved' THEN 'approve_calculation' ELSE 'reject_calculation' END;
    v_expected:=jsonb_build_object('organizationId',NEW.organization_id,'action',v_action,'commissionEventId',NEW.commission_event_id,
      'calculationId',NEW.id,'expectedEventRevision',v_event.event_revision,'expectedCalculationRevision',1,
      'expectedSourceDigest',OLD.source_digest,'reason',NEW.decision_reason,'reviewReference',NEW.review_reference);
    IF NEW.decision_request IS DISTINCT FROM v_expected OR NEW.decision_request_digest IS DISTINCT FROM mmhr_private.r7_managed_digest(v_expected) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed calculation decision request denied'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mmhr_private.r7_managed_calculation_commit_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_action text; v_actor uuid; v_receipt uuid; v_correlation uuid; v_request jsonb;
BEGIN
  v_action:=CASE WHEN TG_OP='INSERT' THEN 'prepare_calculation' WHEN NEW.state='approved' THEN 'approve_calculation' ELSE 'reject_calculation' END;
  v_actor:=CASE WHEN TG_OP='INSERT' THEN NEW.prepared_by_identity_id ELSE NEW.decided_by_identity_id END;
  v_receipt:=CASE WHEN TG_OP='INSERT' THEN NEW.prepare_receipt_id ELSE NEW.decision_receipt_id END;
  v_correlation:=CASE WHEN TG_OP='INSERT' THEN NEW.correlation_id ELSE NEW.decision_correlation_id END;
  v_request:=CASE WHEN TG_OP='INSERT' THEN NEW.prepare_request ELSE NEW.decision_request END;
  IF mmhr_private.r7_managed_receipt_ok(v_receipt,v_actor,NEW.organization_id,NEW.id,'managed_commission_calculation',v_action,v_correlation,v_request) IS NOT TRUE
    OR NOT EXISTS(SELECT 1 FROM public.managed_finance_events e WHERE e.entity_type='managed_commission_calculation' AND e.entity_id=NEW.id
      AND e.organization_id=NEW.organization_id AND e.revision=NEW.revision AND e.actor_identity_id=v_actor AND e.receipt_id=v_receipt
      AND e.correlation_id=v_correlation AND e.action=v_action AND e.snapshot=to_jsonb(NEW)
      AND e.occurred_at=CASE WHEN TG_OP='INSERT' THEN NEW.prepared_at ELSE NEW.decided_at END)
    OR NOT EXISTS(SELECT 1 FROM public.security_command_receipts r WHERE r.id=v_receipt
      AND r.created_at=CASE WHEN TG_OP='INSERT' THEN NEW.prepared_at ELSE NEW.decided_at END) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed calculation receipt or history denied'; END IF;
  IF TG_OP='UPDATE' AND NEW.state='approved' AND NOT EXISTS(SELECT 1 FROM public.commission_events e
    WHERE e.id=NEW.commission_event_id AND e.organization_id=NEW.organization_id AND e.source_mode='managed'
      AND e.state='approved' AND e.event_revision=NEW.expected_event_revision+1 AND e.calculation_revision=NEW.calculation_revision
      AND e.commission_amount_minor_units=NEW.amount_minor_units AND e.currency=NEW.currency) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed calculation publication missing'; END IF;
  IF TG_OP='UPDATE' AND NEW.state='rejected' AND NOT EXISTS(SELECT 1 FROM public.commission_events e
    WHERE e.id=NEW.commission_event_id AND e.organization_id=NEW.organization_id AND e.state='pending_review'
      AND e.event_revision=NEW.expected_event_revision) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed calculation rejection mutated event'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mmhr_private.r7_managed_canonical_event_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_actor uuid; v_calculation public.managed_commission_calculations%ROWTYPE; v_facts public.finance_contract_facts_versions%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.source_mode='managed' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed event is immutable'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND NEW.source_mode IS DISTINCT FROM OLD.source_mode THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Event source mode is immutable'; END IF;
  IF NEW.source_mode='legacy' THEN
    IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.portal_contract_handoff_details p
      WHERE p.organization_id=NEW.organization_id AND p.contract_id=NEW.contract_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Portal contract requires managed eligibility'; END IF;
    IF TG_OP='UPDATE' AND (NEW.event_revision IS DISTINCT FROM OLD.event_revision OR NEW.contract_currency IS DISTINCT FROM OLD.contract_currency) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Legacy event managed fields denied'; END IF;
    RETURN NEW;
  END IF;
  PERFORM mmhr_private.r1_lock_security();
  v_actor:=mmhr_private.r7_finance_document_actor(NEW.organization_id);
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed event authority denied'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'pending_review' OR NEW.event_revision<>1 OR NEW.calculation_revision<>0
      OR NEW.commission_amount_minor_units IS NOT NULL OR NEW.contract_value_minor_units IS NOT NULL OR NEW.contract_currency IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed event initial state denied'; END IF;
  ELSE
    SELECT * INTO v_calculation FROM public.managed_commission_calculations c WHERE c.commission_event_id=NEW.id AND c.organization_id=NEW.organization_id
      AND c.state='approved' AND c.expected_event_revision=OLD.event_revision AND c.calculation_revision=NEW.calculation_revision;
    SELECT * INTO v_facts FROM public.finance_contract_facts_versions f WHERE f.id=v_calculation.facts_version_id AND f.organization_id=NEW.organization_id AND f.contract_id=NEW.contract_id;
    IF OLD.state<>'pending_review' OR NEW.state<>'approved' OR NEW.event_revision<>OLD.event_revision+1
      OR v_calculation.id IS NULL OR v_facts.id IS NULL OR v_calculation.decided_by_identity_id IS DISTINCT FROM v_actor
      OR NEW.commission_amount_minor_units IS DISTINCT FROM v_calculation.amount_minor_units OR NEW.currency IS DISTINCT FROM v_calculation.currency
      OR NEW.contract_value_minor_units IS DISTINCT FROM v_facts.contract_value_minor_units OR NEW.contract_currency IS DISTINCT FROM v_facts.contract_currency
      OR (to_jsonb(NEW)-ARRAY['state','event_revision','calculation_revision','commission_amount_minor_units','currency','contract_value_minor_units','contract_currency'])
        IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','event_revision','calculation_revision','commission_amount_minor_units','currency','contract_value_minor_units','contract_currency']) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed event publication denied'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mmhr_private.r7_managed_canonical_event_commit_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
BEGIN
  IF NEW.source_mode='managed' AND NOT EXISTS(SELECT 1 FROM public.managed_commission_sources s
    WHERE s.commission_event_id=NEW.id AND s.organization_id=NEW.organization_id AND s.contract_id=NEW.contract_id AND s.structure_id IS NOT DISTINCT FROM NEW.structure_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed event immutable eligibility missing'; END IF;
  IF TG_OP='UPDATE' AND NEW.source_mode='managed' AND NOT EXISTS(SELECT 1 FROM public.commission_event_history h
    JOIN public.managed_commission_calculations c ON c.commission_event_id=NEW.id AND c.organization_id=NEW.organization_id
      AND c.state='approved' AND c.calculation_revision=NEW.calculation_revision
    WHERE h.commission_event_id=NEW.id AND h.organization_id=NEW.organization_id AND h.event_revision=NEW.event_revision
      AND h.from_state=OLD.state AND h.to_state=NEW.state AND h.actor_identity_id=c.decided_by_identity_id
      AND h.correlation_id=c.decision_correlation_id AND h.occurred_at=c.decided_at AND h.reason=c.decision_reason) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed event publication history missing'; END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION mmhr_private.r7_managed_calculation_guard(),mmhr_private.r7_managed_calculation_commit_guard(),
  mmhr_private.r7_managed_canonical_event_guard(),mmhr_private.r7_managed_canonical_event_commit_guard()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE TRIGGER managed_commission_calculations_guard BEFORE INSERT OR UPDATE OR DELETE ON public.managed_commission_calculations FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_calculation_guard();
CREATE CONSTRAINT TRIGGER managed_commission_calculations_commit_guard AFTER INSERT OR UPDATE ON public.managed_commission_calculations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_calculation_commit_guard();
CREATE TRIGGER commission_events_managed_guard BEFORE INSERT OR UPDATE OR DELETE ON public.commission_events FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_canonical_event_guard();
CREATE CONSTRAINT TRIGGER commission_events_managed_commit_guard AFTER INSERT OR UPDATE ON public.commission_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_canonical_event_commit_guard();

--> statement-breakpoint
-- Scratch-only draft. No public role can read business snapshots directly.
CREATE FUNCTION mmhr_private.r7_managed_history_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_current jsonb; v_action text; v_request jsonb; v_receipt uuid; v_actor uuid; v_correlation uuid;
  v_time timestamptz; v_decision_keys text[]:=ARRAY['state','revision','decided_by_identity_id','decided_at','decision_reason','review_reference',
    'reviewed_access_id','decision_receipt_id','decision_request','decision_request_digest','decision_correlation_id'];
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance history is immutable'; END IF;
  CASE NEW.entity_type
    WHEN 'finance_agreement_version' THEN SELECT to_jsonb(a) INTO v_current FROM public.finance_agreement_versions a WHERE a.id=NEW.entity_id AND a.organization_id=NEW.organization_id;
    WHEN 'finance_contract_facts_version' THEN SELECT to_jsonb(f) INTO v_current FROM public.finance_contract_facts_versions f WHERE f.id=NEW.entity_id AND f.organization_id=NEW.organization_id;
    WHEN 'managed_commission_calculation' THEN SELECT to_jsonb(c) INTO v_current FROM public.managed_commission_calculations c WHERE c.id=NEW.entity_id AND c.organization_id=NEW.organization_id;
    WHEN 'commission_event' THEN SELECT to_jsonb(s) INTO v_current FROM public.managed_commission_sources s WHERE s.commission_event_id=NEW.entity_id AND s.organization_id=NEW.organization_id;
    ELSE RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance history type denied';
  END CASE;
  IF v_current IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance history source missing'; END IF;
  IF NEW.entity_type='commission_event' THEN
    v_action:='resolve_eligibility';v_request:=v_current->'creation_request';v_receipt:=(v_current->>'receipt_id')::uuid;
    v_actor:=(v_current->>'created_by_identity_id')::uuid;v_correlation:=(v_current->>'creation_correlation_id')::uuid;
    v_time:=(v_current->>'created_at')::timestamptz;
    IF NEW.revision<>1 OR NEW.snapshot IS DISTINCT FROM v_current THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed eligibility history denied'; END IF;
  ELSIF NEW.revision=1 THEN
    v_action:='prepare_'||CASE NEW.entity_type WHEN 'finance_agreement_version' THEN 'agreement' WHEN 'finance_contract_facts_version' THEN 'contract_facts' ELSE 'calculation' END;
    v_request:=v_current->'prepare_request';v_receipt:=(v_current->>'prepare_receipt_id')::uuid;
    v_actor:=(v_current->>'prepared_by_identity_id')::uuid;v_correlation:=(v_current->>'correlation_id')::uuid;
    v_time:=(v_current->>'prepared_at')::timestamptz;
    IF (NEW.snapshot-v_decision_keys) IS DISTINCT FROM (v_current-v_decision_keys)
      OR NEW.snapshot->>'state' IS DISTINCT FROM 'pending' OR NEW.snapshot->'revision' IS DISTINCT FROM '1'::jsonb
      OR EXISTS(SELECT 1 FROM unnest(v_decision_keys) key_name WHERE key_name NOT IN ('state','revision')
        AND NEW.snapshot->key_name IS DISTINCT FROM 'null'::jsonb
        AND NOT (NEW.entity_type='managed_commission_calculation' AND key_name='reviewed_access_id' AND NOT NEW.snapshot ? key_name)) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed preparation history denied'; END IF;
  ELSE
    v_action:=CASE v_current->>'state' WHEN 'approved' THEN 'approve_' WHEN 'rejected' THEN 'reject_' ELSE NULL END||
      CASE NEW.entity_type WHEN 'finance_agreement_version' THEN 'agreement' WHEN 'finance_contract_facts_version' THEN 'contract_facts' ELSE 'calculation' END;
    v_request:=v_current->'decision_request';v_receipt:=(v_current->>'decision_receipt_id')::uuid;
    v_actor:=(v_current->>'decided_by_identity_id')::uuid;v_correlation:=(v_current->>'decision_correlation_id')::uuid;
    v_time:=(v_current->>'decided_at')::timestamptz;
    IF NEW.revision<>2 OR NEW.snapshot IS DISTINCT FROM v_current THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed decision history denied'; END IF;
  END IF;
  IF NEW.action IS DISTINCT FROM v_action OR NEW.actor_identity_id IS DISTINCT FROM v_actor OR NEW.receipt_id IS DISTINCT FROM v_receipt
    OR NEW.correlation_id IS DISTINCT FROM v_correlation OR NEW.occurred_at IS DISTINCT FROM v_time
    OR NOT EXISTS(SELECT 1 FROM public.security_command_receipts r WHERE r.id=v_receipt AND r.created_at=v_time)
    OR v_actor IS DISTINCT FROM mmhr_private.r7_finance_document_actor(NEW.organization_id)
    OR mmhr_private.r7_managed_receipt_ok(v_receipt,v_actor,NEW.organization_id,NEW.entity_id,NEW.entity_type,v_action,v_correlation,v_request) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance history receipt denied'; END IF;
  RETURN NEW;
END $$;

-- Current receipts return before DML in the existing RPCs. The guards therefore
-- preserve proven historical replay and deny new managed legacy writes.
CREATE FUNCTION mmhr_private.r7_managed_legacy_financial_path_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_rows jsonb[]; v_row jsonb; v_ids jsonb; v_id text;
BEGIN
  v_rows:=CASE TG_OP WHEN 'INSERT' THEN ARRAY[to_jsonb(NEW)] WHEN 'DELETE' THEN ARRAY[to_jsonb(OLD)] ELSE ARRAY[to_jsonb(OLD),to_jsonb(NEW)] END;
  FOREACH v_row IN ARRAY v_rows LOOP
    v_ids:=CASE TG_TABLE_NAME WHEN 'finance_handoffs' THEN v_row->'source_event_ids'
      WHEN 'finance_reconciliation_reports' THEN (SELECT coalesce(jsonb_agg(item->'commissionEventId'),'[]'::jsonb) FROM jsonb_array_elements(v_row->'report_rows') item)
      ELSE jsonb_build_array(v_row->>'commission_event_id') END;
    FOR v_id IN SELECT value FROM jsonb_array_elements_text(v_ids) LOOP
      IF EXISTS(SELECT 1 FROM public.commission_events e WHERE e.id=v_id::uuid AND e.source_mode='managed') THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed downstream finance workflow is not enabled'; END IF;
    END LOOP;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mmhr_private.r7_managed_structure_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.managed_commission_sources s WHERE s.structure_id=OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed commission structure is immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;

CREATE FUNCTION mmhr_private.r7_managed_no_truncate()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance truncate denied'; END $$;

CREATE FUNCTION mmhr_private.r7_managed_shared_no_truncate()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.commission_events e WHERE e.source_mode='managed') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed shared finance truncate denied'; END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION mmhr_private.r7_managed_event_history_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_event uuid; v_org uuid; v_managed boolean;
BEGIN
  IF TG_OP<>'INSERT' THEN
    IF EXISTS(SELECT 1 FROM public.commission_events e WHERE e.id=OLD.commission_event_id AND e.source_mode='managed') THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed event history is immutable'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  v_event:=NEW.commission_event_id;v_org:=NEW.organization_id;
  SELECT e.source_mode='managed' INTO v_managed FROM public.commission_events e WHERE e.id=v_event AND e.organization_id=v_org;
  IF v_managed IS TRUE AND (TG_OP<>'INSERT' OR NOT EXISTS(SELECT 1 FROM public.commission_events e
    JOIN public.managed_commission_calculations c ON c.commission_event_id=e.id AND c.organization_id=e.organization_id
      AND c.state='approved' AND c.calculation_revision=e.calculation_revision
    WHERE e.id=v_event AND e.organization_id=v_org AND e.event_revision=NEW.event_revision
      AND NEW.from_state='pending_review' AND NEW.to_state='approved' AND e.state='approved'
      AND NEW.actor_identity_id=c.decided_by_identity_id AND NEW.actor_identity_id=mmhr_private.r7_finance_document_actor(v_org)
      AND NEW.correlation_id=c.decision_correlation_id AND NEW.occurred_at=c.decided_at AND NEW.reason=c.decision_reason)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed event history approval denied'; END IF;
  IF v_managed IS NOT TRUE AND NEW.event_revision IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Legacy event history managed revision denied'; END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION mmhr_private.r7_managed_history_guard(),mmhr_private.r7_managed_legacy_financial_path_guard(),
  mmhr_private.r7_managed_structure_guard(),mmhr_private.r7_managed_no_truncate(),mmhr_private.r7_managed_shared_no_truncate(),mmhr_private.r7_managed_event_history_guard()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE CONSTRAINT TRIGGER managed_finance_events_guard AFTER INSERT ON public.managed_finance_events DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_history_guard();
CREATE TRIGGER managed_finance_events_immutable BEFORE UPDATE OR DELETE ON public.managed_finance_events FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_no_truncate();
CREATE TRIGGER commission_structures_managed_immutable BEFORE UPDATE OR DELETE ON public.commission_structures FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_structure_guard();
CREATE TRIGGER commission_event_history_managed_guard BEFORE INSERT OR UPDATE OR DELETE ON public.commission_event_history FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_event_history_guard();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['finance_agreement_series','finance_agreement_versions','finance_agreement_applicability',
    'finance_contract_facts_versions','managed_commission_sources','managed_commission_calculations','managed_finance_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated,service_role,mmhr_worker,mmhr_document_worker USING(false) WITH CHECK(false)',
      table_name||'_deny_raw',table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker',table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r7_managed_no_truncate()',
      table_name||'_no_truncate',table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['commission_payments','finance_invoices','finance_disputes','finance_adjustments','finance_handoffs','finance_reconciliation_reports'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_legacy_financial_path_guard()',
      table_name||'_managed_path_guard',table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['commission_events','commission_structures','commission_payments','finance_invoices','finance_disputes',
    'finance_adjustments','finance_handoffs','finance_reconciliation_reports','commission_event_history'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r7_managed_shared_no_truncate()',
      table_name||'_managed_no_truncate',table_name);
  END LOOP;
END $$;

--> statement-breakpoint
-- Scratch-only draft. Install only after the canonical expansion, seven tables,
-- five reviewed evidence-guard chunks and the normalized input validators.
CREATE FUNCTION public.mmhr_managed_finance_command(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE
  v_action text; v_org uuid; v_actor uuid; v_time timestamptz; v_command text; v_type text;
  v_entity uuid; v_receipt jsonb; v_receipt_id uuid; v_snapshot jsonb; v_result jsonb;
  v_observation jsonb; v_source public.managed_commission_sources%ROWTYPE;
  v_agreement public.finance_agreement_versions%ROWTYPE; v_series public.finance_agreement_series%ROWTYPE;
  v_facts public.finance_contract_facts_versions%ROWTYPE; v_calculation public.managed_commission_calculations%ROWTYPE;
  v_event public.commission_events%ROWTYPE; v_portal public.portal_contract_handoff_details%ROWTYPE;
  v_source_document uuid; v_source_version uuid; v_structure uuid; v_version integer;
  v_history_revision integer; v_outcome text:='recorded';
  v_command_correlation_id uuid:=correlation_id;
BEGIN
  IF correlation_id IS NULL OR idempotency_key IS NULL
    OR mmhr_private.r7_managed_command_input_ok(payload) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid managed finance command input'; END IF;
  v_action:=payload->>'action'; v_org:=(payload->>'organizationId')::uuid;
  v_command:='r7.finance.managed.'||v_action;
  v_time:=mmhr_private.r1_lock_security(); v_actor:=mmhr_private.r7_finance_document_actor(v_org);
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance command authority denied'; END IF;

  -- Scope checks precede both exact receipt replay and new writes. They use the
  -- immutable stored associations, never a caller's actor or signing timestamp.
  IF v_action IN ('prepare_agreement','approve_agreement','reject_agreement') THEN
    v_type:='finance_agreement_version'; v_entity:=(payload->>'versionId')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.orgs o WHERE o.id=v_org AND o.type='internal') THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed agreement workspace denied'; END IF;
    SELECT * INTO v_series FROM public.finance_agreement_series s WHERE s.id=(payload->>'agreementId')::uuid AND s.organization_id=v_org FOR UPDATE;
    SELECT * INTO v_agreement FROM public.finance_agreement_versions a WHERE a.id=v_entity AND a.organization_id=v_org
      AND a.agreement_id=(payload->>'agreementId')::uuid FOR UPDATE;
    IF (v_action<>'prepare_agreement' AND v_agreement.id IS NULL)
      OR (v_action='prepare_agreement' AND v_series.id IS NOT NULL AND v_series.vendor_organization_id<>(payload->>'vendorOrganizationId')::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed agreement target denied'; END IF;
  ELSIF v_action IN ('prepare_contract_facts','approve_contract_facts','reject_contract_facts','resolve_eligibility') THEN
    v_type:=CASE WHEN v_action='resolve_eligibility' THEN 'commission_event' ELSE 'finance_contract_facts_version' END;
    SELECT * INTO v_portal FROM public.portal_contract_handoff_details p
      WHERE p.organization_id=v_org AND p.contract_id=(payload->>'contractId')::uuid
        AND (NOT payload ? 'handoffId' OR p.handoff_id=(payload->>'handoffId')::uuid) FOR UPDATE;
    IF v_portal.contract_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.contract_handoffs h
      JOIN public.deals d ON d.id=h.deal_id AND d.organization_id=h.organization_id AND d.contract_id=v_portal.contract_id
      WHERE h.id=v_portal.handoff_id AND h.organization_id=v_org AND mmhr_private.r7_finance_document_source_integrity(v_org,
        jsonb_build_object('sourceClass','signed_contract','vendorOrganizationId',h.vendor_organization_id,
          'contractId',v_portal.contract_id,'handoffId',h.id,'dealId',d.id))) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed signed contract target denied'; END IF;
    IF v_action='resolve_eligibility' THEN
      SELECT * INTO v_event FROM public.commission_events e WHERE e.organization_id=v_org AND e.contract_id=v_portal.contract_id FOR UPDATE;
      SELECT * INTO v_source FROM public.managed_commission_sources s WHERE s.organization_id=v_org
        AND s.commission_event_id=v_event.id AND s.contract_id=v_portal.contract_id AND s.handoff_id=v_portal.handoff_id;
      IF v_event.id IS NOT NULL AND (v_event.source_mode<>'managed' OR v_source.commission_event_id IS NULL) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed canonical eligibility denied'; END IF;
      IF v_event.id IS NOT NULL THEN
        IF mmhr_private.r7_finance_document_actor(v_source.agreement_organization_id) IS DISTINCT FROM v_actor THEN
          RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed agreement authority denied'; END IF;
        v_entity:=v_event.id;
      ELSE
        v_observation:=mmhr_private.r7_managed_eligibility_observation(v_org,v_portal.contract_id,v_portal.handoff_id);
        IF v_observation IS NULL OR mmhr_private.r7_finance_document_actor((v_observation->>'agreementOrganizationId')::uuid) IS DISTINCT FROM v_actor THEN
          RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed signing-time eligibility denied'; END IF;
      END IF;
    ELSE
      v_entity:=(payload->>'versionId')::uuid;
      SELECT * INTO v_facts FROM public.finance_contract_facts_versions f WHERE f.id=v_entity AND f.organization_id=v_org
        AND f.contract_id=v_portal.contract_id AND f.handoff_id=v_portal.handoff_id FOR UPDATE;
      IF v_action<>'prepare_contract_facts' AND v_facts.id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed contract facts target denied'; END IF;
    END IF;
  ELSE
    v_type:='managed_commission_calculation'; v_entity:=(payload->>'calculationId')::uuid;
    SELECT * INTO v_event FROM public.commission_events e WHERE e.id=(payload->>'commissionEventId')::uuid AND e.organization_id=v_org FOR UPDATE;
    SELECT * INTO v_source FROM public.managed_commission_sources s WHERE s.organization_id=v_org AND s.commission_event_id=v_event.id;
    SELECT * INTO v_calculation FROM public.managed_commission_calculations c WHERE c.id=v_entity AND c.organization_id=v_org
      AND c.commission_event_id=v_event.id AND c.contract_id=v_event.contract_id FOR UPDATE;
    IF v_event.id IS NULL OR v_event.source_mode<>'managed' OR v_source.commission_event_id IS NULL
      OR mmhr_private.r7_finance_document_actor(v_source.agreement_organization_id) IS DISTINCT FROM v_actor
      OR (v_action<>'prepare_calculation' AND v_calculation.id IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed calculation target denied'; END IF;
  END IF;

  v_history_revision:=CASE WHEN v_action IN ('approve_agreement','reject_agreement','approve_contract_facts','reject_contract_facts',
    'approve_calculation','reject_calculation') THEN 2 ELSE 1 END;
  v_receipt:=mmhr_private.r1_checked_receipt(v_actor,v_command,idempotency_key,payload);
  IF v_receipt IS NOT NULL THEN
    IF v_entity IS DISTINCT FROM (v_receipt->>'entity_id')::uuid
      OR mmhr_private.r7_managed_receipt_ok((v_receipt->>'receipt_id')::uuid,v_actor,v_org,v_entity,v_type,v_action,correlation_id,payload) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Managed finance retry identifiers differ'; END IF;
    IF v_action<>'resolve_eligibility' AND NOT EXISTS(SELECT 1 FROM public.managed_finance_events h
      WHERE h.organization_id=v_org AND h.entity_type=v_type AND h.entity_id=v_entity AND h.revision=v_history_revision
        AND h.receipt_id=(v_receipt->>'receipt_id')::uuid AND h.actor_identity_id=v_actor AND h.correlation_id=v_command_correlation_id AND h.action=v_action) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance original result denied'; END IF;
    v_outcome:='replayed';
  ELSIF v_action='resolve_eligibility' AND v_event.id IS NOT NULL THEN
    v_time:=clock_timestamp();
    -- A second authorized key records only its request receipt. Creation proof
    -- stays bound to the original signing-time source and its immutable history.
    v_receipt:=mmhr_private.r1_finish_security_command(v_actor,v_command,'finance.'||v_action,v_type,v_entity,v_org,
      payload->>'reason',correlation_id,idempotency_key,payload,NULL,jsonb_build_object('status','completed'),v_time);
    v_outcome:='replayed';
  ELSE
    v_time:=clock_timestamp();
    IF v_action='prepare_agreement' THEN
      IF v_agreement.id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed agreement version already exists'; END IF;
      IF v_series.id IS NULL THEN
        INSERT INTO public.finance_agreement_series(id,organization_id,vendor_organization_id,business_scope,revision,created_by_identity_id,created_at)
        VALUES((payload->>'agreementId')::uuid,v_org,(payload->>'vendorOrganizationId')::uuid,'commission',0,v_actor,v_time) RETURNING * INTO v_series;
      END IF;
      SELECT coalesce(max(a.version),0)+1 INTO v_version FROM public.finance_agreement_versions a WHERE a.agreement_id=v_series.id;
      v_source_document:=(payload->'source'->>'documentId')::uuid; v_source_version:=(payload->'source'->>'versionId')::uuid;
      v_observation:=mmhr_private.r7_managed_document_observation(v_org,v_source_document,v_source_version);
      v_receipt:=mmhr_private.r1_finish_security_command(v_actor,v_command,'finance.'||v_action,v_type,v_entity,v_org,
        payload->>'reason',correlation_id,idempotency_key,payload,NULL,jsonb_build_object('status','completed'),v_time);
      v_receipt_id:=(v_receipt->>'receipt_id')::uuid;
      INSERT INTO public.finance_agreement_versions(id,organization_id,agreement_id,version,predecessor_version_id,expected_series_revision,
        source_document_id,source_version_id,source_sha256,source_digest,source_observation,effective_from,stated_effective_end,replacement_source_reference,
        calculation_type,rate_basis_points,flat_amount_minor_units,currency,unsupported_source_term_reference,condition_references,
        state,revision,prepared_by_identity_id,prepared_at,correlation_id,prepare_receipt_id,prepare_request,prepare_request_digest)
      VALUES(v_entity,v_org,v_series.id,v_version,(payload->>'predecessorVersionId')::uuid,(payload->>'expectedSeriesRevision')::integer,
        v_source_document,v_source_version,payload->'source'->>'sha256',mmhr_private.r7_managed_digest(jsonb_build_object('request',payload,'document',v_observation)),
        v_observation,(payload->>'effectiveFrom')::timestamptz,(payload->>'statedEffectiveEnd')::timestamptz,payload->>'replacementSourceReference',
        payload->'rule'->>'kind',(payload->'rule'->>'rateBasisPoints')::integer,(payload->'rule'->>'amountMinorUnits')::bigint,
        payload->'rule'->>'currency',payload->'rule'->>'sourceTermReference',payload->'conditionReferences','pending',1,v_actor,v_time,
        correlation_id,v_receipt_id,payload,mmhr_private.r7_managed_digest(payload)) RETURNING to_jsonb(finance_agreement_versions.*) INTO v_snapshot;
    ELSIF v_action IN ('approve_agreement','reject_agreement') THEN
      IF v_agreement.state<>'pending' OR v_agreement.revision<>(payload->>'expectedRevision')::integer
        OR v_agreement.source_digest<>payload->>'expectedSourceDigest' THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed agreement decision is stale'; END IF;
      v_receipt:=mmhr_private.r1_finish_security_command(v_actor,v_command,'finance.'||v_action,v_type,v_entity,v_org,
        payload->>'reason',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),v_time);
      v_receipt_id:=(v_receipt->>'receipt_id')::uuid;
      UPDATE public.finance_agreement_versions a SET state=CASE WHEN v_action='approve_agreement' THEN 'approved' ELSE 'rejected' END,
        revision=2,decided_by_identity_id=v_actor,decided_at=v_time,decision_reason=payload->>'reason',review_reference=payload->>'reviewReference',
        reviewed_access_id=(payload->>'reviewedAccessId')::uuid,decision_receipt_id=v_receipt_id,decision_request=payload,
        decision_request_digest=mmhr_private.r7_managed_digest(payload),decision_correlation_id=v_command_correlation_id
        WHERE a.id=v_entity AND a.organization_id=v_org RETURNING * INTO v_agreement;
      v_snapshot:=to_jsonb(v_agreement);
      IF v_action='approve_agreement' THEN
        INSERT INTO public.finance_agreement_applicability(organization_id,agreement_id,version_id,predecessor_version_id,series_revision,cutover_at,approval_receipt_id,recorded_at)
        VALUES(v_org,v_agreement.agreement_id,v_entity,v_agreement.predecessor_version_id,v_agreement.expected_series_revision+1,
          v_agreement.effective_from,v_receipt_id,v_agreement.decided_at);
        UPDATE public.finance_agreement_series s SET revision=s.revision+1 WHERE s.id=v_agreement.agreement_id AND s.organization_id=v_org;
      END IF;
    ELSIF v_action='prepare_contract_facts' THEN
      IF v_facts.id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed contract facts version already exists'; END IF;
      SELECT coalesce(max(f.version),0)+1 INTO v_version FROM public.finance_contract_facts_versions f WHERE f.organization_id=v_org AND f.contract_id=v_portal.contract_id;
      v_source_document:=(payload->'source'->>'documentId')::uuid; v_source_version:=(payload->'source'->>'versionId')::uuid;
      v_observation:=mmhr_private.r7_managed_document_observation(v_org,v_source_document,v_source_version);
      v_receipt:=mmhr_private.r1_finish_security_command(v_actor,v_command,'finance.'||v_action,v_type,v_entity,v_org,
        payload->>'reason',correlation_id,idempotency_key,payload,NULL,jsonb_build_object('status','completed'),v_time);
      v_receipt_id:=(v_receipt->>'receipt_id')::uuid;
      INSERT INTO public.finance_contract_facts_versions(id,organization_id,contract_id,handoff_id,version,predecessor_version_id,expected_facts_revision,
        source_document_id,source_version_id,source_sha256,source_digest,source_reference,source_observation,contract_value_minor_units,contract_currency,
        state,revision,prepared_by_identity_id,prepared_at,correlation_id,prepare_receipt_id,prepare_request,prepare_request_digest)
      VALUES(v_entity,v_org,v_portal.contract_id,v_portal.handoff_id,v_version,(payload->>'predecessorVersionId')::uuid,(payload->>'expectedFactsRevision')::integer,
        v_source_document,v_source_version,payload->'source'->>'sha256',mmhr_private.r7_managed_digest(jsonb_build_object('request',payload,'document',v_observation)),
        payload->>'sourceReference',v_observation,(payload->'contractValue'->>'amountMinorUnits')::bigint,payload->'contractValue'->>'currency',
        'pending',1,v_actor,v_time,correlation_id,v_receipt_id,payload,mmhr_private.r7_managed_digest(payload))
        RETURNING to_jsonb(finance_contract_facts_versions.*) INTO v_snapshot;
    ELSIF v_action IN ('approve_contract_facts','reject_contract_facts') THEN
      IF v_facts.state<>'pending' OR v_facts.revision<>(payload->>'expectedRevision')::integer OR v_facts.source_digest<>payload->>'expectedSourceDigest' THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed contract facts decision is stale'; END IF;
      v_receipt:=mmhr_private.r1_finish_security_command(v_actor,v_command,'finance.'||v_action,v_type,v_entity,v_org,
        payload->>'reason',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),v_time);
      v_receipt_id:=(v_receipt->>'receipt_id')::uuid;
      UPDATE public.finance_contract_facts_versions f SET state=CASE WHEN v_action='approve_contract_facts' THEN 'approved' ELSE 'rejected' END,
        revision=2,decided_by_identity_id=v_actor,decided_at=v_time,decision_reason=payload->>'reason',review_reference=payload->>'reviewReference',
        reviewed_access_id=(payload->>'reviewedAccessId')::uuid,decision_receipt_id=v_receipt_id,decision_request=payload,
        decision_request_digest=mmhr_private.r7_managed_digest(payload),decision_correlation_id=v_command_correlation_id
        WHERE f.id=v_entity AND f.organization_id=v_org RETURNING to_jsonb(f.*) INTO v_snapshot;
    ELSIF v_action='resolve_eligibility' THEN
      v_entity:=gen_random_uuid();
      SELECT * INTO v_agreement FROM public.finance_agreement_versions a WHERE a.id=(v_observation->>'agreementVersionId')::uuid
        AND a.organization_id=(v_observation->>'agreementOrganizationId')::uuid AND a.agreement_id=(v_observation->>'agreementId')::uuid;
      IF v_agreement.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed signing-time agreement missing'; END IF;
      IF v_agreement.calculation_type<>'unsupported' THEN
        INSERT INTO public.commission_structures(organization_id,vendor_organization_id,effective_from,effective_to,calculation_type,
          rate_basis_points,flat_amount_minor_units,currency,source_agreement_id,revision,created_by_identity_id,created_at)
        VALUES(v_org,(v_observation->>'vendorOrganizationId')::uuid,(v_observation->>'effectiveFrom')::timestamptz,(v_observation->>'effectiveEnd')::timestamptz,
          v_agreement.calculation_type,v_agreement.rate_basis_points,v_agreement.flat_amount_minor_units,v_agreement.currency,v_agreement.id,1,v_actor,v_time) RETURNING id INTO v_structure;
      END IF;
      v_receipt:=mmhr_private.r1_finish_security_command(v_actor,v_command,'finance.'||v_action,v_type,v_entity,v_org,
        payload->>'reason',correlation_id,idempotency_key,payload,NULL,jsonb_build_object('status','completed'),v_time);
      v_receipt_id:=(v_receipt->>'receipt_id')::uuid;
      INSERT INTO public.commission_events(id,organization_id,contract_id,deal_id,vendor_organization_id,structure_id,source_mode,event_revision,
        contract_currency,idempotency_key,signed_at,currency,contract_value_minor_units,commission_amount_minor_units,calculation_revision,state,created_at)
      VALUES(v_entity,v_org,v_portal.contract_id,(v_observation->>'dealId')::uuid,(v_observation->>'vendorOrganizationId')::uuid,v_structure,'managed',1,
        NULL,idempotency_key,(v_observation->>'signedAt')::timestamptz,v_agreement.currency,NULL,NULL,0,'pending_review',v_time);
      INSERT INTO public.managed_commission_sources(commission_event_id,organization_id,contract_id,handoff_id,structure_id,
        agreement_organization_id,agreement_id,agreement_version_id,applicability_id,resolved_effective_from,resolved_effective_end,source_snapshot,source_digest,
        created_by_identity_id,receipt_id,creation_request,creation_request_digest,creation_correlation_id,created_at)
      VALUES(v_entity,v_org,v_portal.contract_id,v_portal.handoff_id,v_structure,v_agreement.organization_id,v_agreement.agreement_id,v_agreement.id,
        (v_observation->>'applicabilityId')::uuid,(v_observation->>'effectiveFrom')::timestamptz,(v_observation->>'effectiveEnd')::timestamptz,v_observation,
        mmhr_private.r7_managed_digest(v_observation),v_actor,v_receipt_id,payload,mmhr_private.r7_managed_digest(payload),correlation_id,v_time)
        RETURNING to_jsonb(managed_commission_sources.*) INTO v_snapshot;
    ELSIF v_action='prepare_calculation' THEN
      IF v_calculation.id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed calculation already exists'; END IF;
      SELECT * INTO v_facts FROM public.finance_contract_facts_versions f WHERE f.organization_id=v_org AND f.contract_id=v_event.contract_id
        AND f.handoff_id=v_source.handoff_id AND f.state='approved' ORDER BY f.version DESC LIMIT 1;
      v_observation:=mmhr_private.r7_managed_calculation_observation(v_event.id,v_facts.id);
      v_result:=mmhr_private.r7_managed_calculation_result(v_observation);
      IF v_event.state<>'pending_review' OR v_event.event_revision<>(payload->>'expectedEventRevision')::integer OR v_observation IS NULL OR v_result IS NULL
        OR mmhr_private.r7_managed_digest(v_observation)<>payload->>'expectedSourceDigest' THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed calculation preparation is stale'; END IF;
      SELECT coalesce(max(c.calculation_revision),0)+1 INTO v_version FROM public.managed_commission_calculations c WHERE c.commission_event_id=v_event.id;
      v_receipt:=mmhr_private.r1_finish_security_command(v_actor,v_command,'finance.'||v_action,v_type,v_entity,v_org,
        payload->>'reason',correlation_id,idempotency_key,payload,NULL,jsonb_build_object('status','completed'),v_time);
      v_receipt_id:=(v_receipt->>'receipt_id')::uuid;
      INSERT INTO public.managed_commission_calculations(id,organization_id,commission_event_id,calculation_revision,facts_version_id,contract_id,
        expected_event_revision,source_digest,input_snapshot,result_snapshot,algorithm,amount_minor_units,currency,state,revision,
        prepared_by_identity_id,prepared_at,correlation_id,prepare_receipt_id,prepare_request,prepare_request_digest)
      VALUES(v_entity,v_org,v_event.id,v_version,v_facts.id,v_event.contract_id,v_event.event_revision,mmhr_private.r7_managed_digest(v_observation),
        v_observation,v_result,v_result->>'algorithm',(v_result->'commission'->>'amountMinorUnits')::bigint,v_result->'commission'->>'currency',
        'pending',1,v_actor,v_time,correlation_id,v_receipt_id,payload,mmhr_private.r7_managed_digest(payload))
        RETURNING to_jsonb(managed_commission_calculations.*) INTO v_snapshot;
    ELSE
      IF v_event.state<>'pending_review' OR v_event.event_revision<>(payload->>'expectedEventRevision')::integer
        OR v_calculation.state<>'pending' OR v_calculation.revision<>(payload->>'expectedCalculationRevision')::integer
        OR v_calculation.source_digest<>payload->>'expectedSourceDigest' THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed calculation decision is stale'; END IF;
      v_receipt:=mmhr_private.r1_finish_security_command(v_actor,v_command,'finance.'||v_action,v_type,v_entity,v_org,
        payload->>'reason',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),v_time);
      v_receipt_id:=(v_receipt->>'receipt_id')::uuid;
      UPDATE public.managed_commission_calculations c SET state=CASE WHEN v_action='approve_calculation' THEN 'approved' ELSE 'rejected' END,
        revision=2,decided_by_identity_id=v_actor,decided_at=v_time,decision_reason=payload->>'reason',review_reference=payload->>'reviewReference',
        decision_receipt_id=v_receipt_id,decision_request=payload,decision_request_digest=mmhr_private.r7_managed_digest(payload),decision_correlation_id=v_command_correlation_id
        WHERE c.id=v_entity AND c.organization_id=v_org RETURNING * INTO v_calculation;
      v_snapshot:=to_jsonb(v_calculation);
      IF v_action='approve_calculation' THEN
        SELECT * INTO v_facts FROM public.finance_contract_facts_versions f WHERE f.id=v_calculation.facts_version_id AND f.organization_id=v_org AND f.contract_id=v_event.contract_id;
        UPDATE public.commission_events e SET state='approved',event_revision=e.event_revision+1,calculation_revision=v_calculation.calculation_revision,
          commission_amount_minor_units=v_calculation.amount_minor_units,currency=v_calculation.currency,
          contract_value_minor_units=v_facts.contract_value_minor_units,contract_currency=v_facts.contract_currency WHERE e.id=v_event.id AND e.organization_id=v_org;
        INSERT INTO public.commission_event_history(organization_id,commission_event_id,event_revision,from_state,to_state,actor_identity_id,reason,occurred_at,correlation_id)
        VALUES(v_org,v_event.id,v_event.event_revision+1,'pending_review','approved',v_actor,v_calculation.decision_reason,v_calculation.decided_at,correlation_id);
      END IF;
    END IF;
    INSERT INTO public.managed_finance_events(organization_id,entity_type,entity_id,revision,action,actor_identity_id,receipt_id,correlation_id,snapshot,occurred_at)
    VALUES(v_org,v_type,v_entity,v_history_revision,v_action,v_actor,v_receipt_id,correlation_id,v_snapshot,v_time);
  END IF;

  IF v_action='resolve_eligibility' THEN
    -- This check also covers second-key retries that do not own a history row.
    SELECT * INTO v_source FROM public.managed_commission_sources s WHERE s.organization_id=v_org AND s.commission_event_id=v_entity
      AND s.contract_id=v_portal.contract_id AND s.handoff_id=v_portal.handoff_id;
    IF v_source.commission_event_id IS NULL OR mmhr_private.r7_managed_receipt_ok(v_source.receipt_id,v_source.created_by_identity_id,v_org,v_entity,
      'commission_event','resolve_eligibility',v_source.creation_correlation_id,v_source.creation_request) IS NOT TRUE
      OR NOT EXISTS(SELECT 1 FROM public.managed_finance_events h WHERE h.organization_id=v_org AND h.entity_type='commission_event'
        AND h.entity_id=v_entity AND h.revision=1 AND h.action='resolve_eligibility' AND h.receipt_id=v_source.receipt_id
        AND h.actor_identity_id=v_source.created_by_identity_id AND h.correlation_id=v_source.creation_correlation_id AND h.snapshot=to_jsonb(v_source)) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed original eligibility proof denied'; END IF;
  END IF;
  v_result:=jsonb_build_object('organizationId',v_org,'correlationId',correlation_id,'entityId',v_entity,'revision',v_history_revision,
    'action',v_action,'outcomeCode',v_outcome);
  RETURN v_result||CASE v_type WHEN 'finance_agreement_version' THEN jsonb_build_object('agreementId',(payload->>'agreementId')::uuid)
    WHEN 'finance_contract_facts_version' THEN jsonb_build_object('contractId',(payload->>'contractId')::uuid)
    WHEN 'commission_event' THEN jsonb_build_object('contractId',v_portal.contract_id,'handoffId',v_portal.handoff_id)
    ELSE jsonb_build_object('commissionEventId',(payload->>'commissionEventId')::uuid) END;
EXCEPTION
  -- These named boundaries roll back receipt, audit and every business write.
  -- Authorization and evidence-guard errors retain their exact 42501 messages.
  WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid managed finance command input';
  WHEN unique_violation OR check_violation OR foreign_key_violation OR not_null_violation THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance command conflict';
END $$;

REVOKE ALL ON FUNCTION public.mmhr_managed_finance_command(jsonb,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_managed_finance_command(jsonb,uuid,uuid) TO authenticated;


--> statement-breakpoint
-- Scratch-only read projections. These functions expose bounded metadata and
-- reviewed business facts. They never issue Storage grants or return locations.
CREATE FUNCTION mmhr_private.r7_managed_label(value text,fallback text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' SET timezone='UTC' AS $$
  SELECT left(coalesce(nullif(btrim(regexp_replace(value,'[[:cntrl:]]','','g')),''),fallback),500)
$$;

CREATE FUNCTION mmhr_private.r7_managed_identity_label(p_identity uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT mmhr_private.r7_managed_label(i.normalized_email,'Staff identity unavailable') FROM public.identities i WHERE i.id=p_identity
$$;

CREATE FUNCTION mmhr_private.r7_managed_original_metadata(p_org uuid,p_doc uuid,p_version uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT jsonb_build_object('organizationId',p_org,'documentId',p_doc,'versionId',p_version,'sha256',lower(v.sha256),
    'fileName',u.file_name,'currentDocumentVersion',d.current_version,'originalVersion',v.version,
    'document',mmhr_private.r4_workspace_document_metadata(u,v,d.current_version))
  FROM public.finance_document_sources f JOIN public.workflow_documents d ON d.id=f.document_id AND d.organization_id=f.organization_id
    JOIN public.workflow_document_uploads u ON u.version_id=f.version_id AND u.organization_id=f.organization_id AND u.document_id=f.document_id
    JOIN public.workflow_document_versions v ON v.id=f.version_id AND v.organization_id=f.organization_id AND v.document_id=f.document_id
  WHERE f.organization_id=p_org AND f.document_id=p_doc AND f.version_id=p_version
    AND u.source_kind='finance' AND u.state IN ('approved','superseded') AND u.failure_code IS NULL
    AND mmhr_private.r7_finance_document_source_integrity(p_org,f.source_snapshot)
    AND mmhr_private.r7_finance_document_content_actor(p_org,p_doc,p_version,u.revision,'finance_original') IS NOT NULL
$$;

CREATE FUNCTION mmhr_private.r7_managed_agreement_item(p_org uuid,p_agreement uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT jsonb_build_object('agreementId',s.id,'vendorOrganizationId',s.vendor_organization_id,
    'vendorLabel',mmhr_private.r7_managed_label(o.name,'Vendor name unavailable'),'seriesRevision',s.revision,
    'currentApprovedVersionId',(SELECT a.id FROM public.finance_agreement_versions a WHERE a.organization_id=s.organization_id AND a.agreement_id=s.id
      AND a.state='approved' ORDER BY a.version DESC LIMIT 1),
    'pendingVersionCount',(SELECT count(*) FROM public.finance_agreement_versions a WHERE a.organization_id=s.organization_id AND a.agreement_id=s.id AND a.state='pending'))
  FROM public.finance_agreement_series s JOIN public.orgs o ON o.id=s.vendor_organization_id AND o.type='vendor'
  WHERE s.organization_id=p_org AND s.id=p_agreement
$$;

CREATE FUNCTION mmhr_private.r7_managed_contract_item(p_org uuid,p_contract uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT jsonb_build_object('contractId',p.contract_id,'handoffId',p.handoff_id,'dealId',d.id,
    'dealLabel',mmhr_private.r7_managed_label(concat_ws(' · ',customer.name,vendor.name,product.name,replace(d.stage,'_',' ')),'Contract label unavailable'),
    'vendorOrganizationId',h.vendor_organization_id,'vendorLabel',mmhr_private.r7_managed_label(vendor.name,'Vendor name unavailable'),'signedAt',p.signed_at,
    'approvedFactsVersionId',(SELECT f.id FROM public.finance_contract_facts_versions f WHERE f.organization_id=p_org AND f.contract_id=p_contract AND f.state='approved'
      ORDER BY f.version DESC LIMIT 1),'commissionEventId',e.id,'commissionState',e.state)
  FROM public.portal_contract_handoff_details p JOIN public.contract_handoffs h ON h.id=p.handoff_id AND h.organization_id=p.organization_id
    JOIN public.deals d ON d.id=h.deal_id AND d.organization_id=h.organization_id AND d.contract_id=p.contract_id
    JOIN public.orgs customer ON customer.id=p.organization_id JOIN public.orgs vendor ON vendor.id=h.vendor_organization_id
    LEFT JOIN public.products product ON product.id=d.product_id AND product.organization_id=d.vendor_organization_id
    LEFT JOIN public.commission_events e ON e.organization_id=p.organization_id AND e.contract_id=p.contract_id
  WHERE p.organization_id=p_org AND p.contract_id=p_contract AND mmhr_private.r7_finance_document_source_integrity(p_org,
    jsonb_build_object('sourceClass','signed_contract','vendorOrganizationId',h.vendor_organization_id,'contractId',p.contract_id,'handoffId',p.handoff_id,'dealId',d.id))
$$;

CREATE FUNCTION mmhr_private.r7_managed_source_version_item(p_org uuid,p_id uuid,p_kind text,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE a public.finance_agreement_versions%ROWTYPE; f public.finance_contract_facts_versions%ROWTYPE;
  original jsonb; source jsonb; common jsonb; can_approve boolean:=false; can_reject boolean:=false;
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM mmhr_private.r7_finance_document_actor(p_org) THEN RETURN NULL; END IF;
  IF p_kind='agreement' THEN
    SELECT * INTO a FROM public.finance_agreement_versions v WHERE v.id=p_id AND v.organization_id=p_org;
    IF NOT FOUND THEN RETURN NULL; END IF;
    original:=mmhr_private.r7_managed_original_metadata(p_org,a.source_document_id,a.source_version_id);
    IF original IS NULL THEN RETURN NULL; END IF;
    SELECT s.source_snapshot INTO source FROM public.finance_document_sources s WHERE s.organization_id=p_org
      AND s.document_id=a.source_document_id AND s.version_id=a.source_version_id;
    can_reject:=a.state='pending' AND a.revision=1 AND a.prepared_by_identity_id<>p_actor
      AND mmhr_private.r7_managed_original_retained_ok(p_org,a.source_document_id,a.source_version_id,a.source_sha256,source);
    can_approve:=can_reject AND mmhr_private.r7_managed_original_ok(p_org,a.source_document_id,a.source_version_id,a.source_sha256,source)
      AND a.source_observation=mmhr_private.r7_managed_document_observation(p_org,a.source_document_id,a.source_version_id)
      AND EXISTS(SELECT 1 FROM public.finance_agreement_series s WHERE s.id=a.agreement_id AND s.organization_id=p_org AND s.revision=a.expected_series_revision)
      AND a.predecessor_version_id IS NOT DISTINCT FROM (SELECT latest.id FROM public.finance_agreement_versions latest
        WHERE latest.agreement_id=a.agreement_id AND latest.organization_id=p_org AND latest.state='approved' ORDER BY latest.version DESC LIMIT 1)
      AND (a.expected_series_revision=0 OR (a.effective_from>=clock_timestamp() AND EXISTS(SELECT 1 FROM public.finance_agreement_applicability previous
        WHERE previous.version_id=a.predecessor_version_id AND previous.agreement_id=a.agreement_id AND previous.organization_id=p_org AND previous.cutover_at<a.effective_from)
        AND NOT EXISTS(SELECT 1 FROM public.managed_commission_sources s JOIN public.commission_events e ON e.id=s.commission_event_id AND e.organization_id=s.organization_id
          WHERE s.agreement_id=a.agreement_id AND e.signed_at>=a.effective_from)));
    common:=jsonb_build_object('versionId',a.id,'version',a.version,'predecessorVersionId',a.predecessor_version_id,'expectedSeriesRevision',a.expected_series_revision,
      'original',original,'sourceDigest',a.source_digest,'effectiveFrom',a.effective_from,'statedEffectiveEnd',a.stated_effective_end,
      'rule',mmhr_private.r7_managed_agreement_rule(a),'conditionReferences',a.condition_references,'state',a.state,'revision',a.revision,
      'preparedByIdentityId',a.prepared_by_identity_id,'preparedByLabel',mmhr_private.r7_managed_identity_label(a.prepared_by_identity_id),'preparedAt',a.prepared_at,
      'decidedByIdentityId',a.decided_by_identity_id,'decidedByLabel',mmhr_private.r7_managed_identity_label(a.decided_by_identity_id),'decidedAt',a.decided_at,'decisionReason',a.decision_reason);
  ELSIF p_kind='contract' THEN
    SELECT * INTO f FROM public.finance_contract_facts_versions v WHERE v.id=p_id AND v.organization_id=p_org;
    IF NOT FOUND THEN RETURN NULL; END IF;
    original:=mmhr_private.r7_managed_original_metadata(p_org,f.source_document_id,f.source_version_id);
    IF original IS NULL THEN RETURN NULL; END IF;
    SELECT s.source_snapshot INTO source FROM public.finance_document_sources s WHERE s.organization_id=p_org
      AND s.document_id=f.source_document_id AND s.version_id=f.source_version_id;
    can_reject:=f.state='pending' AND f.revision=1 AND f.prepared_by_identity_id<>p_actor
      AND mmhr_private.r7_managed_original_retained_ok(p_org,f.source_document_id,f.source_version_id,f.source_sha256,source);
    can_approve:=can_reject AND mmhr_private.r7_managed_original_ok(p_org,f.source_document_id,f.source_version_id,f.source_sha256,source)
      AND f.source_observation=mmhr_private.r7_managed_document_observation(p_org,f.source_document_id,f.source_version_id)
      AND f.expected_facts_revision=coalesce((SELECT latest.version FROM public.finance_contract_facts_versions latest
        WHERE latest.organization_id=p_org AND latest.contract_id=f.contract_id AND latest.state='approved' ORDER BY latest.version DESC LIMIT 1),0)
      AND f.predecessor_version_id IS NOT DISTINCT FROM (SELECT latest.id FROM public.finance_contract_facts_versions latest
        WHERE latest.organization_id=p_org AND latest.contract_id=f.contract_id AND latest.state='approved' ORDER BY latest.version DESC LIMIT 1);
    common:=jsonb_build_object('versionId',f.id,'version',f.version,'predecessorVersionId',f.predecessor_version_id,'expectedFactsRevision',f.expected_facts_revision,
      'original',original,'sourceDigest',f.source_digest,'contractValue',jsonb_build_object('amountMinorUnits',f.contract_value_minor_units,'currency',f.contract_currency),
      'sourceReference',f.source_reference,'state',f.state,'revision',f.revision,'preparedByIdentityId',f.prepared_by_identity_id,
      'preparedByLabel',mmhr_private.r7_managed_identity_label(f.prepared_by_identity_id),'preparedAt',f.prepared_at,
      'decidedByIdentityId',f.decided_by_identity_id,'decidedByLabel',mmhr_private.r7_managed_identity_label(f.decided_by_identity_id),'decidedAt',f.decided_at,'decisionReason',f.decision_reason);
  ELSE RETURN NULL;
  END IF;
  can_reject:=coalesce(can_reject,false); can_approve:=coalesce(can_approve,false);
  RETURN common||jsonb_build_object('canApprove',can_approve,'canReject',can_reject,'canDecide',can_approve OR can_reject);
END $$;

CREATE FUNCTION mmhr_private.r7_managed_calculation_item(p_org uuid,p_id uuid,p_actor uuid,p_detail boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE c public.managed_commission_calculations%ROWTYPE; e public.commission_events%ROWTYPE;
  s public.managed_commission_sources%ROWTYPE; a public.finance_agreement_versions%ROWTYPE; f public.finance_contract_facts_versions%ROWTYPE;
  item jsonb; contract_item jsonb; observation jsonb; current_digest text; blockers jsonb; can_reject boolean; can_approve boolean;
  agreement_original jsonb; contract_original jsonb; agreement_source jsonb; contract_source jsonb;
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM mmhr_private.r7_finance_document_actor(p_org) THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.managed_commission_calculations calc WHERE calc.organization_id=p_org AND calc.id=p_id;
  SELECT * INTO e FROM public.commission_events event WHERE event.organization_id=p_org AND event.id=c.commission_event_id AND event.contract_id=c.contract_id AND event.source_mode='managed';
  SELECT * INTO s FROM public.managed_commission_sources source WHERE source.organization_id=p_org AND source.commission_event_id=e.id AND source.contract_id=e.contract_id;
  IF c.id IS NULL OR e.id IS NULL OR s.commission_event_id IS NULL
    OR mmhr_private.r7_finance_document_actor(s.agreement_organization_id) IS DISTINCT FROM p_actor THEN RETURN NULL; END IF;
  contract_item:=mmhr_private.r7_managed_contract_item(p_org,e.contract_id);
  IF contract_item IS NULL THEN RETURN NULL; END IF;
  observation:=mmhr_private.r7_managed_calculation_observation(e.id,c.facts_version_id);
  current_digest:=mmhr_private.r7_managed_digest(observation);
  blockers:=CASE WHEN c.state='approved' THEN '[]'::jsonb ELSE c.result_snapshot->'blockers' END;
  IF c.state<>'approved' AND c.source_digest IS DISTINCT FROM current_digest THEN blockers:=blockers||jsonb_build_array('source_changed'); END IF;
  item:=jsonb_build_object('calculationId',c.id,'commissionEventId',e.id,'contractId',e.contract_id,'dealLabel',contract_item->'dealLabel',
    'vendorLabel',contract_item->'vendorLabel','state',c.state,'revision',c.revision,'calculationRevision',c.calculation_revision,
    'amountMinorUnits',c.amount_minor_units,'currency',c.currency,'blockerCodes',blockers,
    'preparedByLabel',mmhr_private.r7_managed_identity_label(c.prepared_by_identity_id),'preparedAt',c.prepared_at);
  IF NOT p_detail THEN RETURN item; END IF;
  SELECT * INTO a FROM public.finance_agreement_versions v WHERE v.id=s.agreement_version_id AND v.organization_id=s.agreement_organization_id AND v.agreement_id=s.agreement_id;
  SELECT * INTO f FROM public.finance_contract_facts_versions v WHERE v.id=c.facts_version_id AND v.organization_id=p_org AND v.contract_id=e.contract_id AND v.handoff_id=s.handoff_id;
  agreement_original:=mmhr_private.r7_managed_original_metadata(a.organization_id,a.source_document_id,a.source_version_id);
  contract_original:=mmhr_private.r7_managed_original_metadata(p_org,f.source_document_id,f.source_version_id);
  IF a.id IS NULL OR f.id IS NULL OR agreement_original IS NULL OR contract_original IS NULL THEN RETURN NULL; END IF;
  SELECT source.source_snapshot INTO agreement_source FROM public.finance_document_sources source WHERE source.organization_id=a.organization_id
    AND source.document_id=a.source_document_id AND source.version_id=a.source_version_id;
  SELECT source.source_snapshot INTO contract_source FROM public.finance_document_sources source WHERE source.organization_id=p_org
    AND source.document_id=f.source_document_id AND source.version_id=f.source_version_id;
  can_reject:=c.state='pending' AND c.revision=1 AND e.state='pending_review' AND c.prepared_by_identity_id<>p_actor AND c.expected_event_revision=e.event_revision;
  can_approve:=can_reject AND current_digest=c.source_digest AND c.amount_minor_units IS NOT NULL AND jsonb_array_length(blockers)=0
    AND mmhr_private.r7_managed_calculation_result(observation)=c.result_snapshot
    AND mmhr_private.r7_managed_original_ok(a.organization_id,a.source_document_id,a.source_version_id,a.source_sha256,agreement_source)
    AND mmhr_private.r7_managed_original_ok(p_org,f.source_document_id,f.source_version_id,f.source_sha256,contract_source);
  can_reject:=coalesce(can_reject,false); can_approve:=coalesce(can_approve,false);
  RETURN item||jsonb_build_object('preparedByIdentityId',c.prepared_by_identity_id,'decidedByIdentityId',c.decided_by_identity_id,
    'decidedByLabel',mmhr_private.r7_managed_identity_label(c.decided_by_identity_id),'decidedAt',c.decided_at,'decisionReason',c.decision_reason,
    'expectedEventRevision',c.expected_event_revision,'currentEventRevision',e.event_revision,'expectedSourceDigest',c.source_digest,'currentSourceDigest',current_digest,
    'factsVersionId',f.id,'agreementVersionId',a.id,'agreementOrganizationId',a.organization_id,'contractOriginal',contract_original,'agreementOriginal',agreement_original,
    'contractValue',jsonb_build_object('amountMinorUnits',f.contract_value_minor_units,'currency',f.contract_currency),'rule',mmhr_private.r7_managed_agreement_rule(a),
    'conditionReferences',a.condition_references,'currentActorIdentityId',p_actor,'canApprove',can_approve,'canReject',can_reject,'canDecide',can_approve OR can_reject);
END $$;

REVOKE ALL ON FUNCTION mmhr_private.r7_managed_label(text,text),mmhr_private.r7_managed_identity_label(uuid),
  mmhr_private.r7_managed_original_metadata(uuid,uuid,uuid),mmhr_private.r7_managed_agreement_item(uuid,uuid),
  mmhr_private.r7_managed_contract_item(uuid,uuid),mmhr_private.r7_managed_source_version_item(uuid,uuid,text,uuid),
  mmhr_private.r7_managed_calculation_item(uuid,uuid,uuid,boolean)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;

--> statement-breakpoint
-- Scratch-only page read. Permission and eligibility filters precede LIMIT.
CREATE FUNCTION public.mmhr_get_managed_finance_page(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_org uuid; v_actor uuid; v_view text; v_after uuid; v_items jsonb; v_next uuid; v_type text;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL OR octet_length(payload::text)>2000
    OR NOT(payload ?& ARRAY['organizationId','view']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('organizationId','view','afterId'))
    OR mmhr_private.r7_managed_uuid(payload->'organizationId') IS NOT TRUE
    OR (payload ? 'afterId' AND mmhr_private.r7_managed_uuid(payload->'afterId') IS NOT TRUE)
    OR jsonb_typeof(payload->'view') IS DISTINCT FROM 'string' OR payload->>'view' NOT IN ('agreements','contracts','calculations') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid managed finance page input'; END IF;
  v_org:=(payload->>'organizationId')::uuid; v_after:=(payload->>'afterId')::uuid; v_view:=payload->>'view';
  PERFORM mmhr_private.r1_lock_security(); v_actor:=mmhr_private.r7_finance_document_actor(v_org);
  SELECT o.type INTO v_type FROM public.orgs o WHERE o.id=v_org;
  IF v_actor IS NULL OR (v_view='agreements' AND v_type IS DISTINCT FROM 'internal')
    OR (v_view IN ('contracts','calculations') AND v_type IS DISTINCT FROM 'customer') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance page authority denied'; END IF;
  IF v_view='agreements' THEN
    WITH candidates AS MATERIALIZED(SELECT s.id,projection.item FROM public.finance_agreement_series s
      CROSS JOIN LATERAL(SELECT mmhr_private.r7_managed_agreement_item(v_org,s.id) item) projection
      WHERE s.organization_id=v_org AND (v_after IS NULL OR s.id>v_after) AND projection.item IS NOT NULL ORDER BY s.id LIMIT 26),
      numbered AS(SELECT *,row_number() OVER(ORDER BY id) ordinal FROM candidates)
    SELECT coalesce(jsonb_agg(item ORDER BY id) FILTER(WHERE ordinal<=25),'[]'::jsonb),
      CASE WHEN count(*)=26 THEN (array_agg(id ORDER BY id))[25] ELSE NULL END INTO v_items,v_next FROM numbered;
  ELSIF v_view='contracts' THEN
    WITH candidates AS MATERIALIZED(SELECT p.contract_id id,projection.item FROM public.portal_contract_handoff_details p
      CROSS JOIN LATERAL(SELECT mmhr_private.r7_managed_contract_item(v_org,p.contract_id) item) projection
      WHERE p.organization_id=v_org AND p.contract_id IS NOT NULL AND (v_after IS NULL OR p.contract_id>v_after)
        AND projection.item IS NOT NULL ORDER BY p.contract_id LIMIT 26),
      numbered AS(SELECT *,row_number() OVER(ORDER BY id) ordinal FROM candidates)
    SELECT coalesce(jsonb_agg(item ORDER BY id) FILTER(WHERE ordinal<=25),'[]'::jsonb),
      CASE WHEN count(*)=26 THEN (array_agg(id ORDER BY id))[25] ELSE NULL END INTO v_items,v_next FROM numbered;
  ELSE
    WITH candidates AS MATERIALIZED(SELECT c.id,projection.item FROM public.managed_commission_calculations c
      CROSS JOIN LATERAL(SELECT mmhr_private.r7_managed_calculation_item(v_org,c.id,v_actor,false) item) projection
      WHERE c.organization_id=v_org AND (v_after IS NULL OR c.id>v_after) AND projection.item IS NOT NULL ORDER BY c.id LIMIT 26),
      numbered AS(SELECT *,row_number() OVER(ORDER BY id) ordinal FROM candidates)
    SELECT coalesce(jsonb_agg(item ORDER BY id) FILTER(WHERE ordinal<=25),'[]'::jsonb),
      CASE WHEN count(*)=26 THEN (array_agg(id ORDER BY id))[25] ELSE NULL END INTO v_items,v_next FROM numbered;
  END IF;
  RETURN jsonb_build_object('organizationId',v_org,'correlationId',correlation_id,'view',v_view,'items',v_items,'nextCursor',v_next);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_managed_finance_page(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_managed_finance_page(jsonb,uuid) TO authenticated;

--> statement-breakpoint
-- Scratch-only detail read. The agreement original retains its own workspace.
-- A caller must select that workspace through the normal UI to download it.
CREATE FUNCTION public.mmhr_get_managed_finance_detail(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_org uuid; v_actor uuid; v_entity uuid; v_view text; v_before integer; v_type text;
  v_item jsonb; v_versions jsonb; v_next integer; v_calculation jsonb; v_facts public.finance_contract_facts_versions%ROWTYPE;
  v_event public.commission_events%ROWTYPE; v_source public.managed_commission_sources%ROWTYPE; v_observation jsonb; v_digest text;
  v_can_resolve boolean; v_can_prepare boolean;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL OR octet_length(payload::text)>2000
    OR NOT(payload ?& ARRAY['organizationId','view','entityId'])
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('organizationId','view','entityId','beforeVersion'))
    OR mmhr_private.r7_managed_uuid(payload->'organizationId') IS NOT TRUE OR mmhr_private.r7_managed_uuid(payload->'entityId') IS NOT TRUE
    OR jsonb_typeof(payload->'view') IS DISTINCT FROM 'string' OR payload->>'view' NOT IN ('agreement','contract','calculation')
    OR (payload ? 'beforeVersion' AND mmhr_private.r7_managed_integer(payload->'beforeVersion',1,2147483646) IS NOT TRUE)
    OR (payload->>'view'='calculation' AND payload ? 'beforeVersion') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid managed finance detail input'; END IF;
  v_org:=(payload->>'organizationId')::uuid; v_entity:=(payload->>'entityId')::uuid;
  v_before:=(payload->>'beforeVersion')::integer; v_view:=payload->>'view';
  PERFORM mmhr_private.r1_lock_security(); v_actor:=mmhr_private.r7_finance_document_actor(v_org);
  SELECT o.type INTO v_type FROM public.orgs o WHERE o.id=v_org;
  IF v_actor IS NULL OR (v_view='agreement' AND v_type IS DISTINCT FROM 'internal')
    OR (v_view IN ('contract','calculation') AND v_type IS DISTINCT FROM 'customer') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance detail authority denied'; END IF;
  IF v_view='calculation' THEN
    v_calculation:=mmhr_private.r7_managed_calculation_item(v_org,v_entity,v_actor,true);
    IF v_calculation IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed calculation detail denied'; END IF;
    RETURN jsonb_build_object('organizationId',v_org,'correlationId',correlation_id,'entityId',v_entity,'view',v_view,'calculation',v_calculation);
  ELSIF v_view='agreement' THEN
    v_item:=mmhr_private.r7_managed_agreement_item(v_org,v_entity);
    IF v_item IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed agreement detail denied'; END IF;
    WITH candidates AS MATERIALIZED(SELECT a.version,mmhr_private.r7_managed_source_version_item(v_org,a.id,'agreement',v_actor) item
      FROM public.finance_agreement_versions a WHERE a.organization_id=v_org AND a.agreement_id=v_entity
        AND (v_before IS NULL OR a.version<v_before) ORDER BY a.version DESC LIMIT 26),
      numbered AS(SELECT *,row_number() OVER(ORDER BY version DESC) ordinal FROM candidates)
    SELECT coalesce(jsonb_agg(item ORDER BY version DESC) FILTER(WHERE ordinal<=25),'[]'::jsonb),
      CASE WHEN count(*)=26 THEN (array_agg(version ORDER BY version DESC))[25] ELSE NULL END INTO v_versions,v_next FROM numbered;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_versions) item WHERE item='null'::jsonb) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed agreement original metadata denied'; END IF;
    RETURN jsonb_build_object('organizationId',v_org,'correlationId',correlation_id,'currentActorIdentityId',v_actor,'entityId',v_entity,'view',v_view,
      'agreement',v_item,'versions',v_versions,'nextVersion',v_next);
  END IF;
  v_item:=mmhr_private.r7_managed_contract_item(v_org,v_entity);
  IF v_item IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed contract detail denied'; END IF;
  SELECT * INTO v_facts FROM public.finance_contract_facts_versions f WHERE f.organization_id=v_org AND f.contract_id=v_entity AND f.state='approved' ORDER BY f.version DESC LIMIT 1;
  SELECT * INTO v_event FROM public.commission_events e WHERE e.organization_id=v_org AND e.contract_id=v_entity;
  SELECT * INTO v_source FROM public.managed_commission_sources s WHERE s.organization_id=v_org AND s.commission_event_id=v_event.id AND s.contract_id=v_entity;
  v_can_resolve:=v_event.id IS NULL AND mmhr_private.r7_managed_eligibility_observation(v_org,v_entity,(v_item->>'handoffId')::uuid) IS NOT NULL;
  IF v_event.source_mode='managed' AND v_source.commission_event_id IS NOT NULL
    AND mmhr_private.r7_finance_document_actor(v_source.agreement_organization_id)=v_actor THEN
    v_observation:=mmhr_private.r7_managed_calculation_observation(v_event.id,v_facts.id); v_digest:=mmhr_private.r7_managed_digest(v_observation);
  END IF;
  v_can_prepare:=v_event.source_mode='managed' AND v_event.state='pending_review' AND v_facts.id IS NOT NULL AND v_digest IS NOT NULL
    AND mmhr_private.r7_managed_calculation_result(v_observation) IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.finance_agreement_versions a JOIN public.finance_document_sources original ON original.organization_id=a.organization_id
      AND original.document_id=a.source_document_id AND original.version_id=a.source_version_id
      WHERE a.id=v_source.agreement_version_id AND a.organization_id=v_source.agreement_organization_id
        AND mmhr_private.r7_managed_original_ok(a.organization_id,a.source_document_id,a.source_version_id,a.source_sha256,original.source_snapshot))
    AND EXISTS(SELECT 1 FROM public.finance_document_sources original WHERE original.organization_id=v_org
      AND original.document_id=v_facts.source_document_id AND original.version_id=v_facts.source_version_id
      AND mmhr_private.r7_managed_original_ok(v_org,v_facts.source_document_id,v_facts.source_version_id,v_facts.source_sha256,original.source_snapshot));
  v_item:=v_item||jsonb_build_object('currentFactsRevision',coalesce(v_facts.version,0),'currentEventRevision',v_event.event_revision,
    'currentSourceDigest',v_digest,'canResolveEligibility',coalesce(v_can_resolve,false),'canPrepareCalculation',coalesce(v_can_prepare,false));
  WITH candidates AS MATERIALIZED(SELECT f.version,mmhr_private.r7_managed_source_version_item(v_org,f.id,'contract',v_actor) item
    FROM public.finance_contract_facts_versions f WHERE f.organization_id=v_org AND f.contract_id=v_entity
      AND (v_before IS NULL OR f.version<v_before) ORDER BY f.version DESC LIMIT 26),
    numbered AS(SELECT *,row_number() OVER(ORDER BY version DESC) ordinal FROM candidates)
  SELECT coalesce(jsonb_agg(item ORDER BY version DESC) FILTER(WHERE ordinal<=25),'[]'::jsonb),
    CASE WHEN count(*)=26 THEN (array_agg(version ORDER BY version DESC))[25] ELSE NULL END INTO v_versions,v_next FROM numbered;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_versions) item WHERE item='null'::jsonb) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed contract original metadata denied'; END IF;
  RETURN jsonb_build_object('organizationId',v_org,'correlationId',correlation_id,'currentActorIdentityId',v_actor,'entityId',v_entity,'view',v_view,
    'contract',v_item,'versions',v_versions,'nextVersion',v_next);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_managed_finance_detail(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_managed_finance_detail(jsonb,uuid) TO authenticated;

--> statement-breakpoint
-- Scratch-only choices for new preparation. Historical details use the retained
-- original projection; this read requires current source eligibility instead.
CREATE FUNCTION public.mmhr_get_managed_finance_originals(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_org uuid; v_actor uuid; v_source jsonb; v_after uuid; v_items jsonb; v_next uuid;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL OR octet_length(payload::text)>2000
    OR NOT(payload ?& ARRAY['organizationId','source'])
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('organizationId','source','afterVersionId'))
    OR mmhr_private.r7_managed_uuid(payload->'organizationId') IS NOT TRUE
    OR (payload ? 'afterVersionId' AND mmhr_private.r7_managed_uuid(payload->'afterVersionId') IS NOT TRUE)
    OR jsonb_typeof(payload->'source') IS DISTINCT FROM 'object'
    OR mmhr_private.r7_managed_uuid(payload->'source'->'vendorOrganizationId') IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid managed finance original choices input'; END IF;
  v_org:=(payload->>'organizationId')::uuid; v_source:=payload->'source'; v_after:=(payload->>'afterVersionId')::uuid;
  IF v_source->>'sourceClass'='agreement' THEN
    IF mmhr_private.r7_managed_exact_keys(v_source,ARRAY['sourceClass','vendorOrganizationId']) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid managed finance original choices input'; END IF;
  ELSIF v_source->>'sourceClass'='signed_contract' THEN
    IF mmhr_private.r7_managed_exact_keys(v_source,ARRAY['sourceClass','vendorOrganizationId','contractId','handoffId','dealId']) IS NOT TRUE
      OR EXISTS(SELECT 1 FROM unnest(ARRAY['contractId','handoffId','dealId']) k WHERE mmhr_private.r7_managed_uuid(v_source->k) IS NOT TRUE) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid managed finance original choices input'; END IF;
  ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid managed finance original choices input'; END IF;
  PERFORM mmhr_private.r1_lock_security(); v_actor:=mmhr_private.r7_finance_document_actor(v_org);
  IF v_actor IS NULL OR mmhr_private.r7_finance_document_source_valid(v_org,v_source) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed finance original choices authority denied'; END IF;
  WITH candidates AS MATERIALIZED(SELECT f.version_id id,jsonb_build_object('original',jsonb_build_object('organizationId',v_org,
      'documentId',f.document_id,'versionId',f.version_id,'sha256',lower(v.sha256)),
      'document',mmhr_private.r4_workspace_document_metadata(u,v,d.current_version),
      'vendorLabel',mmhr_private.r7_managed_label(vendor.name,'Vendor name unavailable'),
      'dealLabel',CASE WHEN f.source_class='agreement' THEN NULL ELSE mmhr_private.r7_managed_contract_item(v_org,f.contract_id)->'dealLabel' END) item
    FROM public.finance_document_sources f JOIN public.workflow_documents d ON d.id=f.document_id AND d.organization_id=f.organization_id
      JOIN public.workflow_document_versions v ON v.id=f.version_id AND v.document_id=f.document_id AND v.organization_id=f.organization_id
      JOIN public.workflow_document_uploads u ON u.version_id=f.version_id AND u.document_id=f.document_id AND u.organization_id=f.organization_id
      JOIN public.orgs vendor ON vendor.id=f.vendor_organization_id
    WHERE f.organization_id=v_org AND f.source_snapshot=v_source AND (v_after IS NULL OR f.version_id>v_after)
      AND u.source_kind='finance' AND u.state='approved' AND u.failure_code IS NULL AND v.version=d.current_version
      AND mmhr_private.r7_finance_document_content_actor(v_org,f.document_id,f.version_id,u.revision,'finance_original')=v_actor
    ORDER BY f.version_id LIMIT 26), numbered AS(SELECT *,row_number() OVER(ORDER BY id) ordinal FROM candidates)
  SELECT coalesce(jsonb_agg(item ORDER BY id) FILTER(WHERE ordinal<=25),'[]'::jsonb),
    CASE WHEN count(*)=26 THEN (array_agg(id ORDER BY id))[25] ELSE NULL END INTO v_items,v_next FROM numbered;
  RETURN jsonb_build_object('organizationId',v_org,'correlationId',correlation_id,'source',v_source,'items',v_items,'nextCursor',v_next);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_managed_finance_originals(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_managed_finance_originals(jsonb,uuid) TO authenticated;
