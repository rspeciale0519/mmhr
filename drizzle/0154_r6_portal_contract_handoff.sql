-- Add scoped contract records without removing historical handoffs.
-- Referenced unique indexes must exist before composite foreign keys.
CREATE TABLE "portal_contract_handoff_details" (
	"handoff_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"selection_id" uuid NOT NULL,
	"introduced_at" timestamp with time zone,
	"introduction_reference" text,
	"introduced_by_identity_id" uuid,
	"signed_at" timestamp with time zone,
	"contract_reference" text,
	"contract_id" uuid,
	"signature_recorded_by_identity_id" uuid,
	"correlation_id" uuid NOT NULL,
	CONSTRAINT "portal_contract_detail_introduction_ck" CHECK (("portal_contract_handoff_details"."introduced_at" is null and "portal_contract_handoff_details"."introduction_reference" is null and "portal_contract_handoff_details"."introduced_by_identity_id" is null)
    or ("portal_contract_handoff_details"."introduced_at" is not null and "portal_contract_handoff_details"."introduction_reference" is not null and "portal_contract_handoff_details"."introduced_by_identity_id" is not null)),
	CONSTRAINT "portal_contract_detail_signed_ck" CHECK (("portal_contract_handoff_details"."signed_at" is null and "portal_contract_handoff_details"."contract_reference" is null and "portal_contract_handoff_details"."contract_id" is null and "portal_contract_handoff_details"."signature_recorded_by_identity_id" is null)
    or ("portal_contract_handoff_details"."signed_at" is not null and "portal_contract_handoff_details"."contract_reference" is not null and "portal_contract_handoff_details"."contract_id" is not null and "portal_contract_handoff_details"."signature_recorded_by_identity_id" is not null and "portal_contract_handoff_details"."introduced_at" is not null and "portal_contract_handoff_details"."signed_at" >= "portal_contract_handoff_details"."introduced_at")),
	CONSTRAINT "portal_contract_detail_introduction_ref_ck" CHECK ("portal_contract_handoff_details"."introduction_reference" is null or octet_length(btrim("portal_contract_handoff_details"."introduction_reference")) between 1 and 500),
	CONSTRAINT "portal_contract_detail_contract_ref_ck" CHECK ("portal_contract_handoff_details"."contract_reference" is null or octet_length(btrim("portal_contract_handoff_details"."contract_reference")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "portal_contract_handoff_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"handoff_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"actor_identity_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"correlation_id" uuid NOT NULL,
	CONSTRAINT "portal_contract_event_revision_ck" CHECK ("portal_contract_handoff_events"."revision" between 2 and 9999),
	CONSTRAINT "portal_contract_event_action_ck" CHECK ("portal_contract_handoff_events"."action" in ('introduce', 'transition', 'record_signed')),
	CONSTRAINT "portal_contract_event_from_ck" CHECK ("portal_contract_handoff_events"."from_status" in ('introduction_pending', 'introduced', 'negotiating', 'stalled')),
	CONSTRAINT "portal_contract_event_to_ck" CHECK ("portal_contract_handoff_events"."to_status" in ('introduced', 'negotiating', 'stalled', 'signed', 'not_signed', 'cancelled')),
	CONSTRAINT "portal_contract_event_reason_ck" CHECK (octet_length(btrim("portal_contract_handoff_events"."reason")) between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "portal_contract_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"comparison_id" uuid,
	"proposal_version_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"source_hash" text NOT NULL,
	"quote_revision" integer NOT NULL,
	"selection_reasons" jsonb NOT NULL,
	"remaining_risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"selected_by_identity_id" uuid NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_identity_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"approval_reference" text,
	"handoff_id" uuid,
	"correlation_id" uuid NOT NULL,
	CONSTRAINT "portal_contract_selection_hash_ck" CHECK ("portal_contract_selections"."source_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "portal_contract_selection_quote_revision_ck" CHECK ("portal_contract_selections"."quote_revision" between 1 and 9999),
	CONSTRAINT "portal_contract_selection_reasons_ck" CHECK (jsonb_typeof("portal_contract_selections"."selection_reasons") = 'array' and jsonb_array_length("portal_contract_selections"."selection_reasons") between 1 and 10 and octet_length("portal_contract_selections"."selection_reasons"::text) <= 6000),
	CONSTRAINT "portal_contract_selection_risks_ck" CHECK (jsonb_typeof("portal_contract_selections"."remaining_risks") = 'array' and jsonb_array_length("portal_contract_selections"."remaining_risks") <= 20 and octet_length("portal_contract_selections"."remaining_risks"::text) <= 12000),
	CONSTRAINT "portal_contract_selection_state_ck" CHECK ("portal_contract_selections"."state" in ('pending', 'approved', 'rejected', 'withdrawn')),
	CONSTRAINT "portal_contract_selection_decision_ck" CHECK (("portal_contract_selections"."state" = 'pending' and "portal_contract_selections"."revision" = 1 and "portal_contract_selections"."decided_by_identity_id" is null and "portal_contract_selections"."decided_at" is null and "portal_contract_selections"."decision_reason" is null and "portal_contract_selections"."approval_reference" is null and "portal_contract_selections"."handoff_id" is null)
    or ("portal_contract_selections"."state" in ('approved', 'rejected', 'withdrawn') and "portal_contract_selections"."revision" = 2 and "portal_contract_selections"."decided_by_identity_id" is not null and "portal_contract_selections"."decided_at" is not null and "portal_contract_selections"."decided_at" >= "portal_contract_selections"."selected_at" and "portal_contract_selections"."decision_reason" is not null)),
	CONSTRAINT "portal_contract_selection_approval_ck" CHECK (("portal_contract_selections"."state" = 'approved' and "portal_contract_selections"."approval_reference" is not null and "portal_contract_selections"."handoff_id" is not null and "portal_contract_selections"."decided_by_identity_id" <> "portal_contract_selections"."selected_by_identity_id")
    or ("portal_contract_selections"."state" <> 'approved' and "portal_contract_selections"."approval_reference" is null and "portal_contract_selections"."handoff_id" is null)),
	CONSTRAINT "portal_contract_selection_reason_ck" CHECK ("portal_contract_selections"."decision_reason" is null or octet_length(btrim("portal_contract_selections"."decision_reason")) between 1 and 2000),
	CONSTRAINT "portal_contract_selection_reference_ck" CHECK ("portal_contract_selections"."approval_reference" is null or octet_length(btrim("portal_contract_selections"."approval_reference")) between 1 and 300)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_contract_handoff_details_scope_uq" ON "portal_contract_handoff_details" USING btree ("organization_id","handoff_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_contract_handoff_details_selection_uq" ON "portal_contract_handoff_details" USING btree ("selection_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_contract_handoff_details_contract_uq" ON "portal_contract_handoff_details" USING btree ("organization_id","contract_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_contract_handoff_events_revision_uq" ON "portal_contract_handoff_events" USING btree ("handoff_id","revision");
--> statement-breakpoint
CREATE INDEX "portal_contract_handoff_events_scope_idx" ON "portal_contract_handoff_events" USING btree ("organization_id","handoff_id","revision");
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_contract_selections_scope_uq" ON "portal_contract_selections" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_contract_selections_handoff_uq" ON "portal_contract_selections" USING btree ("handoff_id");
--> statement-breakpoint
CREATE INDEX "portal_contract_selections_intake_idx" ON "portal_contract_selections" USING btree ("organization_id","intake_id","id");
--> statement-breakpoint
ALTER TABLE "portal_contract_handoff_details" ADD CONSTRAINT "portal_contract_handoff_details_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_handoff_details" ADD CONSTRAINT "portal_contract_handoff_details_introduced_by_identity_id_identities_id_fk" FOREIGN KEY ("introduced_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_handoff_details" ADD CONSTRAINT "portal_contract_handoff_details_signature_recorded_by_identity_id_identities_id_fk" FOREIGN KEY ("signature_recorded_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_handoff_details" ADD CONSTRAINT "portal_contract_detail_handoff_fk" FOREIGN KEY ("organization_id","handoff_id") REFERENCES "public"."contract_handoffs"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_handoff_details" ADD CONSTRAINT "portal_contract_detail_selection_fk" FOREIGN KEY ("organization_id","selection_id") REFERENCES "public"."portal_contract_selections"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_handoff_events" ADD CONSTRAINT "portal_contract_handoff_events_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_handoff_events" ADD CONSTRAINT "portal_contract_handoff_events_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_handoff_events" ADD CONSTRAINT "portal_contract_event_detail_fk" FOREIGN KEY ("organization_id","handoff_id") REFERENCES "public"."portal_contract_handoff_details"("organization_id","handoff_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_selections" ADD CONSTRAINT "portal_contract_selections_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_selections" ADD CONSTRAINT "portal_contract_selections_selected_by_identity_id_identities_id_fk" FOREIGN KEY ("selected_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_selections" ADD CONSTRAINT "portal_contract_selections_decided_by_identity_id_identities_id_fk" FOREIGN KEY ("decided_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_selections" ADD CONSTRAINT "portal_contract_selection_intake_fk" FOREIGN KEY ("organization_id","intake_id") REFERENCES "public"."intakes"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_selections" ADD CONSTRAINT "portal_contract_selection_comparison_fk" FOREIGN KEY ("organization_id","comparison_id") REFERENCES "public"."proposal_quote_comparisons"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_selections" ADD CONSTRAINT "portal_contract_selection_quote_fk" FOREIGN KEY ("organization_id","proposal_version_id") REFERENCES "public"."proposal_quote_sources"("organization_id","proposal_version_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_selections" ADD CONSTRAINT "portal_contract_selection_recipient_fk" FOREIGN KEY ("organization_id","recipient_id") REFERENCES "public"."rfp_recipients"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_selections" ADD CONSTRAINT "portal_contract_selection_deal_fk" FOREIGN KEY ("organization_id","deal_id") REFERENCES "public"."deals"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_contract_selections" ADD CONSTRAINT "portal_contract_selection_handoff_fk" FOREIGN KEY ("organization_id","handoff_id") REFERENCES "public"."contract_handoffs"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
-- Contract table controls.
-- Existing records remain intact. Request RPCs alone receive application access.
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['portal_contract_selections','portal_contract_handoff_details','portal_contract_handoff_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker',table_name);
    EXECUTE format('CREATE POLICY portal_contract_raw_deny ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false)',table_name);
    EXECUTE format('CREATE TRIGGER portal_contract_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation()',table_name);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_contract_actor(requested_org uuid,view_name text,writer boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;
BEGIN
  actor:=mmhr_private.r6_quote_actor(requested_org,view_name,writer);
  IF actor IS NULL OR (view_name IN ('customer','staff') AND NOT EXISTS(
      SELECT 1 FROM public.orgs o WHERE o.id=requested_org AND o.type='customer')) THEN RETURN NULL; END IF;
  IF writer AND view_name='customer' AND (NOT EXISTS(
      SELECT 1 FROM public.org_members m WHERE m.org_id=requested_org AND m.identity_id=actor
        AND m.status='active' AND NOT m.migration_review_required AND m.role_key IN ('organization_admin','contributor'))
      OR EXISTS(SELECT 1 FROM public.platform_role_assignments p WHERE p.identity_id=actor AND p.state='active')) THEN RETURN NULL; END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_contract_actor(uuid,text,boolean)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_contract_source_is_current(org_id uuid,intake_id uuid,comparison_id uuid,
  quote_id uuid,quote_revision integer,source_hash text,recipient_id uuid,deal_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.proposal_quote_sources s
    JOIN public.proposal_versions p ON p.id=s.proposal_version_id AND p.organization_id=s.organization_id
    JOIN public.deals d ON d.id=p.deal_id AND d.organization_id=p.organization_id
    WHERE s.organization_id=$1 AND s.intake_id=$2 AND s.proposal_version_id=$4 AND s.revision=$5 AND s.source_hash=$6
      AND s.recipient_id=$7 AND p.deal_id=$8 AND s.state='approved_for_comparison'
      AND d.contract_id IS NULL AND mmhr_private.r6_quote_recipient_is_current(s.recipient_id,p.deal_id,s.intake_id)
      AND ($3 IS NULL OR EXISTS(SELECT 1 FROM public.proposal_quote_comparisons c
        WHERE c.id=$3 AND c.organization_id=s.organization_id AND c.intake_id=s.intake_id AND c.state='approved' AND c.revision=2
          AND mmhr_private.r6_quote_comparison_is_current(c.organization_id,c.intake_id,c.source_snapshot)
          AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.source_snapshot) item
            WHERE item->>'proposalVersionId'=s.proposal_version_id::text AND item->>'sourceHash'=s.source_hash AND item->'quote'=s.original_quote))))
$$;
REVOKE ALL ON FUNCTION mmhr_private.r6_contract_source_is_current(uuid,uuid,uuid,uuid,integer,text,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_guard_contract_selection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; source public.proposal_quote_sources%ROWTYPE; proposal public.proposal_versions%ROWTYPE;
  handoff public.contract_handoffs%ROWTYPE; item jsonb;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract selections are immutable'; END IF;
  SELECT * INTO source FROM public.proposal_quote_sources s WHERE s.organization_id=NEW.organization_id AND s.proposal_version_id=NEW.proposal_version_id;
  SELECT * INTO proposal FROM public.proposal_versions p WHERE p.organization_id=NEW.organization_id AND p.id=NEW.proposal_version_id;
  IF source.proposal_version_id IS NULL OR proposal.id IS NULL OR (source.intake_id,source.recipient_id,source.source_hash,proposal.deal_id)
      IS DISTINCT FROM (NEW.intake_id,NEW.recipient_id,NEW.source_hash,NEW.deal_id)
      OR jsonb_typeof(NEW.selection_reasons) IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.remaining_risks) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract selection association denied'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(NEW.selection_reasons||NEW.remaining_risks) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR NOT mmhr_private.r6_quote_text_is_valid(item#>>'{}',500) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract selection text'; END IF;
  END LOOP;
  IF TG_OP='INSERT' THEN
    actor:=mmhr_private.r6_contract_actor(NEW.organization_id,'customer',true);
    IF actor IS NULL OR NEW.selected_by_identity_id IS DISTINCT FROM actor OR NEW.state<>'pending' OR NEW.revision<>1
      OR NEW.selected_at<source.approved_at OR NEW.selected_at>clock_timestamp()
      OR NOT mmhr_private.r6_contract_source_is_current(NEW.organization_id,NEW.intake_id,NEW.comparison_id,NEW.proposal_version_id,
        NEW.quote_revision,NEW.source_hash,NEW.recipient_id,NEW.deal_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current customer selection required'; END IF;
  ELSE
    IF (NEW.id,NEW.organization_id,NEW.intake_id,NEW.comparison_id,NEW.proposal_version_id,NEW.recipient_id,NEW.deal_id,
      NEW.source_hash,NEW.quote_revision,NEW.selection_reasons,NEW.remaining_risks,NEW.selected_by_identity_id,NEW.selected_at)
      IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.intake_id,OLD.comparison_id,OLD.proposal_version_id,OLD.recipient_id,OLD.deal_id,
        OLD.source_hash,OLD.quote_revision,OLD.selection_reasons,OLD.remaining_risks,OLD.selected_by_identity_id,OLD.selected_at)
      OR OLD.state<>'pending' OR NEW.revision<>2 OR NEW.state NOT IN ('approved','rejected','withdrawn')
      OR NEW.decided_at>clock_timestamp() OR NOT mmhr_private.r6_quote_text_is_valid(NEW.decision_reason,2000) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract selection or decision is immutable'; END IF;
    actor:=mmhr_private.r6_contract_actor(NEW.organization_id,CASE NEW.state WHEN 'withdrawn' THEN 'customer' ELSE 'staff' END,true);
    IF actor IS NULL OR NEW.decided_by_identity_id IS DISTINCT FROM actor
      OR (NEW.state='withdrawn' AND actor<>OLD.selected_by_identity_id)
      OR (NEW.state IN ('approved','rejected') AND actor=OLD.selected_by_identity_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Independent selection decision required'; END IF;
    IF NEW.state='approved' THEN
      SELECT * INTO handoff FROM public.contract_handoffs h WHERE h.id=NEW.handoff_id AND h.organization_id=NEW.organization_id;
      IF handoff.id IS NULL OR NOT mmhr_private.r6_quote_text_is_valid(NEW.approval_reference,300)
        OR handoff.deal_id<>NEW.deal_id OR handoff.status<>'introduction_pending' OR handoff.revision<>1
        OR handoff.selection_reasons IS DISTINCT FROM NEW.selection_reasons OR handoff.remaining_risks IS DISTINCT FROM NEW.remaining_risks
        OR handoff.approved_at IS DISTINCT FROM NEW.decided_at
        OR handoff.approved_by_identity_ids IS DISTINCT FROM jsonb_build_array(NEW.selected_by_identity_id,actor)
        OR NOT mmhr_private.r6_contract_source_is_current(NEW.organization_id,NEW.intake_id,NEW.comparison_id,NEW.proposal_version_id,
          NEW.quote_revision,NEW.source_hash,NEW.recipient_id,NEW.deal_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Approved source and separate staff decision required'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_guard_contract_selection()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE TRIGGER portal_contract_selection_guard BEFORE INSERT OR UPDATE OR DELETE ON public.portal_contract_selections
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r6_guard_contract_selection();
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_guard_contract_details()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; selection public.portal_contract_selections%ROWTYPE; handoff public.contract_handoffs%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract handoff details are immutable'; END IF;
  actor:=mmhr_private.r6_contract_actor(NEW.organization_id,'staff');
  SELECT * INTO selection FROM public.portal_contract_selections s WHERE s.id=NEW.selection_id AND s.organization_id=NEW.organization_id;
  SELECT * INTO handoff FROM public.contract_handoffs h WHERE h.id=NEW.handoff_id AND h.organization_id=NEW.organization_id;
  IF actor IS NULL OR selection.state IS DISTINCT FROM 'approved' OR selection.handoff_id IS DISTINCT FROM NEW.handoff_id OR handoff.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Approved handoff association required'; END IF;
  IF TG_OP='INSERT' THEN
    IF actor IS DISTINCT FROM selection.decided_by_identity_id OR handoff.status<>'introduction_pending'
      OR NEW.introduced_at IS NOT NULL OR NEW.signed_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='New handoff introduction is pending'; END IF;
  ELSE
    IF (NEW.handoff_id,NEW.organization_id,NEW.selection_id) IS DISTINCT FROM (OLD.handoff_id,OLD.organization_id,OLD.selection_id)
      OR handoff.status IN ('signed','not_signed','cancelled') THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Terminal handoff evidence is immutable'; END IF;
    IF OLD.introduced_at IS NULL THEN
      IF handoff.status NOT IN ('introduction_pending','stalled') OR NEW.introduced_by_identity_id IS DISTINCT FROM actor
        OR NEW.introduced_at IS NULL OR NEW.introduced_at<handoff.approved_at OR NEW.introduced_at>clock_timestamp()
        OR NOT mmhr_private.r6_quote_text_is_valid(NEW.introduction_reference,500) OR NEW.signed_at IS NOT NULL
        OR NOT mmhr_private.r6_contract_source_is_current(selection.organization_id,selection.intake_id,selection.comparison_id,
          selection.proposal_version_id,selection.quote_revision,selection.source_hash,selection.recipient_id,selection.deal_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current approved introduction required'; END IF;
    ELSE
      IF (NEW.introduced_at,NEW.introduction_reference,NEW.introduced_by_identity_id)
        IS DISTINCT FROM (OLD.introduced_at,OLD.introduction_reference,OLD.introduced_by_identity_id)
        OR OLD.signed_at IS NOT NULL OR handoff.status<>'negotiating' OR NEW.signature_recorded_by_identity_id IS DISTINCT FROM actor
        OR NEW.signed_at IS NULL OR NEW.signed_at<NEW.introduced_at OR NEW.signed_at>clock_timestamp()
        OR NOT mmhr_private.r6_quote_text_is_valid(NEW.contract_reference,500) OR NEW.contract_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Signature record or immutable introduction denied'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_guard_contract_details()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE TRIGGER portal_contract_details_guard BEFORE INSERT OR UPDATE OR DELETE ON public.portal_contract_handoff_details
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r6_guard_contract_details();
--> statement-breakpoint
CREATE TRIGGER portal_contract_event_immutable BEFORE UPDATE OR DELETE ON public.portal_contract_handoff_events
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint
-- Existing historical handoffs remain intact. New handoffs require a live
-- customer selection and independent staff approval through the new RPC.
CREATE FUNCTION mmhr_private.r6_guard_portal_handoff_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; selection public.portal_contract_selections%ROWTYPE; detail public.portal_contract_handoff_details%ROWTYPE;
BEGIN
  IF TG_OP='INSERT' THEN
    actor:=mmhr_private.r6_contract_actor(NEW.organization_id,'staff');
    SELECT * INTO selection FROM public.portal_contract_selections s WHERE s.organization_id=NEW.organization_id AND s.deal_id=NEW.deal_id AND s.state='pending';
    IF actor IS NULL OR selection.id IS NULL OR actor=selection.selected_by_identity_id
      OR NEW.status<>'introduction_pending' OR NEW.revision<>1 OR NEW.customer_organization_id<>NEW.organization_id
      OR NEW.approved_at<selection.selected_at OR NEW.approved_at>clock_timestamp()
      OR NEW.selection_reasons IS DISTINCT FROM selection.selection_reasons OR NEW.remaining_risks IS DISTINCT FROM selection.remaining_risks
      OR NEW.approved_by_identity_ids IS DISTINCT FROM jsonb_build_array(selection.selected_by_identity_id,actor)
      OR NOT EXISTS(SELECT 1 FROM public.deals d WHERE d.id=selection.deal_id AND d.organization_id=selection.organization_id
        AND d.vendor_organization_id=NEW.vendor_organization_id)
      OR NOT mmhr_private.r6_contract_source_is_current(selection.organization_id,selection.intake_id,selection.comparison_id,
        selection.proposal_version_id,selection.quote_revision,selection.source_hash,selection.recipient_id,selection.deal_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Independent current customer selection required'; END IF;
  ELSE
    SELECT * INTO detail FROM public.portal_contract_handoff_details d WHERE d.handoff_id=OLD.id AND d.organization_id=OLD.organization_id;
    IF detail.handoff_id IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
    actor:=mmhr_private.r6_contract_actor(OLD.organization_id,'staff');
    IF TG_OP='DELETE' OR actor IS NULL OR OLD.status IN ('signed','not_signed','cancelled')
      OR (NEW.id,NEW.organization_id,NEW.deal_id,NEW.customer_organization_id,NEW.vendor_organization_id,
        NEW.selection_reasons,NEW.remaining_risks,NEW.approved_by_identity_ids,NEW.approved_at)
        IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.deal_id,OLD.customer_organization_id,OLD.vendor_organization_id,
        OLD.selection_reasons,OLD.remaining_risks,OLD.approved_by_identity_ids,OLD.approved_at)
      OR NEW.revision<>OLD.revision+1 OR NEW.revision>9999 OR NOT(CASE OLD.status
        WHEN 'introduction_pending' THEN NEW.status IN ('introduced','stalled','cancelled')
        WHEN 'introduced' THEN NEW.status IN ('negotiating','stalled','cancelled')
        WHEN 'negotiating' THEN NEW.status IN ('signed','not_signed','stalled','cancelled')
        WHEN 'stalled' THEN NEW.status IN ('introduced','negotiating','cancelled') ELSE false END)
      OR (NEW.status='introduced' AND (detail.introduced_at IS NULL OR OLD.status='stalled' AND detail.introduced_by_identity_id<>actor))
      OR (NEW.status IN ('negotiating','signed','not_signed') AND detail.introduced_at IS NULL)
      OR (NEW.status='signed' AND (detail.signed_at IS NULL OR detail.signature_recorded_by_identity_id<>actor
        OR NOT EXISTS(SELECT 1 FROM public.deals d WHERE d.id=NEW.deal_id AND d.organization_id=NEW.organization_id AND d.contract_id=detail.contract_id)))
      OR (NEW.status<>'signed' AND detail.signed_at IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Portal handoff evidence or immutable transition denied'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_guard_portal_handoff_record()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE TRIGGER portal_handoff_record_guard BEFORE INSERT OR UPDATE OR DELETE ON public.contract_handoffs
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r6_guard_portal_handoff_record();
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_guard_portal_handoff_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; handoff public.contract_handoffs%ROWTYPE; previous_status text; previous_time timestamptz;
BEGIN
  actor:=mmhr_private.r6_contract_actor(NEW.organization_id,'staff');
  SELECT * INTO handoff FROM public.contract_handoffs h WHERE h.id=NEW.handoff_id AND h.organization_id=NEW.organization_id;
  SELECT e.to_status,e.occurred_at INTO previous_status,previous_time FROM public.portal_contract_handoff_events e
    WHERE e.handoff_id=NEW.handoff_id ORDER BY e.revision DESC LIMIT 1;
  IF actor IS NULL OR handoff.id IS NULL OR NEW.actor_identity_id<>actor OR NEW.revision<>handoff.revision
    OR NEW.to_status<>handoff.status OR NEW.from_status<>coalesce(previous_status,'introduction_pending')
    OR NEW.occurred_at<coalesce(previous_time,handoff.approved_at) OR NEW.occurred_at>clock_timestamp()
    OR NOT mmhr_private.r6_quote_text_is_valid(NEW.reason,2000)
    OR (NEW.action='introduce' AND NEW.to_status<>'introduced') OR (NEW.action='record_signed' AND NEW.to_status<>'signed')
    OR (NEW.action='transition' AND NEW.to_status IN ('introduced','signed')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Audited handoff transition required'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_guard_portal_handoff_event()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE TRIGGER portal_handoff_event_guard BEFORE INSERT ON public.portal_contract_handoff_events
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r6_guard_portal_handoff_event();
--> statement-breakpoint
ALTER FUNCTION public.mmhr_record_contract_handoff(jsonb,uuid,uuid) SET SCHEMA mmhr_private;
REVOKE ALL ON FUNCTION mmhr_private.mmhr_record_contract_handoff(jsonb,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE FUNCTION public.mmhr_record_contract_handoff(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; handoff public.contract_handoffs%ROWTYPE; context record;
BEGIN
  IF payload->>'action' IS DISTINCT FROM 'transition' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Use independently approved portal contract selection'; END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'organizationId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload->'actorIdentityId') IS DISTINCT FROM 'string' OR jsonb_typeof(payload->'handoffId') IS DISTINCT FROM 'string'
    OR correlation_id IS NULL OR idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract handoff input'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access',(payload->>'organizationId')::uuid,
    'Record contract handoff',correlation_id,idempotency_key);
  IF (payload->>'actorIdentityId')::uuid IS DISTINCT FROM context.actor_identity_id
    OR mmhr_private.r6_contract_actor((payload->>'organizationId')::uuid,'staff',true)
      IS DISTINCT FROM context.actor_identity_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF;
  IF EXISTS(SELECT 1 FROM public.portal_contract_handoff_details d WHERE d.handoff_id=(payload->>'handoffId')::uuid
    AND d.organization_id=(payload->>'organizationId')::uuid) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Use the audited portal contract handoff'; END IF;
  result:=mmhr_private.mmhr_record_contract_handoff(payload,correlation_id,idempotency_key);
  SELECT * INTO handoff FROM public.contract_handoffs h WHERE h.id=(result->>'handoffId')::uuid AND h.organization_id=(result->>'organizationId')::uuid;
  RETURN result||jsonb_build_object('status',handoff.status,'revision',handoff.revision);
EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract handoff input';
END $$;
REVOKE ALL ON FUNCTION public.mmhr_record_contract_handoff(jsonb,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_contract_handoff(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
-- Managed portal deals retain their contract and finance boundary. The old
-- general deal command cannot mark them won or discard their handoff stage.
ALTER FUNCTION public.mmhr_record_deal(jsonb,uuid,uuid) SET SCHEMA mmhr_private;
REVOKE ALL ON FUNCTION mmhr_private.mmhr_record_deal(jsonb,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE FUNCTION public.mmhr_record_deal(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE context record;
BEGIN
  IF payload->>'action'='transition' THEN
    IF jsonb_typeof(payload)<>'object' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
      OR coalesce(payload->>'dealId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
      OR correlation_id IS NULL OR idempotency_key IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid deal input'; END IF;
    SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access',(payload->>'organizationId')::uuid,
      'Record deal',correlation_id,idempotency_key);
    IF (payload->>'actorIdentityId')::uuid IS DISTINCT FROM context.actor_identity_id THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF;
    IF EXISTS (
    SELECT 1 FROM public.portal_contract_handoff_details detail
    JOIN public.contract_handoffs handoff ON handoff.id=detail.handoff_id AND handoff.organization_id=detail.organization_id
    WHERE handoff.deal_id=(payload->>'dealId')::uuid AND handoff.organization_id=(payload->>'organizationId')::uuid
    ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Use the audited contract and finance workflow'; END IF;
  END IF;
  RETURN mmhr_private.mmhr_record_deal(payload,correlation_id,idempotency_key);
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid deal input';
END $$;
REVOKE ALL ON FUNCTION public.mmhr_record_deal(jsonb,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_deal(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
-- Authorized contract command.
CREATE FUNCTION public.mmhr_record_portal_contract_handoff(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE action text; org_id uuid; actor uuid; view_name text; v_intake_id uuid; fields text[];
  selection public.portal_contract_selections%ROWTYPE; source public.proposal_quote_sources%ROWTYPE;
  proposal public.proposal_versions%ROWTYPE; handoff public.contract_handoffs%ROWTYPE;
  detail public.portal_contract_handoff_details%ROWTYPE; deal public.deals%ROWTYPE;
  receipt jsonb; item jsonb; comparison_id uuid; checked_at timestamptz; business_at timestamptz;
  next_status text; old_status text; event_id uuid; v_contract_id uuid; v_correlation uuid:=correlation_id;
  next_stage text; prior_stage text; prior_revision integer;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text)>35000 OR correlation_id IS NULL OR idempotency_key IS NULL
    OR jsonb_typeof(payload->'organizationId') IS DISTINCT FROM 'string'
    OR coalesce(payload->>'action','') NOT IN ('select','withdraw_selection','approve_selection','reject_selection','introduce','transition','record_signed') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract handoff input'; END IF;
  action:=payload->>'action'; org_id:=(payload->>'organizationId')::uuid;
  fields:=CASE action
    WHEN 'select' THEN ARRAY['action','organizationId','intakeId','comparisonId','proposalVersionId','expectedQuoteRevision','selectionReasons','remainingRisks']
    WHEN 'approve_selection' THEN ARRAY['action','organizationId','selectionId','expectedRevision','reason','approvalReference']
    WHEN 'withdraw_selection' THEN ARRAY['action','organizationId','selectionId','expectedRevision','reason']
    WHEN 'reject_selection' THEN ARRAY['action','organizationId','selectionId','expectedRevision','reason']
    WHEN 'introduce' THEN ARRAY['action','organizationId','handoffId','expectedRevision','reason','introducedAt','introductionReference']
    WHEN 'transition' THEN ARRAY['action','organizationId','handoffId','expectedRevision','reason','fromStatus','toStatus']
    WHEN 'record_signed' THEN ARRAY['action','organizationId','handoffId','expectedRevision','reason','signedAt','contractReference'] END;
  IF NOT(payload ?& fields) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) key WHERE NOT(key=ANY(fields))) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract handoff fields'; END IF;
  view_name:=CASE WHEN action IN ('select','withdraw_selection') THEN 'customer' ELSE 'staff' END;
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r6_contract_actor(org_id,view_name,true);
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract handoff access denied'; END IF;
  IF action='select' THEN
    IF jsonb_typeof(payload->'intakeId') IS DISTINCT FROM 'string' OR jsonb_typeof(payload->'proposalVersionId') IS DISTINCT FROM 'string'
      OR (payload->'comparisonId'<>'null'::jsonb AND jsonb_typeof(payload->'comparisonId') IS DISTINCT FROM 'string')
      OR jsonb_typeof(payload->'expectedQuoteRevision') IS DISTINCT FROM 'number' OR payload->>'expectedQuoteRevision' !~ '^[1-9][0-9]{0,3}$'
      OR jsonb_typeof(payload->'selectionReasons') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'selectionReasons') NOT BETWEEN 1 AND 10
      OR jsonb_typeof(payload->'remainingRisks') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'remainingRisks')>20
      OR octet_length((payload->'selectionReasons')::text)>6000 OR octet_length((payload->'remainingRisks')::text)>12000 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid customer selection'; END IF;
    FOR item IN SELECT * FROM jsonb_array_elements((payload->'selectionReasons')||(payload->'remainingRisks')) LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR NOT mmhr_private.r6_quote_text_is_valid(item#>>'{}',500) THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid customer selection text'; END IF;
    END LOOP;
    v_intake_id:=(payload->>'intakeId')::uuid; comparison_id:=(payload->>'comparisonId')::uuid;
  ELSE
    IF jsonb_typeof(payload->'expectedRevision') IS DISTINCT FROM 'number' OR payload->>'expectedRevision' !~ '^[1-9][0-9]{0,3}$'
      OR jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string' OR NOT mmhr_private.r6_quote_text_is_valid(payload->>'reason',2000) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract handoff decision'; END IF;
    IF action IN ('withdraw_selection','approve_selection','reject_selection') THEN
      IF jsonb_typeof(payload->'selectionId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid selection identifier'; END IF;
      SELECT * INTO selection FROM public.portal_contract_selections s WHERE s.id=(payload->>'selectionId')::uuid AND s.organization_id=org_id;
    ELSE
      IF jsonb_typeof(payload->'handoffId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid handoff identifier'; END IF;
      SELECT s.* INTO selection FROM public.portal_contract_selections s WHERE s.handoff_id=(payload->>'handoffId')::uuid AND s.organization_id=org_id;
    END IF;
    IF selection.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract handoff association denied'; END IF;
    v_intake_id:=selection.intake_id;
    IF action='approve_selection' AND (jsonb_typeof(payload->'approvalReference') IS DISTINCT FROM 'string'
      OR NOT mmhr_private.r6_quote_text_is_valid(payload->>'approvalReference',300)) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid selection approval reference'; END IF;
    IF action IN ('introduce','record_signed') THEN
      IF jsonb_typeof(payload->(CASE action WHEN 'introduce' THEN 'introducedAt' ELSE 'signedAt' END)) IS DISTINCT FROM 'string'
        OR jsonb_typeof(payload->(CASE action WHEN 'introduce' THEN 'introductionReference' ELSE 'contractReference' END)) IS DISTINCT FROM 'string'
        OR NOT mmhr_private.r6_quote_text_is_valid(payload->>(CASE action WHEN 'introduce' THEN 'introductionReference' ELSE 'contractReference' END),500) THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract handoff evidence'; END IF;
      IF payload->>(CASE action WHEN 'introduce' THEN 'introducedAt' ELSE 'signedAt' END)
        !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Use a dated time with its timezone'; END IF;
      business_at:=(payload->>(CASE action WHEN 'introduce' THEN 'introducedAt' ELSE 'signedAt' END))::timestamptz;
      IF NOT isfinite(business_at) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract handoff date'; END IF;
    END IF;
    IF action='transition' AND (jsonb_typeof(payload->'fromStatus') IS DISTINCT FROM 'string'
      OR jsonb_typeof(payload->'toStatus') IS DISTINCT FROM 'string'
      OR payload->>'fromStatus' NOT IN ('introduction_pending','introduced','negotiating','stalled','signed','not_signed','cancelled')
      OR payload->>'toStatus' NOT IN ('negotiating','stalled','not_signed','cancelled')) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract handoff transition'; END IF;
  END IF;
  PERFORM 1 FROM public.intakes i WHERE i.id=v_intake_id AND i.organization_id=org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Customer intake association denied'; END IF;
  IF selection.id IS NOT NULL THEN SELECT * INTO selection FROM public.portal_contract_selections s WHERE s.id=selection.id FOR UPDATE; END IF;
  IF mmhr_private.r6_contract_actor(org_id,view_name,true) IS DISTINCT FROM actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract handoff authority expired'; END IF;
  receipt:=mmhr_private.r1_checked_receipt(actor,'r6.portal.contract.'||action,idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO selection FROM public.portal_contract_selections s WHERE s.id=(receipt->>'entity_id')::uuid AND s.organization_id=org_id AND s.intake_id=v_intake_id;
    IF selection.id IS NULL OR (payload ? 'selectionId' AND selection.id<>(payload->>'selectionId')::uuid)
      OR (payload ? 'handoffId' AND selection.handoff_id IS DISTINCT FROM (payload->>'handoffId')::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract handoff replay denied'; END IF;
  ELSIF action='select' THEN
    SELECT * INTO source FROM public.proposal_quote_sources s WHERE s.proposal_version_id=(payload->>'proposalVersionId')::uuid AND s.organization_id=org_id FOR UPDATE;
    SELECT * INTO proposal FROM public.proposal_versions p WHERE p.id=source.proposal_version_id AND p.organization_id=org_id;
    IF source.proposal_version_id IS NULL OR NOT mmhr_private.r6_contract_source_is_current(org_id,v_intake_id,comparison_id,source.proposal_version_id,
      (payload->>'expectedQuoteRevision')::integer,source.source_hash,source.recipient_id,proposal.deal_id)
      OR EXISTS(SELECT 1 FROM public.portal_contract_selections s LEFT JOIN public.contract_handoffs h ON h.id=s.handoff_id
        WHERE s.organization_id=org_id AND s.intake_id=v_intake_id AND (s.state='pending' OR (s.state='approved' AND h.status NOT IN ('not_signed','cancelled')))) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current source or open customer decision changed'; END IF;
    INSERT INTO public.portal_contract_selections(organization_id,intake_id,comparison_id,proposal_version_id,recipient_id,deal_id,source_hash,quote_revision,
      selection_reasons,remaining_risks,selected_by_identity_id,selected_at,correlation_id)
      VALUES(org_id,v_intake_id,comparison_id,source.proposal_version_id,source.recipient_id,proposal.deal_id,source.source_hash,source.revision,
        payload->'selectionReasons',payload->'remainingRisks',actor,clock_timestamp(),v_correlation) RETURNING * INTO selection;
  ELSIF action IN ('withdraw_selection','approve_selection','reject_selection') THEN
    IF selection.state<>'pending' OR selection.revision<>(payload->>'expectedRevision')::integer THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract selection decision changed'; END IF;
    checked_at:=clock_timestamp();
    IF action='approve_selection' THEN
      PERFORM 1 FROM public.proposal_quote_sources s WHERE s.proposal_version_id=selection.proposal_version_id FOR UPDATE;
      SELECT * INTO deal FROM public.deals d WHERE d.id=selection.deal_id AND d.organization_id=org_id FOR UPDATE;
      IF actor=selection.selected_by_identity_id OR NOT mmhr_private.r6_contract_source_is_current(org_id,v_intake_id,selection.comparison_id,
        selection.proposal_version_id,selection.quote_revision,selection.source_hash,selection.recipient_id,selection.deal_id)
        OR EXISTS(SELECT 1 FROM public.contract_handoffs h WHERE h.deal_id=deal.id AND h.status NOT IN ('not_signed','cancelled')) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current independently approved source required'; END IF;
      INSERT INTO public.contract_handoffs(organization_id,deal_id,customer_organization_id,vendor_organization_id,selection_reasons,remaining_risks,
        approved_by_identity_ids,approved_at,correlation_id)
        VALUES(org_id,selection.deal_id,org_id,deal.vendor_organization_id,selection.selection_reasons,selection.remaining_risks,
          jsonb_build_array(selection.selected_by_identity_id,actor),checked_at,v_correlation) RETURNING * INTO handoff;
    END IF;
    UPDATE public.portal_contract_selections SET state=CASE action WHEN 'withdraw_selection' THEN 'withdrawn' WHEN 'reject_selection' THEN 'rejected' ELSE 'approved' END,
      revision=2,decided_by_identity_id=actor,decided_at=checked_at,decision_reason=payload->>'reason',correlation_id=v_correlation,
      approval_reference=CASE action WHEN 'approve_selection' THEN payload->>'approvalReference' END,
      handoff_id=CASE action WHEN 'approve_selection' THEN handoff.id END WHERE id=selection.id RETURNING * INTO selection;
    IF action='approve_selection' THEN
      INSERT INTO public.portal_contract_handoff_details(handoff_id,organization_id,selection_id,correlation_id)
        VALUES(handoff.id,org_id,selection.id,v_correlation);
      IF deal.status<>'open' OR deal.contract_id IS NOT NULL OR deal.stage NOT IN ('evaluation','proposal','selection','contracting') THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current open evaluation deal required'; END IF;
      -- The approved quote and customer decision justify each remaining stage.
      -- Record these transitions now; do not invent earlier business dates.
      WHILE deal.stage<>'contracting' LOOP
        prior_stage:=deal.stage; prior_revision:=deal.revision;
        next_stage:=CASE prior_stage WHEN 'evaluation' THEN 'proposal' WHEN 'proposal' THEN 'selection' WHEN 'selection' THEN 'contracting' END;
        UPDATE public.deals SET stage=next_stage,revision=revision+1,updated_at=clock_timestamp(),correlation_id=v_correlation
          WHERE id=deal.id AND organization_id=org_id RETURNING * INTO deal;
        INSERT INTO public.deal_stage_history(organization_id,deal_id,from_stage,to_stage,from_status,to_status,
          expected_revision,actor_identity_id,occurred_at,reason,correlation_id)
          VALUES(org_id,deal.id,prior_stage,next_stage,'open','open',prior_revision,actor,deal.updated_at,
            'Approved quote and customer selection advanced the contract handoff.',v_correlation);
      END LOOP;
    END IF;
  ELSE
    SELECT * INTO handoff FROM public.contract_handoffs h WHERE h.id=selection.handoff_id AND h.organization_id=org_id FOR UPDATE;
    SELECT * INTO detail FROM public.portal_contract_handoff_details d WHERE d.handoff_id=handoff.id AND d.organization_id=org_id FOR UPDATE;
    IF selection.state<>'approved' OR handoff.id IS NULL OR detail.handoff_id IS NULL OR handoff.revision<>(payload->>'expectedRevision')::integer
      OR handoff.revision>=9999 OR handoff.status IN ('signed','not_signed','cancelled') THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract handoff status changed'; END IF;
    old_status:=handoff.status;
    IF action='introduce' THEN
      UPDATE public.portal_contract_handoff_details SET introduced_at=business_at,introduction_reference=payload->>'introductionReference',
        introduced_by_identity_id=actor,correlation_id=v_correlation WHERE handoff_id=handoff.id;
      next_status:='introduced';
    ELSIF action='record_signed' THEN
      SELECT * INTO deal FROM public.deals d WHERE d.id=selection.deal_id AND d.organization_id=org_id FOR UPDATE;
      IF deal.contract_id IS NOT NULL OR deal.status<>'open' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='A later contract requires a separate deal'; END IF;
      v_contract_id:=gen_random_uuid();
      UPDATE public.portal_contract_handoff_details SET signed_at=business_at,contract_reference=payload->>'contractReference',
        signature_recorded_by_identity_id=actor,contract_id=v_contract_id,correlation_id=v_correlation WHERE handoff_id=handoff.id;
      UPDATE public.deals SET contract_id=v_contract_id,revision=revision+1,updated_at=clock_timestamp(),correlation_id=v_correlation WHERE id=deal.id;
      next_status:='signed';
    ELSE
      next_status:=payload->>'toStatus';
      IF handoff.status<>payload->>'fromStatus' OR NOT (CASE handoff.status
        WHEN 'introduction_pending' THEN next_status IN ('stalled','cancelled')
        WHEN 'introduced' THEN next_status IN ('negotiating','stalled','cancelled')
        WHEN 'negotiating' THEN next_status IN ('stalled','not_signed','cancelled')
        WHEN 'stalled' THEN next_status='cancelled' OR (next_status='negotiating' AND detail.introduced_at IS NOT NULL)
        ELSE false END) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract handoff transition denied'; END IF;
    END IF;
    UPDATE public.contract_handoffs SET status=next_status,revision=revision+1 WHERE id=handoff.id RETURNING * INTO handoff;
    checked_at:=clock_timestamp(); event_id:=gen_random_uuid();
    INSERT INTO public.portal_contract_handoff_events(id,organization_id,handoff_id,revision,action,from_status,to_status,actor_identity_id,reason,occurred_at,correlation_id)
      VALUES(event_id,org_id,handoff.id,handoff.revision,action,old_status,next_status,actor,payload->>'reason',checked_at,v_correlation);
    INSERT INTO public.contract_handoff_history(id,organization_id,handoff_id,from_status,to_status,actor_identity_id,reason,occurred_at,correlation_id)
      VALUES(event_id,org_id,handoff.id,old_status,next_status,actor,payload->>'reason',checked_at,v_correlation);
  END IF;
  IF mmhr_private.r6_contract_actor(org_id,view_name,true) IS DISTINCT FROM actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract handoff authority expired'; END IF;
  IF receipt IS NULL THEN
    PERFORM mmhr_private.r1_finish_security_command(actor,'r6.portal.contract.'||action,'contract.handoff.'||action,
      'contract_selection',selection.id,org_id,coalesce(payload->>'reason','Record customer vendor decision'),correlation_id,idempotency_key,payload,
      NULL,jsonb_build_object('state','completed','version',selection.revision),clock_timestamp());
  END IF;
  SELECT * INTO handoff FROM public.contract_handoffs h WHERE h.id=selection.handoff_id AND h.organization_id=org_id;
  RETURN jsonb_build_object('organizationId',org_id,'correlationId',correlation_id,'selectionId',selection.id,'selectionState',selection.state,
    'selectionRevision',selection.revision,'handoffId',handoff.id,'status',handoff.status,'revision',handoff.revision,
    'outcomeCode',CASE WHEN receipt IS NULL THEN 'recorded' ELSE 'replayed' END);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract handoff input';
END $$;
REVOKE ALL ON FUNCTION public.mmhr_record_portal_contract_handoff(jsonb,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_portal_contract_handoff(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
-- Scoped portal reads. Keep source decisions private from other vendors.
CREATE FUNCTION mmhr_private.r6_contract_read_scope(payload jsonb,correlation_id uuid,history boolean DEFAULT false)
RETURNS TABLE(actor uuid,org_id uuid,view_name text,intake_id uuid,recipient_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text)>2000 OR correlation_id IS NULL
    OR NOT(payload ?& ARRAY['organizationId','view']) OR coalesce(payload->>'view','') NOT IN ('staff','customer','vendor')
    OR jsonb_typeof(payload->'organizationId') IS DISTINCT FROM 'string'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT(k=ANY(CASE WHEN history
      THEN ARRAY['organizationId','view','intakeId','recipientId','handoffId','beforeRevision']
      ELSE ARRAY['organizationId','view','intakeId','recipientId','afterId'] END))) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract handoff read'; END IF;
  org_id:=(payload->>'organizationId')::uuid; view_name:=payload->>'view';
  IF view_name='vendor' THEN
    IF jsonb_typeof(payload->'recipientId') IS DISTINCT FROM 'string' OR payload ? 'intakeId' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid vendor handoff scope'; END IF;
    recipient_id:=(payload->>'recipientId')::uuid;
  ELSE
    IF jsonb_typeof(payload->'intakeId') IS DISTINCT FROM 'string' OR payload ? 'recipientId' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid customer handoff scope'; END IF;
    intake_id:=(payload->>'intakeId')::uuid;
  END IF;
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r6_contract_actor(org_id,view_name);
  IF actor IS NULL OR (view_name='vendor' AND NOT EXISTS(SELECT 1 FROM public.rfp_recipients rr
      JOIN public.vendor_profiles vp ON vp.id=rr.vendor_profile_id AND vp.organization_id=rr.vendor_organization_id AND vp.status='active'
      JOIN public.orgs customer ON customer.id=rr.organization_id AND customer.status='active' AND NOT customer.migration_review_required
      WHERE rr.id=recipient_id AND rr.vendor_organization_id=org_id AND rr.state IN ('distributed','acknowledged','responded')))
    OR (view_name<>'vendor' AND NOT EXISTS(SELECT 1 FROM public.intakes i WHERE i.id=intake_id AND i.organization_id=org_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract handoff read denied'; END IF;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_contract_read_scope(jsonb,uuid,boolean)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_portal_contract_handoffs(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE scope record; after_id uuid; rows jsonb; next_id uuid; choices jsonb:='[]'::jsonb; eligible boolean:=false;
BEGIN
  SELECT * INTO scope FROM mmhr_private.r6_contract_read_scope(payload,correlation_id);
  IF payload ? 'afterId' THEN
    IF jsonb_typeof(payload->'afterId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid handoff cursor'; END IF;
    after_id:=(payload->>'afterId')::uuid;
  END IF;
  SELECT coalesce(jsonb_agg(result.item ORDER BY result.id),'[]'::jsonb) INTO rows FROM (
    SELECT s.id,jsonb_build_object('selectionId',s.id,'intakeId',s.intake_id,'recipientId',s.recipient_id,
      'proposalVersionId',s.proposal_version_id,'comparisonId',s.comparison_id,'vendorName',vendor.name,
      'quoteReference',q.original_quote->>'quoteReference',
      'selectionReasons',CASE WHEN scope.view_name='vendor' THEN '[]'::jsonb ELSE s.selection_reasons END,
      'remainingRisks',CASE WHEN scope.view_name='vendor' THEN '[]'::jsonb ELSE s.remaining_risks END,
      'state',s.state,'revision',s.revision,'selectedAt',s.selected_at,'decidedAt',s.decided_at,
      'decisionReason',CASE WHEN scope.view_name='staff' THEN s.decision_reason END,
      'current',mmhr_private.r6_contract_source_is_current(s.organization_id,s.intake_id,s.comparison_id,s.proposal_version_id,
        s.quote_revision,s.source_hash,s.recipient_id,s.deal_id),
      'canApprove',scope.view_name='staff' AND s.state='pending' AND scope.actor<>s.selected_by_identity_id
        AND mmhr_private.r6_contract_source_is_current(s.organization_id,s.intake_id,s.comparison_id,s.proposal_version_id,s.quote_revision,s.source_hash,s.recipient_id,s.deal_id)
        AND NOT EXISTS(SELECT 1 FROM public.contract_handoffs active WHERE active.deal_id=s.deal_id AND active.status NOT IN ('not_signed','cancelled')),
      'canReject',scope.view_name='staff' AND s.state='pending' AND scope.actor<>s.selected_by_identity_id,
      'canWithdraw',scope.view_name='customer' AND s.state='pending' AND scope.actor=s.selected_by_identity_id
        AND mmhr_private.r6_contract_actor(scope.org_id,'customer',true) IS NOT NULL,
      'handoffId',h.id,'status',h.status,'handoffRevision',h.revision,'introducedAt',d.introduced_at,
      'introductionReference',d.introduction_reference,'signedAt',d.signed_at,'contractReference',d.contract_reference,
      'canIntroduce',scope.view_name='staff' AND s.state='approved' AND d.introduced_at IS NULL AND h.status IN ('introduction_pending','stalled')
        AND mmhr_private.r6_contract_source_is_current(s.organization_id,s.intake_id,s.comparison_id,s.proposal_version_id,s.quote_revision,s.source_hash,s.recipient_id,s.deal_id),
      'canUpdate',scope.view_name='staff' AND s.state='approved' AND h.status IN ('introduction_pending','introduced','negotiating','stalled'),
      'events',coalesce((SELECT jsonb_agg(e.item ORDER BY e.revision DESC) FROM (
        SELECT ev.revision,jsonb_build_object('eventId',ev.id,'revision',ev.revision,'fromStatus',ev.from_status,'toStatus',ev.to_status,
          'reason',CASE WHEN scope.view_name='staff' THEN ev.reason ELSE 'Contract status updated.' END,'occurredAt',ev.occurred_at) item
        FROM public.portal_contract_handoff_events ev WHERE ev.organization_id=s.organization_id AND ev.handoff_id=h.id
        ORDER BY ev.revision DESC LIMIT 3) e),'[]'::jsonb),'hasMoreHistory',coalesce(h.revision>4,false)) item
    FROM public.portal_contract_selections s JOIN public.proposal_quote_sources q ON q.organization_id=s.organization_id AND q.proposal_version_id=s.proposal_version_id
    JOIN public.proposal_versions p ON p.id=s.proposal_version_id AND p.organization_id=s.organization_id
    JOIN public.orgs vendor ON vendor.id=p.vendor_organization_id
    LEFT JOIN public.contract_handoffs h ON h.id=s.handoff_id AND h.organization_id=s.organization_id
    LEFT JOIN public.portal_contract_handoff_details d ON d.handoff_id=h.id AND d.organization_id=s.organization_id
    WHERE (after_id IS NULL OR s.id>after_id) AND CASE WHEN scope.view_name='vendor'
      THEN p.vendor_organization_id=scope.org_id AND s.recipient_id=scope.recipient_id AND s.state='approved'
      ELSE s.organization_id=scope.org_id AND s.intake_id=scope.intake_id END
    ORDER BY s.id LIMIT 11) result;
  IF jsonb_array_length(rows)>10 THEN rows:=rows-10; next_id:=(rows->9->>'selectionId')::uuid; END IF;
  IF scope.view_name='customer' AND mmhr_private.r6_contract_actor(scope.org_id,'customer',true) IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.portal_contract_selections s LEFT JOIN public.contract_handoffs h ON h.id=s.handoff_id
      WHERE s.organization_id=scope.org_id AND s.intake_id=scope.intake_id AND (s.state='pending' OR (s.state='approved' AND h.status NOT IN ('not_signed','cancelled')))) THEN
    SELECT coalesce(jsonb_agg(c.item ORDER BY c.id),'[]'::jsonb) INTO choices FROM (
      SELECT q.proposal_version_id id,jsonb_build_object('comparisonId',NULL,'proposalVersionId',q.proposal_version_id,
        'quoteRevision',q.revision,'versionNumber',p.version_number,'vendorName',vendor.name,'quote',q.original_quote) item
      FROM public.proposal_quote_sources q JOIN public.proposal_versions p ON p.id=q.proposal_version_id AND p.organization_id=q.organization_id
      JOIN public.orgs vendor ON vendor.id=p.vendor_organization_id
      WHERE q.organization_id=scope.org_id AND q.intake_id=scope.intake_id
        AND mmhr_private.r6_contract_source_is_current(q.organization_id,q.intake_id,NULL,q.proposal_version_id,q.revision,q.source_hash,q.recipient_id,p.deal_id)
      ORDER BY q.proposal_version_id LIMIT 25) c;
    eligible:=jsonb_array_length(choices)>0;
  END IF;
  IF mmhr_private.r6_contract_actor(scope.org_id,scope.view_name) IS DISTINCT FROM scope.actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract read authority expired'; END IF;
  RETURN jsonb_build_object('organizationId',scope.org_id,'correlationId',correlation_id,'items',rows,'choices',choices,'canSelect',eligible,'nextCursor',next_id);
EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract handoff read';
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_portal_contract_handoffs(jsonb,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_portal_contract_handoffs(jsonb,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_portal_contract_handoff_history(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE scope record; target uuid; before_revision integer; rows jsonb; next_revision integer;
BEGIN
  SELECT * INTO scope FROM mmhr_private.r6_contract_read_scope(payload,correlation_id,true);
  IF jsonb_typeof(payload->'handoffId') IS DISTINCT FROM 'string' OR (payload ? 'beforeRevision' AND
    (jsonb_typeof(payload->'beforeRevision') IS DISTINCT FROM 'number' OR payload->>'beforeRevision' !~ '^[1-9][0-9]{0,3}$')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract history input'; END IF;
  target:=(payload->>'handoffId')::uuid; before_revision:=(payload->>'beforeRevision')::integer;
  IF NOT EXISTS(SELECT 1 FROM public.portal_contract_selections s JOIN public.proposal_versions p
      ON p.id=s.proposal_version_id AND p.organization_id=s.organization_id WHERE s.handoff_id=target AND s.state='approved'
      AND CASE WHEN scope.view_name='vendor' THEN s.recipient_id=scope.recipient_id AND p.vendor_organization_id=scope.org_id
        ELSE s.organization_id=scope.org_id AND s.intake_id=scope.intake_id END) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract history association denied'; END IF;
  SELECT coalesce(jsonb_agg(e.item ORDER BY e.revision DESC),'[]'::jsonb) INTO rows FROM (
    SELECT ev.revision,jsonb_build_object('eventId',ev.id,'revision',ev.revision,'fromStatus',ev.from_status,'toStatus',ev.to_status,
      'reason',CASE WHEN scope.view_name='staff' THEN ev.reason ELSE 'Contract status updated.' END,'occurredAt',ev.occurred_at) item
    FROM public.portal_contract_handoff_events ev WHERE ev.handoff_id=target AND (before_revision IS NULL OR ev.revision<before_revision)
    ORDER BY ev.revision DESC LIMIT 26) e;
  IF jsonb_array_length(rows)>25 THEN rows:=rows-25; next_revision:=(rows->24->>'revision')::integer; END IF;
  IF mmhr_private.r6_contract_actor(scope.org_id,scope.view_name) IS DISTINCT FROM scope.actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contract history authority expired'; END IF;
  RETURN jsonb_build_object('organizationId',scope.org_id,'correlationId',correlation_id,'handoffId',target,'events',rows,'nextRevision',next_revision);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract history input';
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_portal_contract_handoff_history(jsonb,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_portal_contract_handoff_history(jsonb,uuid) TO authenticated;
