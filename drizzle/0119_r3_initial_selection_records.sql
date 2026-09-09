CREATE TABLE "evaluation_initial_selection_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"selection_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "evaluation_initial_selection_items_position_ck" CHECK ("evaluation_initial_selection_items"."position" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "evaluation_initial_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"input_digest" text NOT NULL,
	"selected_count" integer NOT NULL,
	"initial_candidate_count" integer NOT NULL,
	"created_by_identity_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "evaluation_initial_selections_digest_ck" CHECK ("evaluation_initial_selections"."input_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "evaluation_initial_selections_count_ck" CHECK ("evaluation_initial_selections"."selected_count" between 1 and 5 and "evaluation_initial_selections"."initial_candidate_count" between "evaluation_initial_selections"."selected_count" and 5)
);
--> statement-breakpoint
-- Referenced uniqueness must exist before scoped foreign keys.
CREATE UNIQUE INDEX "evaluation_initial_selection_items_candidate_uq" ON "evaluation_initial_selection_items" USING btree ("organization_id","candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_initial_selection_items_option_uq" ON "evaluation_initial_selection_items" USING btree ("organization_id","publication_id","option_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_initial_selection_items_position_uq" ON "evaluation_initial_selection_items" USING btree ("organization_id","selection_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_initial_selections_scope_id_uq" ON "evaluation_initial_selections" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_initial_selections_binding_uq" ON "evaluation_initial_selections" USING btree ("organization_id","id","intake_id","publication_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_candidates_intake_id_uq" ON "evaluation_candidates" USING btree ("organization_id","intake_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_publication_options_publication_id_uq" ON "evaluation_publication_options" USING btree ("organization_id","publication_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_publications_intake_id_uq" ON "evaluation_publications" USING btree ("organization_id","intake_id","id");--> statement-breakpoint
ALTER TABLE "evaluation_initial_selection_items" ADD CONSTRAINT "evaluation_initial_selection_items_batch_fk" FOREIGN KEY ("organization_id","selection_id","intake_id","publication_id") REFERENCES "public"."evaluation_initial_selections"("organization_id","id","intake_id","publication_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_initial_selection_items" ADD CONSTRAINT "evaluation_initial_selection_items_option_fk" FOREIGN KEY ("organization_id","publication_id","option_id") REFERENCES "public"."evaluation_publication_options"("organization_id","publication_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_initial_selection_items" ADD CONSTRAINT "evaluation_initial_selection_items_candidate_fk" FOREIGN KEY ("organization_id","intake_id","candidate_id") REFERENCES "public"."evaluation_candidates"("organization_id","intake_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_initial_selections" ADD CONSTRAINT "evaluation_initial_selections_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_initial_selections" ADD CONSTRAINT "evaluation_initial_selections_created_by_identity_id_identities_id_fk" FOREIGN KEY ("created_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_initial_selections" ADD CONSTRAINT "evaluation_initial_selections_publication_fk" FOREIGN KEY ("organization_id","intake_id","publication_id") REFERENCES "public"."evaluation_publications"("organization_id","intake_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
--> statement-breakpoint
-- Forward: add private history and scoped links; existing candidates remain unchanged.
-- Recovery: revoke selection execution and correct forward without removing history.
ALTER TABLE public.evaluation_initial_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_initial_selection_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evaluation_initial_selections, public.evaluation_initial_selection_items
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r3_deny_raw_initial_selections ON public.evaluation_initial_selections
  AS RESTRICTIVE FOR ALL TO anon, authenticated, service_role, mmhr_worker USING (false) WITH CHECK (false);
CREATE POLICY r3_deny_raw_initial_selection_items ON public.evaluation_initial_selection_items
  AS RESTRICTIVE FOR ALL TO anon, authenticated, service_role, mmhr_worker USING (false) WITH CHECK (false);
--> statement-breakpoint
CREATE TRIGGER evaluation_initial_selections_append_only BEFORE UPDATE OR DELETE ON public.evaluation_initial_selections
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER evaluation_initial_selections_append_only_truncate BEFORE TRUNCATE ON public.evaluation_initial_selections
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER evaluation_initial_selection_items_append_only BEFORE UPDATE OR DELETE ON public.evaluation_initial_selection_items
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER evaluation_initial_selection_items_append_only_truncate BEFORE TRUNCATE ON public.evaluation_initial_selection_items
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
