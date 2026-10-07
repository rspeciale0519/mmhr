CREATE TABLE "evaluation_disclosures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"candidate_revision" integer NOT NULL,
	"publication_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"vendor_organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"review_digest" text NOT NULL,
	"masked_label" text NOT NULL,
	"provider_name" text NOT NULL,
	"product_name" text NOT NULL,
	"conflict_disclosure" text NOT NULL,
	"discussion_at" timestamp with time zone NOT NULL,
	"discussion_reference" text NOT NULL,
	"reason" text NOT NULL,
	"disclosed_by_identity_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"disclosed_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "evaluation_disclosures_revision_ck" CHECK ("evaluation_disclosures"."candidate_revision" > 0),
	CONSTRAINT "evaluation_disclosures_digest_ck" CHECK ("evaluation_disclosures"."review_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "evaluation_disclosures_names_ck" CHECK (length(btrim("evaluation_disclosures"."provider_name")) between 1 and 200 and length(btrim("evaluation_disclosures"."product_name")) between 1 and 200 and length(btrim("evaluation_disclosures"."masked_label")) between 1 and 100),
	CONSTRAINT "evaluation_disclosures_evidence_ck" CHECK (length(btrim("evaluation_disclosures"."conflict_disclosure")) between 1 and 2000 and length(btrim("evaluation_disclosures"."discussion_reference")) between 1 and 300 and length(btrim("evaluation_disclosures"."reason")) between 1 and 500),
	CONSTRAINT "evaluation_disclosures_time_ck" CHECK ("evaluation_disclosures"."discussion_at" <= "evaluation_disclosures"."disclosed_at")
);
--> statement-breakpoint
ALTER TABLE "evaluation_disclosures" ADD CONSTRAINT "evaluation_disclosures_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_disclosures" ADD CONSTRAINT "evaluation_disclosures_disclosed_by_identity_id_identities_id_fk" FOREIGN KEY ("disclosed_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_disclosures" ADD CONSTRAINT "evaluation_disclosures_candidate_fk" FOREIGN KEY ("organization_id","intake_id","candidate_id") REFERENCES "public"."evaluation_candidates"("organization_id","intake_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_disclosures" ADD CONSTRAINT "evaluation_disclosures_publication_fk" FOREIGN KEY ("organization_id","intake_id","publication_id") REFERENCES "public"."evaluation_publications"("organization_id","intake_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_disclosures" ADD CONSTRAINT "evaluation_disclosures_option_fk" FOREIGN KEY ("organization_id","publication_id","option_id") REFERENCES "public"."evaluation_publication_options"("organization_id","publication_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_disclosures" ADD CONSTRAINT "evaluation_disclosures_product_fk" FOREIGN KEY ("vendor_organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_disclosures_scope_id_uq" ON "evaluation_disclosures" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "evaluation_disclosures_candidate_time_idx" ON "evaluation_disclosures" USING btree ("organization_id","intake_id","candidate_id","disclosed_at","id");