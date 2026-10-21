CREATE TABLE "evaluation_publication_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"approval_reference" text,
	"actor_identity_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_publication_decisions_decision_ck" CHECK ("evaluation_publication_decisions"."decision" in ('published', 'revoked')),
	CONSTRAINT "evaluation_publication_decisions_reason_ck" CHECK (length(btrim("evaluation_publication_decisions"."reason")) between 1 and 2000),
	CONSTRAINT "evaluation_publication_decisions_approval_ck" CHECK (("evaluation_publication_decisions"."decision" = 'published' and "evaluation_publication_decisions"."approval_reference" is not null and length(btrim("evaluation_publication_decisions"."approval_reference")) between 1 and 500) or ("evaluation_publication_decisions"."decision" = 'revoked' and "evaluation_publication_decisions"."approval_reference" is null))
);
--> statement-breakpoint
CREATE TABLE "evaluation_publication_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"vendor_organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"masked_label" text NOT NULL,
	"eligibility" text NOT NULL,
	"deterministic_score" integer NOT NULL,
	"confidence_basis_points" integer NOT NULL,
	"fit_reasons" jsonb NOT NULL,
	"limitations" jsonb NOT NULL,
	"evidence_fresh_at" timestamp with time zone,
	"valid_until" timestamp with time zone,
	CONSTRAINT "evaluation_publication_options_ordinal_ck" CHECK ("evaluation_publication_options"."ordinal" > 0 and "evaluation_publication_options"."masked_label" = 'Option ' || "evaluation_publication_options"."ordinal"::text),
	CONSTRAINT "evaluation_publication_options_eligibility_ck" CHECK ("evaluation_publication_options"."eligibility" in ('eligible', 'ineligible', 'unknown')),
	CONSTRAINT "evaluation_publication_options_scores_ck" CHECK ("evaluation_publication_options"."deterministic_score" between 0 and 10000 and "evaluation_publication_options"."confidence_basis_points" between 0 and 10000),
	CONSTRAINT "evaluation_publication_options_reasons_ck" CHECK (jsonb_typeof("evaluation_publication_options"."fit_reasons") = 'array' and jsonb_array_length("evaluation_publication_options"."fit_reasons") <= 2000 and jsonb_typeof("evaluation_publication_options"."limitations") = 'array' and jsonb_array_length("evaluation_publication_options"."limitations") <= 2000),
	CONSTRAINT "evaluation_publication_options_freshness_ck" CHECK (("evaluation_publication_options"."evidence_fresh_at" is null and "evaluation_publication_options"."valid_until" is null) or ("evaluation_publication_options"."evidence_fresh_at" is not null and "evaluation_publication_options"."valid_until" is not null and "evaluation_publication_options"."valid_until" > "evaluation_publication_options"."evidence_fresh_at"))
);
--> statement-breakpoint
CREATE TABLE "evaluation_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"intake_revision" integer NOT NULL,
	"configuration" jsonb NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"input_digest" text NOT NULL,
	"option_count" integer NOT NULL,
	"created_by_identity_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_publications_revision_ck" CHECK ("evaluation_publications"."sequence" > 0 and "evaluation_publications"."intake_revision" > 0),
	CONSTRAINT "evaluation_publications_configuration_ck" CHECK (jsonb_typeof("evaluation_publications"."configuration") = 'object' and octet_length("evaluation_publications"."configuration"::text) <= 1000000),
	CONSTRAINT "evaluation_publications_snapshot_ck" CHECK (jsonb_typeof("evaluation_publications"."input_snapshot") = 'object' and octet_length("evaluation_publications"."input_snapshot"::text) <= 20000000),
	CONSTRAINT "evaluation_publications_digest_ck" CHECK ("evaluation_publications"."input_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "evaluation_publications_count_ck" CHECK ("evaluation_publications"."option_count" >= 0)
);
--> statement-breakpoint
-- Referenced unique indexes must exist before scoped foreign keys.
CREATE UNIQUE INDEX "evaluation_publications_scope_id_uq" ON "evaluation_publications" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "evaluation_publication_decisions" ADD CONSTRAINT "evaluation_publication_decisions_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_publication_decisions" ADD CONSTRAINT "evaluation_publication_decisions_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_publication_decisions" ADD CONSTRAINT "evaluation_publication_decisions_publication_scope_fk" FOREIGN KEY ("organization_id","publication_id") REFERENCES "public"."evaluation_publications"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_publication_options" ADD CONSTRAINT "evaluation_publication_options_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_publication_options" ADD CONSTRAINT "evaluation_publication_options_publication_scope_fk" FOREIGN KEY ("organization_id","publication_id") REFERENCES "public"."evaluation_publications"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_publication_options" ADD CONSTRAINT "evaluation_publication_options_vendor_product_fk" FOREIGN KEY ("vendor_organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_publications" ADD CONSTRAINT "evaluation_publications_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_publications" ADD CONSTRAINT "evaluation_publications_created_by_identity_id_identities_id_fk" FOREIGN KEY ("created_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_publications" ADD CONSTRAINT "evaluation_publications_intake_scope_fk" FOREIGN KEY ("organization_id","intake_id") REFERENCES "public"."intakes"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_publication_decisions_once_uq" ON "evaluation_publication_decisions" USING btree ("publication_id","decision");--> statement-breakpoint
CREATE INDEX "evaluation_publication_decisions_scope_time_idx" ON "evaluation_publication_decisions" USING btree ("organization_id","publication_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_publication_options_scope_id_uq" ON "evaluation_publication_options" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_publication_options_product_uq" ON "evaluation_publication_options" USING btree ("publication_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_publication_options_ordinal_uq" ON "evaluation_publication_options" USING btree ("publication_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_publications_sequence_uq" ON "evaluation_publications" USING btree ("organization_id","intake_id","sequence");
--> statement-breakpoint
-- Forward: add private records before exposing the reviewed command surface.
-- Recovery: contain the new RPCs and correct forward; retain review history.
ALTER TABLE public.evaluation_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_publication_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_publication_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evaluation_publications, public.evaluation_publication_options,
  public.evaluation_publication_decisions FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint
CREATE TRIGGER evaluation_publications_append_only BEFORE UPDATE OR DELETE ON public.evaluation_publications
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER evaluation_publications_append_only_truncate BEFORE TRUNCATE ON public.evaluation_publications
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER evaluation_publication_options_append_only BEFORE UPDATE OR DELETE ON public.evaluation_publication_options
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER evaluation_publication_options_append_only_truncate BEFORE TRUNCATE ON public.evaluation_publication_options
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER evaluation_publication_decisions_append_only BEFORE UPDATE OR DELETE ON public.evaluation_publication_decisions
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER evaluation_publication_decisions_append_only_truncate BEFORE TRUNCATE ON public.evaluation_publication_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
