CREATE TABLE "proposal_quote_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"source_digest" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"prepared_by_identity_id" uuid NOT NULL,
	"decided_by_identity_id" uuid,
	"decided_at" timestamp with time zone,
	"approval_reference" text,
	"reason" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_quote_comparisons_sources_ck" CHECK (jsonb_typeof("proposal_quote_comparisons"."source_snapshot") = 'array' and jsonb_array_length("proposal_quote_comparisons"."source_snapshot") between 2 and 5 and octet_length("proposal_quote_comparisons"."source_snapshot"::text) <= 180000),
	CONSTRAINT "proposal_quote_comparisons_digest_ck" CHECK ("proposal_quote_comparisons"."source_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "proposal_quote_comparisons_state_ck" CHECK ("proposal_quote_comparisons"."state" in ('draft', 'approved', 'rejected')),
	CONSTRAINT "proposal_quote_comparisons_revision_ck" CHECK (("proposal_quote_comparisons"."state" = 'draft' and "proposal_quote_comparisons"."revision" = 1 and "proposal_quote_comparisons"."decided_by_identity_id" is null and "proposal_quote_comparisons"."decided_at" is null and "proposal_quote_comparisons"."approval_reference" is null)
    or ("proposal_quote_comparisons"."state" in ('approved', 'rejected') and "proposal_quote_comparisons"."revision" = 2 and "proposal_quote_comparisons"."decided_by_identity_id" is not null and "proposal_quote_comparisons"."decided_at" is not null and "proposal_quote_comparisons"."decided_by_identity_id" <> "proposal_quote_comparisons"."prepared_by_identity_id")),
	CONSTRAINT "proposal_quote_comparisons_approval_ck" CHECK (("proposal_quote_comparisons"."state" = 'approved' and "proposal_quote_comparisons"."approval_reference" is not null) or ("proposal_quote_comparisons"."state" <> 'approved' and "proposal_quote_comparisons"."approval_reference" is null)),
	CONSTRAINT "proposal_quote_comparisons_reason_ck" CHECK (octet_length(btrim("proposal_quote_comparisons"."reason")) between 1 and 2000),
	CONSTRAINT "proposal_quote_comparisons_reference_ck" CHECK ("proposal_quote_comparisons"."approval_reference" is null or octet_length(btrim("proposal_quote_comparisons"."approval_reference")) between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "proposal_quote_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"proposal_version_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor_identity_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_quote_events_revision_ck" CHECK ("proposal_quote_events"."revision" between 1 and 10000),
	CONSTRAINT "proposal_quote_events_action_ck" CHECK ("proposal_quote_events"."action" in ('submit', 'review', 'approve', 'request_revision', 'withdraw', 'supersede')),
	CONSTRAINT "proposal_quote_events_snapshot_ck" CHECK (jsonb_typeof("proposal_quote_events"."snapshot") = 'object' and octet_length("proposal_quote_events"."snapshot"::text) <= 10000)
);
--> statement-breakpoint
CREATE TABLE "proposal_quote_sources" (
	"proposal_version_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"original_quote" jsonb NOT NULL,
	"source_hash" text NOT NULL,
	"state" text DEFAULT 'received' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"submitted_by_identity_id" uuid NOT NULL,
	"reviewed_by_identity_id" uuid,
	"reviewed_at" timestamp with time zone,
	"approved_by_identity_id" uuid,
	"approved_at" timestamp with time zone,
	"approval_reference" text,
	"reason" text,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_quote_sources_original_ck" CHECK (jsonb_typeof("proposal_quote_sources"."original_quote") = 'object' and octet_length("proposal_quote_sources"."original_quote"::text) <= 35000),
	CONSTRAINT "proposal_quote_sources_hash_ck" CHECK ("proposal_quote_sources"."source_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "proposal_quote_sources_state_ck" CHECK ("proposal_quote_sources"."state" in ('received', 'under_review', 'revision_requested', 'approved_for_comparison', 'superseded', 'withdrawn')),
	CONSTRAINT "proposal_quote_sources_revision_ck" CHECK ("proposal_quote_sources"."revision" between 1 and 10000),
	CONSTRAINT "proposal_quote_sources_review_ck" CHECK (("proposal_quote_sources"."reviewed_by_identity_id" is null) = ("proposal_quote_sources"."reviewed_at" is null)),
	CONSTRAINT "proposal_quote_sources_approval_ck" CHECK (("proposal_quote_sources"."approved_by_identity_id" is null and "proposal_quote_sources"."approved_at" is null and "proposal_quote_sources"."approval_reference" is null)
    or ("proposal_quote_sources"."approved_by_identity_id" is not null and "proposal_quote_sources"."approved_at" is not null and "proposal_quote_sources"."approval_reference" is not null
      and "proposal_quote_sources"."reviewed_by_identity_id" is not null and "proposal_quote_sources"."approved_by_identity_id" <> "proposal_quote_sources"."reviewed_by_identity_id"
      and "proposal_quote_sources"."approved_by_identity_id" <> "proposal_quote_sources"."submitted_by_identity_id" and "proposal_quote_sources"."reviewed_by_identity_id" <> "proposal_quote_sources"."submitted_by_identity_id")),
	CONSTRAINT "proposal_quote_sources_approved_ck" CHECK ("proposal_quote_sources"."state" <> 'approved_for_comparison' or "proposal_quote_sources"."approved_by_identity_id" is not null),
	CONSTRAINT "proposal_quote_sources_reason_ck" CHECK ("proposal_quote_sources"."reason" is null or octet_length(btrim("proposal_quote_sources"."reason")) between 1 and 2000),
	CONSTRAINT "proposal_quote_sources_reference_ck" CHECK ("proposal_quote_sources"."approval_reference" is null or octet_length(btrim("proposal_quote_sources"."approval_reference")) between 1 and 300),
	CONSTRAINT "proposal_quote_sources_updated_ck" CHECK ("proposal_quote_sources"."updated_at" >= "proposal_quote_sources"."created_at")
);
--> statement-breakpoint
ALTER TABLE "proposal_quote_comparisons" ADD CONSTRAINT "proposal_quote_comparisons_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_quote_comparisons" ADD CONSTRAINT "proposal_quote_comparisons_prepared_by_identity_id_identities_id_fk" FOREIGN KEY ("prepared_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_quote_comparisons" ADD CONSTRAINT "proposal_quote_comparisons_decided_by_identity_id_identities_id_fk" FOREIGN KEY ("decided_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_quote_comparisons" ADD CONSTRAINT "proposal_quote_comparisons_intake_scope_fk" FOREIGN KEY ("organization_id","intake_id") REFERENCES "public"."intakes"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_quote_events" ADD CONSTRAINT "proposal_quote_events_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_quote_events" ADD CONSTRAINT "proposal_quote_events_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_quote_sources_scope_uq" ON "proposal_quote_sources" USING btree ("organization_id","proposal_version_id");--> statement-breakpoint
ALTER TABLE "proposal_quote_events" ADD CONSTRAINT "proposal_quote_events_scope_fk" FOREIGN KEY ("organization_id","proposal_version_id") REFERENCES "public"."proposal_quote_sources"("organization_id","proposal_version_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_quote_sources" ADD CONSTRAINT "proposal_quote_sources_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_quote_sources" ADD CONSTRAINT "proposal_quote_sources_submitted_by_identity_id_identities_id_fk" FOREIGN KEY ("submitted_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_quote_sources" ADD CONSTRAINT "proposal_quote_sources_reviewed_by_identity_id_identities_id_fk" FOREIGN KEY ("reviewed_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_quote_sources" ADD CONSTRAINT "proposal_quote_sources_approved_by_identity_id_identities_id_fk" FOREIGN KEY ("approved_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_quote_sources" ADD CONSTRAINT "proposal_quote_sources_version_scope_fk" FOREIGN KEY ("organization_id","proposal_version_id") REFERENCES "public"."proposal_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_quote_sources" ADD CONSTRAINT "proposal_quote_sources_intake_scope_fk" FOREIGN KEY ("organization_id","intake_id") REFERENCES "public"."intakes"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_quote_sources" ADD CONSTRAINT "proposal_quote_sources_recipient_scope_fk" FOREIGN KEY ("organization_id","recipient_id") REFERENCES "public"."rfp_recipients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_quote_comparisons_scope_uq" ON "proposal_quote_comparisons" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "proposal_quote_comparisons_intake_idx" ON "proposal_quote_comparisons" USING btree ("organization_id","intake_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_quote_events_revision_uq" ON "proposal_quote_events" USING btree ("proposal_version_id","revision");--> statement-breakpoint
CREATE INDEX "proposal_quote_sources_recipient_idx" ON "proposal_quote_sources" USING btree ("recipient_id","proposal_version_id");--> statement-breakpoint
CREATE INDEX "proposal_quote_sources_intake_state_idx" ON "proposal_quote_sources" USING btree ("organization_id","intake_id","state");
--> statement-breakpoint
-- Expansion only. Originals and previous decisions are never rewritten.
-- Recovery revokes the new RPCs and retains quotes, comparisons, and history.
ALTER TABLE public.proposal_quote_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_quote_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_quote_comparisons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.proposal_quote_sources,public.proposal_quote_events,public.proposal_quote_comparisons
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE POLICY r6_deny_raw_quote_sources ON public.proposal_quote_sources AS RESTRICTIVE
  FOR ALL TO anon,authenticated,service_role,mmhr_worker,mmhr_document_worker USING(false) WITH CHECK(false);
CREATE POLICY r6_deny_raw_quote_events ON public.proposal_quote_events AS RESTRICTIVE
  FOR ALL TO anon,authenticated,service_role,mmhr_worker,mmhr_document_worker USING(false) WITH CHECK(false);
CREATE POLICY r6_deny_raw_quote_comparisons ON public.proposal_quote_comparisons AS RESTRICTIVE
  FOR ALL TO anon,authenticated,service_role,mmhr_worker,mmhr_document_worker USING(false) WITH CHECK(false);
CREATE TRIGGER proposal_quote_events_append_only BEFORE UPDATE OR DELETE ON public.proposal_quote_events
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER proposal_quote_events_no_truncate BEFORE TRUNCATE ON public.proposal_quote_events
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER proposal_quote_sources_no_truncate BEFORE TRUNCATE ON public.proposal_quote_sources
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER proposal_quote_comparisons_no_truncate BEFORE TRUNCATE ON public.proposal_quote_comparisons
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_quote_text_is_valid(value text,maximum_bytes integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT value IS NOT NULL AND value=btrim(value) AND octet_length(value) BETWEEN 1 AND maximum_bytes
    AND value !~ '^[[:space:]]|[[:space:]]$'
    AND regexp_replace(value,E'[\t\r\n]','','g') !~ '[[:cntrl:]]'
$$;
REVOKE ALL ON FUNCTION mmhr_private.r6_quote_text_is_valid(text,integer)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_quote_currency_is_valid(value text)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT value IS NOT NULL AND value=ANY(ARRAY[
    'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD',
    'CAD','CDF','CHF','CLP','CNY','COP','CRC','CUC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD',
    'HKD','HNL','HRK','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD',
    'MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG',
    'QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SLL','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS',
    'UAH','UGX','USD','UYU','UZS','VES','VND','VUV','WST','XAF','XCD','XCG','XDR','XOF','XPF','XSU','YER','ZAR','ZMW','ZWG','ZWL'
  ]::text[])
$$;
REVOKE ALL ON FUNCTION mmhr_private.r6_quote_currency_is_valid(text)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_quote_is_valid(value jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE keys text[]:=ARRAY['quoteReference','quoteDate','quoteSummary','pricing']; price_keys text[]:=ARRAY[
  'currency','implementationCostMinorUnits','recurringCostMinorUnits','recurringPeriod','recurringCostBasis',
  'optionalCostMinorUnits','optionalCostDescription','discountMinorUnits','discountDescription','termMonths',
  'termsAndAssumptions','customerRequestedChanges']; pricing jsonb; field text; item jsonb; quoted_date date;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'object' OR NOT(value ?& keys)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(value) k WHERE NOT(k=ANY(keys)))
    OR octet_length(value::text)>35000 OR jsonb_typeof(value->'quoteReference') IS DISTINCT FROM 'string'
    OR NOT mmhr_private.r6_quote_text_is_valid(value->>'quoteReference',200)
    OR jsonb_typeof(value->'quoteSummary') IS DISTINCT FROM 'string'
    OR NOT mmhr_private.r6_quote_text_is_valid(value->>'quoteSummary',8000) THEN RETURN false; END IF;
  IF value->'quoteDate'<>'null'::jsonb THEN
    IF jsonb_typeof(value->'quoteDate') IS DISTINCT FROM 'string' OR value->>'quoteDate' !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN false; END IF;
    quoted_date:=(value->>'quoteDate')::date;
    IF NOT isfinite(quoted_date) OR quoted_date::text<>value->>'quoteDate' THEN RETURN false; END IF;
  END IF;
  pricing:=value->'pricing';
  IF jsonb_typeof(pricing) IS DISTINCT FROM 'object' OR NOT(pricing ?& price_keys)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(pricing) k WHERE NOT(k=ANY(price_keys))) THEN RETURN false; END IF;
  IF pricing->'currency'<>'null'::jsonb AND (jsonb_typeof(pricing->'currency') IS DISTINCT FROM 'string'
    OR NOT mmhr_private.r6_quote_currency_is_valid(pricing->>'currency')) THEN RETURN false; END IF;
  FOREACH field IN ARRAY ARRAY['implementationCostMinorUnits','recurringCostMinorUnits','optionalCostMinorUnits','discountMinorUnits'] LOOP
    IF pricing->field<>'null'::jsonb THEN
      IF jsonb_typeof(pricing->field) IS DISTINCT FROM 'number' OR pricing->>field !~ '^(0|[1-9][0-9]{0,15})$'
        OR (pricing->>field)::numeric>9007199254740991 OR pricing->'currency'='null'::jsonb THEN RETURN false; END IF;
    END IF;
  END LOOP;
  IF pricing->'recurringPeriod'<>'null'::jsonb AND (jsonb_typeof(pricing->'recurringPeriod') IS DISTINCT FROM 'string'
    OR pricing->>'recurringPeriod' NOT IN ('monthly','quarterly','annual','contract_term')) THEN RETURN false; END IF;
  FOREACH field IN ARRAY ARRAY['recurringCostBasis','optionalCostDescription','discountDescription'] LOOP
    IF pricing->field<>'null'::jsonb AND (jsonb_typeof(pricing->field) IS DISTINCT FROM 'string'
      OR NOT mmhr_private.r6_quote_text_is_valid(pricing->>field,CASE field WHEN 'recurringCostBasis' THEN 500 ELSE 1000 END)) THEN RETURN false; END IF;
  END LOOP;
  IF pricing->'recurringCostMinorUnits'<>'null'::jsonb AND (pricing->'recurringPeriod'='null'::jsonb OR pricing->'recurringCostBasis'='null'::jsonb)
    OR (pricing->>'optionalCostMinorUnits')::numeric>0 AND pricing->'optionalCostDescription'='null'::jsonb
    OR (pricing->>'discountMinorUnits')::numeric>0 AND pricing->'discountDescription'='null'::jsonb THEN RETURN false; END IF;
  IF pricing->'termMonths'<>'null'::jsonb AND (jsonb_typeof(pricing->'termMonths') IS DISTINCT FROM 'number'
    OR pricing->>'termMonths' !~ '^[1-9][0-9]{0,2}$' OR (pricing->>'termMonths')::integer>600) THEN RETURN false; END IF;
  FOREACH field IN ARRAY ARRAY['termsAndAssumptions','customerRequestedChanges'] LOOP
    IF jsonb_typeof(pricing->field) IS DISTINCT FROM 'array' OR jsonb_array_length(pricing->field)>(CASE field WHEN 'termsAndAssumptions' THEN 30 ELSE 20 END) THEN RETURN false; END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(pricing->field) LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR NOT mmhr_private.r6_quote_text_is_valid(item#>>'{}',1000) THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_quote_is_valid(jsonb)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_quote_actor(requested_org uuid,requested_view text,writer boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE claims jsonb:=auth.jwt(); checked_at timestamptz:=clock_timestamp(); actor uuid; request_session uuid; permission text;
BEGIN
  permission:=CASE requested_view WHEN 'vendor' THEN 'portal.vendor.access' WHEN 'customer' THEN 'portal.customer.access' WHEN 'staff' THEN 'rfp.approve' END;
  IF permission IS NULL OR requested_org IS NULL OR claims->>'role' IS DISTINCT FROM 'authenticated'
    OR coalesce(claims->>'aal','') NOT IN ('aal1','aal2') OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims->>'iat','') !~ '^[0-9]{1,12}$'
    OR lower(coalesce(claims->>'sub','')) IS DISTINCT FROM lower(auth.uid()::text)
    OR coalesce(claims->>'session_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN RETURN NULL; END IF;
  request_session:=(claims->>'session_id')::uuid;
  IF (claims->>'exp')::numeric<=extract(epoch FROM checked_at)
    OR (claims->>'iat')::numeric>floor(extract(epoch FROM checked_at)) OR (claims->>'iat')::numeric>=(claims->>'exp')::numeric
    OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=request_session AND s.user_id=auth.uid()
      AND (s.not_after IS NULL OR s.not_after>checked_at))
    OR (claims->>'aal'='aal2' AND NOT mmhr_private.r1_session_is_aal2(auth.uid(),request_session,checked_at)) THEN RETURN NULL; END IF;
  actor:=mmhr_private.r1_request_identity_id();
  IF actor IS NULL OR NOT mmhr_private.r1_verified_identity(actor,false)
    OR NOT mmhr_private.r1_evaluate_permission(actor,permission,requested_org,claims->>'aal',checked_at,false)
    OR NOT mmhr_private.r1_evaluate_permission(actor,'workspace.access',requested_org,claims->>'aal',checked_at,false)
    OR (requested_view='staff' AND NOT mmhr_private.r1_evaluate_permission(actor,'admin.access',NULL,claims->>'aal',checked_at,false))
    OR NOT EXISTS(SELECT 1 FROM public.orgs WHERE id=requested_org AND status='active' AND NOT migration_review_required)
    OR EXISTS(SELECT 1 FROM public.identities WHERE status='recovery_pending') THEN RETURN NULL; END IF;
  IF writer AND requested_view='vendor' AND NOT EXISTS(SELECT 1 FROM public.org_members m
    WHERE m.org_id=requested_org AND m.identity_id=actor AND m.status='active' AND NOT m.migration_review_required
      AND m.role_key IN ('organization_admin','contributor')) THEN RETURN NULL; END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_quote_actor(uuid,text,boolean)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
-- A proposal uses a staff-prepared, disclosed vendor deal. Submission cannot
-- create a deal or choose another customer's request.
CREATE FUNCTION mmhr_private.r6_quote_recipient_is_current(recipient_id uuid,deal_id uuid,intake_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.rfp_recipients rr
    JOIN public.rfp_versions r ON r.id=rr.rfp_version_id AND r.organization_id=rr.organization_id
    JOIN public.deals d ON d.id=$2 AND d.organization_id=rr.organization_id AND d.vendor_organization_id=rr.vendor_organization_id
    JOIN public.evaluation_candidates c ON c.id=d.candidate_id AND c.organization_id=d.organization_id
      AND c.vendor_organization_id=d.vendor_organization_id AND c.product_id=d.product_id AND c.intake_id=$3
    JOIN public.products p ON p.id=c.product_id AND p.organization_id=c.vendor_organization_id AND p.vendor_profile_id=rr.vendor_profile_id
    JOIN public.vendor_profiles vp ON vp.id=rr.vendor_profile_id AND vp.organization_id=rr.vendor_organization_id
    JOIN public.orgs customer ON customer.id=rr.organization_id AND customer.type='customer'
    JOIN public.orgs vendor ON vendor.id=rr.vendor_organization_id AND vendor.type='vendor'
    WHERE rr.id=$1 AND rr.state IN ('distributed','acknowledged','responded') AND r.status IN ('distributed','closed')
      AND r.source_intake_id=$3 AND d.status='open' AND c.state IN ('proposed','active','selected')
      AND p.status='active' AND vp.status='active' AND customer.status='active' AND vendor.status='active'
      AND NOT customer.migration_review_required AND NOT vendor.migration_review_required
      AND EXISTS(SELECT 1 FROM public.evaluation_disclosures e WHERE e.organization_id=c.organization_id
        AND e.candidate_id=c.id AND e.product_id=c.product_id AND e.vendor_organization_id=c.vendor_organization_id)
      AND EXISTS(SELECT 1 FROM public.demo_rounds demo WHERE demo.organization_id=d.organization_id
        AND demo.deal_id=d.id AND demo.portal_recipient_id=rr.id))
$$;
REVOKE ALL ON FUNCTION mmhr_private.r6_quote_recipient_is_current(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_guard_quote_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE proposal public.proposal_versions%ROWTYPE; actor uuid;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal sources are immutable'; END IF;
  SELECT * INTO proposal FROM public.proposal_versions p WHERE p.id=NEW.proposal_version_id AND p.organization_id=NEW.organization_id;
  IF NOT FOUND OR NOT mmhr_private.r6_quote_is_valid(NEW.original_quote)
    OR NEW.source_hash IS DISTINCT FROM encode(sha256(convert_to(NEW.original_quote::text,'UTF8')),'hex')
    OR proposal.pricing IS DISTINCT FROM NEW.original_quote->'pricing'
    OR proposal.created_by_identity_id IS DISTINCT FROM NEW.submitted_by_identity_id
    OR proposal.source_references IS DISTINCT FROM jsonb_build_array('portal-proposal:'||proposal.id::text)
    OR NOT EXISTS(SELECT 1 FROM public.rfp_recipients rr JOIN public.rfp_versions r
      ON r.id=rr.rfp_version_id AND r.organization_id=rr.organization_id
      WHERE rr.id=NEW.recipient_id AND rr.organization_id=NEW.organization_id
        AND rr.vendor_organization_id=proposal.vendor_organization_id AND r.source_intake_id=NEW.intake_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal source association denied'; END IF;
  IF TG_OP='INSERT' THEN
    actor:=mmhr_private.r6_quote_actor(proposal.vendor_organization_id,'vendor',true);
    IF actor IS DISTINCT FROM NEW.submitted_by_identity_id OR actor IS NULL OR NEW.state<>'received' OR NEW.revision<>1
      OR proposal.status<>'received' OR NEW.reviewed_by_identity_id IS NOT NULL OR NEW.approved_by_identity_id IS NOT NULL
      OR NEW.reason IS NOT NULL OR NOT mmhr_private.r6_quote_recipient_is_current(NEW.recipient_id,proposal.deal_id,NEW.intake_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal submission denied'; END IF;
  ELSE
    IF (NEW.proposal_version_id,NEW.organization_id,NEW.intake_id,NEW.recipient_id,NEW.original_quote,NEW.source_hash,
      NEW.submitted_by_identity_id,NEW.created_at) IS DISTINCT FROM (OLD.proposal_version_id,OLD.organization_id,OLD.intake_id,
      OLD.recipient_id,OLD.original_quote,OLD.source_hash,OLD.submitted_by_identity_id,OLD.created_at)
      OR NEW.revision<>OLD.revision+1 OR proposal.status<>OLD.state
      OR NOT mmhr_private.r6_quote_text_is_valid(NEW.reason,2000) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal source or revision is immutable'; END IF;
    actor:=CASE WHEN NEW.state='withdrawn' THEN mmhr_private.r6_quote_actor(proposal.vendor_organization_id,'vendor',true)
      ELSE mmhr_private.r6_quote_actor(NEW.organization_id,'staff') END;
    IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal decision denied'; END IF;
    IF NEW.state='under_review' AND OLD.state='received' THEN
      IF actor=NEW.submitted_by_identity_id OR NEW.reviewed_by_identity_id IS DISTINCT FROM actor OR NEW.reviewed_at IS NULL
        OR NEW.approved_by_identity_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Independent proposal review required'; END IF;
    ELSIF NEW.state='approved_for_comparison' AND OLD.state='under_review' THEN
      IF actor IN (NEW.submitted_by_identity_id,OLD.reviewed_by_identity_id) OR NEW.approved_by_identity_id IS DISTINCT FROM actor
        OR NEW.approved_at IS NULL OR NOT mmhr_private.r6_quote_text_is_valid(NEW.approval_reference,300)
        OR (NEW.reviewed_by_identity_id,NEW.reviewed_at) IS DISTINCT FROM (OLD.reviewed_by_identity_id,OLD.reviewed_at) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Independent proposal approval required'; END IF;
    ELSIF (NEW.state='revision_requested' AND OLD.state='under_review')
      OR (NEW.state='withdrawn' AND OLD.state IN ('received','under_review','revision_requested','approved_for_comparison'))
      OR (NEW.state='superseded' AND OLD.state='approved_for_comparison') THEN
      IF (NEW.reviewed_by_identity_id,NEW.reviewed_at,NEW.approved_by_identity_id,NEW.approved_at,NEW.approval_reference)
        IS DISTINCT FROM (OLD.reviewed_by_identity_id,OLD.reviewed_at,OLD.approved_by_identity_id,OLD.approved_at,OLD.approval_reference) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal decisions are immutable'; END IF;
    ELSE RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal transition denied'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_guard_quote_source()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE TRIGGER proposal_quote_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_quote_sources
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r6_guard_quote_source();
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_guard_managed_proposal_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source public.proposal_quote_sources%ROWTYPE;
BEGIN
  SELECT * INTO source FROM public.proposal_quote_sources s WHERE s.proposal_version_id=OLD.id;
  IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  IF TG_OP='DELETE' OR (NEW.id,NEW.organization_id,NEW.deal_id,NEW.vendor_organization_id,NEW.version_number,
    NEW.received_at,NEW.source_references,NEW.pricing,NEW.created_by_identity_id,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.deal_id,OLD.vendor_organization_id,OLD.version_number,
      OLD.received_at,OLD.source_references,OLD.pricing,OLD.created_by_identity_id,OLD.created_at)
    OR NEW.status IS DISTINCT FROM source.state THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Use the immutable proposal quote workflow'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_guard_managed_proposal_version()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE TRIGGER managed_proposal_version_guard BEFORE UPDATE OR DELETE ON public.proposal_versions
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r6_guard_managed_proposal_version();
CREATE TRIGGER managed_proposal_versions_no_truncate BEFORE TRUNCATE ON public.proposal_versions
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_record_quote_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; action text; vendor_org uuid;
BEGIN
  action:=CASE NEW.state WHEN 'received' THEN 'submit' WHEN 'under_review' THEN 'review'
    WHEN 'approved_for_comparison' THEN 'approve' WHEN 'revision_requested' THEN 'request_revision'
    WHEN 'withdrawn' THEN 'withdraw' WHEN 'superseded' THEN 'supersede' END;
  SELECT vendor_organization_id INTO vendor_org FROM public.proposal_versions WHERE id=NEW.proposal_version_id;
  actor:=CASE WHEN action IN ('submit','withdraw') THEN mmhr_private.r6_quote_actor(vendor_org,'vendor',true)
    ELSE mmhr_private.r6_quote_actor(NEW.organization_id,'staff') END;
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal event denied'; END IF;
  UPDATE public.proposal_versions SET status=NEW.state WHERE id=NEW.proposal_version_id AND organization_id=NEW.organization_id;
  INSERT INTO public.proposal_quote_events(organization_id,proposal_version_id,revision,action,actor_identity_id,snapshot,correlation_id)
    VALUES(NEW.organization_id,NEW.proposal_version_id,NEW.revision,action,actor,
      jsonb_build_object('state',NEW.state,'reason',NEW.reason,'reviewedAt',NEW.reviewed_at,'approvedAt',NEW.approved_at,
        'approvalReference',NEW.approval_reference),NEW.correlation_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_record_quote_event()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE TRIGGER proposal_quote_event AFTER INSERT OR UPDATE ON public.proposal_quote_sources
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r6_record_quote_event();
--> statement-breakpoint
CREATE FUNCTION public.mmhr_record_proposal_quote(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE action text; keys text[]; org_id uuid; actor uuid; view_name text; checked_at timestamptz; receipt jsonb;
  v_correlation uuid:=correlation_id;
  source public.proposal_quote_sources%ROWTYPE; proposal public.proposal_versions%ROWTYPE;
  recipient public.rfp_recipients%ROWTYPE; target_deal uuid; target_intake uuid; last_version integer; old_state text;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL OR idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid proposal quote command'; END IF;
  action:=payload->>'action';
  keys:=CASE action WHEN 'submit' THEN ARRAY['action','organizationId','recipientId','expectedVersion','quote']
    WHEN 'approve' THEN ARRAY['action','organizationId','proposalVersionId','expectedRevision','reason','approvalReference']
    WHEN 'review' THEN ARRAY['action','organizationId','proposalVersionId','expectedRevision','reason']
    WHEN 'request_revision' THEN ARRAY['action','organizationId','proposalVersionId','expectedRevision','reason']
    WHEN 'withdraw' THEN ARRAY['action','organizationId','proposalVersionId','expectedRevision','reason'] END;
  IF keys IS NULL OR NOT(payload ?& keys) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT(k=ANY(keys)))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR jsonb_typeof(payload->'organizationId') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid proposal quote fields'; END IF;
  org_id:=(payload->>'organizationId')::uuid; view_name:=CASE WHEN action IN ('submit','withdraw') THEN 'vendor' ELSE 'staff' END;
  checked_at:=mmhr_private.r1_lock_security(); actor:=mmhr_private.r6_quote_actor(org_id,view_name,view_name='vendor');
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal quote access denied'; END IF;
  IF action='submit' THEN
    IF jsonb_typeof(payload->'recipientId') IS DISTINCT FROM 'string'
      OR coalesce(payload->>'recipientId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
      OR jsonb_typeof(payload->'expectedVersion') IS DISTINCT FROM 'number' OR payload->>'expectedVersion' !~ '^(0|[1-9][0-9]{0,3})$'
      OR NOT mmhr_private.r6_quote_is_valid(payload->'quote')
      OR (payload->'quote'->>'quoteDate')::date>(clock_timestamp() AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid original proposal quote'; END IF;
    SELECT * INTO recipient FROM public.rfp_recipients rr WHERE rr.id=(payload->>'recipientId')::uuid AND rr.vendor_organization_id=org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal recipient denied'; END IF;
    SELECT source_intake_id INTO target_intake FROM public.rfp_versions WHERE id=recipient.rfp_version_id AND organization_id=recipient.organization_id;
    SELECT d.id INTO target_deal FROM public.deals d WHERE d.organization_id=recipient.organization_id
      AND d.vendor_organization_id=org_id AND mmhr_private.r6_quote_recipient_is_current(recipient.id,d.id,target_intake)
      ORDER BY d.created_at,d.id LIMIT 1 FOR UPDATE;
    IF target_deal IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='A current disclosed proposal deal is required'; END IF;
  ELSE
    IF jsonb_typeof(payload->'proposalVersionId') IS DISTINCT FROM 'string'
      OR coalesce(payload->>'proposalVersionId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
      OR jsonb_typeof(payload->'expectedRevision') IS DISTINCT FROM 'number' OR payload->>'expectedRevision' !~ '^[1-9][0-9]{0,3}$'
      OR jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string' OR NOT mmhr_private.r6_quote_text_is_valid(payload->>'reason',2000)
      OR (action='approve' AND (jsonb_typeof(payload->'approvalReference') IS DISTINCT FROM 'string'
        OR NOT mmhr_private.r6_quote_text_is_valid(payload->>'approvalReference',300))) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid proposal decision'; END IF;
    SELECT s.* INTO source FROM public.proposal_quote_sources s JOIN public.proposal_versions p ON p.id=s.proposal_version_id
      WHERE s.proposal_version_id=(payload->>'proposalVersionId')::uuid
        AND CASE WHEN view_name='vendor' THEN p.vendor_organization_id=org_id ELSE s.organization_id=org_id END FOR UPDATE OF s;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal association denied'; END IF;
    SELECT * INTO proposal FROM public.proposal_versions WHERE id=source.proposal_version_id FOR UPDATE;
    target_deal:=proposal.deal_id; target_intake:=source.intake_id;
    SELECT * INTO recipient FROM public.rfp_recipients WHERE id=source.recipient_id AND organization_id=source.organization_id FOR UPDATE;
  END IF;
  -- Row locks can wait past expiry or revocation. Recheck the live session and
  -- recipient after those waits, including before an idempotent replay.
  IF mmhr_private.r6_quote_actor(org_id,view_name,view_name='vendor') IS DISTINCT FROM actor
    OR NOT mmhr_private.r6_quote_recipient_is_current(recipient.id,target_deal,target_intake) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal authority is no longer current'; END IF;
  receipt:=mmhr_private.r1_checked_receipt(actor,'r6.proposal.quote.'||action,idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    SELECT s.* INTO source FROM public.proposal_quote_sources s JOIN public.proposal_versions p ON p.id=s.proposal_version_id
      WHERE s.proposal_version_id=(receipt->>'entity_id')::uuid AND s.recipient_id=recipient.id
        AND CASE WHEN view_name='vendor' THEN p.vendor_organization_id=org_id ELSE s.organization_id=org_id END;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal replay denied'; END IF;
  ELSIF action='submit' THEN
    SELECT coalesce(max(version_number),0) INTO last_version FROM public.proposal_versions WHERE organization_id=recipient.organization_id AND deal_id=target_deal;
    IF last_version<>(payload->>'expectedVersion')::integer THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal version changed'; END IF;
    INSERT INTO public.proposal_versions(organization_id,deal_id,vendor_organization_id,version_number,status,received_at,source_references,pricing,created_by_identity_id)
      VALUES(recipient.organization_id,target_deal,org_id,last_version+1,'received',clock_timestamp(),jsonb_build_array('pending'),payload->'quote'->'pricing',actor) RETURNING * INTO proposal;
    UPDATE public.proposal_versions SET source_references=jsonb_build_array('portal-proposal:'||proposal.id::text) WHERE id=proposal.id;
    INSERT INTO public.proposal_quote_sources(proposal_version_id,organization_id,intake_id,recipient_id,original_quote,source_hash,submitted_by_identity_id,correlation_id)
      VALUES(proposal.id,recipient.organization_id,target_intake,recipient.id,payload->'quote',encode(sha256(convert_to((payload->'quote')::text,'UTF8')),'hex'),actor,correlation_id)
      RETURNING * INTO source;
  ELSE
    IF source.revision<>(payload->>'expectedRevision')::integer OR source.state IN ('superseded','withdrawn')
      OR (action IN ('review','approve') AND EXISTS(SELECT 1 FROM public.proposal_versions p
        WHERE p.organization_id=source.organization_id AND p.deal_id=proposal.deal_id AND p.version_number>proposal.version_number)) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal revision or version changed'; END IF;
    old_state:=source.state;
    UPDATE public.proposal_quote_sources SET state=CASE action WHEN 'review' THEN 'under_review' WHEN 'approve' THEN 'approved_for_comparison'
      WHEN 'request_revision' THEN 'revision_requested' ELSE 'withdrawn' END,revision=revision+1,reason=payload->>'reason',
      reviewed_by_identity_id=CASE WHEN action='review' THEN actor ELSE reviewed_by_identity_id END,
      reviewed_at=CASE WHEN action='review' THEN clock_timestamp() ELSE reviewed_at END,
      approved_by_identity_id=CASE WHEN action='approve' THEN actor ELSE approved_by_identity_id END,
      approved_at=CASE WHEN action='approve' THEN clock_timestamp() ELSE approved_at END,
      approval_reference=CASE WHEN action='approve' THEN payload->>'approvalReference' ELSE approval_reference END,
      updated_at=clock_timestamp(),correlation_id=v_correlation WHERE proposal_version_id=source.proposal_version_id RETURNING * INTO source;
    IF action='approve' THEN
      UPDATE public.proposal_quote_sources s SET state='superseded',revision=revision+1,reason='A newer quote received independent approval.',
        updated_at=clock_timestamp(),correlation_id=v_correlation FROM public.proposal_versions p
        WHERE p.id=s.proposal_version_id AND s.organization_id=source.organization_id AND s.intake_id=source.intake_id
          AND p.vendor_organization_id=proposal.vendor_organization_id AND s.state='approved_for_comparison' AND s.proposal_version_id<>source.proposal_version_id;
    END IF;
  END IF;
  IF receipt IS NULL THEN
    PERFORM mmhr_private.r1_finish_security_command(actor,'r6.proposal.quote.'||action,'proposal.quote.'||action,'proposal_version',source.proposal_version_id,
      source.organization_id,coalesce(payload->>'reason','Preserve original vendor portal quote'),correlation_id,idempotency_key,payload,
      NULL,jsonb_build_object('state','completed','version',source.revision),clock_timestamp());
  END IF;
  RETURN jsonb_build_object('organizationId',org_id,'correlationId',correlation_id,'proposalVersionId',source.proposal_version_id,
    'revision',source.revision,'state',source.state,'outcomeCode',CASE WHEN receipt IS NULL THEN 'recorded' ELSE 'replayed' END);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_record_proposal_quote(jsonb,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_proposal_quote(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
ALTER FUNCTION public.mmhr_record_proposal(jsonb,uuid,uuid) RENAME TO mmhr_record_legacy_proposal;
REVOKE ALL ON FUNCTION public.mmhr_record_legacy_proposal(jsonb,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE FUNCTION public.mmhr_record_proposal(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.proposal_quote_sources s
      WHERE s.proposal_version_id::text=payload->>'proposalId')
    OR EXISTS(SELECT 1 FROM public.proposal_quote_sources s JOIN public.proposal_versions p ON p.id=s.proposal_version_id
      WHERE p.deal_id::text=payload->>'dealId')
    OR (jsonb_typeof(payload->'proposalVersionIds')='array' AND EXISTS(
      SELECT 1 FROM jsonb_array_elements_text(payload->'proposalVersionIds') item
      JOIN public.proposal_quote_sources s ON s.proposal_version_id::text=item)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Use the immutable proposal quote workflow'; END IF;
  RETURN public.mmhr_record_legacy_proposal(payload,correlation_id,idempotency_key);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_record_proposal(jsonb,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_proposal(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_proposal_quotes(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE org_id uuid; view_name text; target_intake uuid; target_recipient uuid; after_id uuid; actor uuid; rows jsonb; next_id uuid;
  submission jsonb:='null'::jsonb; target_deal uuid; last_version integer;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL
    OR NOT(payload ?& ARRAY['organizationId','view']) OR coalesce(payload->>'view','') NOT IN ('staff','customer','vendor')
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('organizationId','view','intakeId','recipientId','afterId'))
    OR jsonb_typeof(payload->'organizationId') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid proposal read'; END IF;
  view_name:=payload->>'view'; org_id:=(payload->>'organizationId')::uuid;
  IF view_name='vendor' THEN
    IF NOT(payload ? 'recipientId') OR payload ? 'intakeId' OR jsonb_typeof(payload->'recipientId') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid vendor proposal scope'; END IF;
    target_recipient:=(payload->>'recipientId')::uuid;
  ELSE
    IF NOT(payload ? 'intakeId') OR payload ? 'recipientId' OR jsonb_typeof(payload->'intakeId') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid customer proposal scope'; END IF;
    target_intake:=(payload->>'intakeId')::uuid;
  END IF;
  IF payload ? 'afterId' THEN
    IF jsonb_typeof(payload->'afterId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid proposal cursor'; END IF;
    after_id:=(payload->>'afterId')::uuid;
  END IF;
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r6_quote_actor(org_id,view_name);
  IF actor IS NULL OR (view_name='vendor' AND NOT EXISTS(SELECT 1 FROM public.rfp_recipients rr
      WHERE rr.id=target_recipient AND rr.vendor_organization_id=org_id AND rr.state IN ('distributed','acknowledged','responded')))
    OR (view_name<>'vendor' AND NOT EXISTS(SELECT 1 FROM public.intakes WHERE id=target_intake AND organization_id=org_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal read denied'; END IF;
  IF view_name='vendor' THEN
    SELECT d.id INTO target_deal FROM public.rfp_recipients rr JOIN public.rfp_versions r ON r.id=rr.rfp_version_id AND r.organization_id=rr.organization_id
      JOIN public.deals d ON d.organization_id=rr.organization_id AND d.vendor_organization_id=org_id
      WHERE rr.id=target_recipient AND mmhr_private.r6_quote_recipient_is_current(rr.id,d.id,r.source_intake_id)
      ORDER BY d.created_at,d.id LIMIT 1;
    IF target_deal IS NOT NULL THEN
      SELECT coalesce(max(version_number),0) INTO last_version FROM public.proposal_versions WHERE deal_id=target_deal;
    END IF;
    submission:=jsonb_build_object('eligible',target_deal IS NOT NULL AND last_version<10000
      AND mmhr_private.r6_quote_actor(org_id,'vendor',true) IS NOT NULL,'expectedVersion',last_version);
  END IF;
  SELECT coalesce(jsonb_agg(result.item ORDER BY result.id),'[]'::jsonb) INTO rows FROM (
    SELECT s.proposal_version_id id,jsonb_build_object('proposalVersionId',s.proposal_version_id,'recipientId',s.recipient_id,
      'intakeId',s.intake_id,'versionNumber',p.version_number,'revision',s.revision,'state',s.state,'quote',s.original_quote,
      'receivedAt',p.received_at,'reviewedAt',s.reviewed_at,'approvedAt',s.approved_at,'vendorName',vendor.name,
      'current',s.state='approved_for_comparison' AND mmhr_private.r6_quote_recipient_is_current(s.recipient_id,p.deal_id,s.intake_id),
      'latest',NOT EXISTS(SELECT 1 FROM public.proposal_versions newer WHERE newer.organization_id=p.organization_id
        AND newer.deal_id=p.deal_id AND newer.version_number>p.version_number),
      'reason',CASE WHEN view_name='customer' THEN NULL ELSE s.reason END,
      'canSubmit',view_name='vendor' AND mmhr_private.r6_quote_actor(org_id,'vendor',true) IS NOT NULL
        AND mmhr_private.r6_quote_recipient_is_current(s.recipient_id,p.deal_id,s.intake_id),
      'canReview',view_name='staff' AND actor<>s.submitted_by_identity_id AND s.state='received'
        AND mmhr_private.r6_quote_recipient_is_current(s.recipient_id,p.deal_id,s.intake_id)
        AND NOT EXISTS(SELECT 1 FROM public.proposal_versions newer WHERE newer.organization_id=p.organization_id
          AND newer.deal_id=p.deal_id AND newer.version_number>p.version_number),
      'canApprove',view_name='staff' AND actor<>s.submitted_by_identity_id AND actor<>s.reviewed_by_identity_id AND s.state='under_review'
        AND mmhr_private.r6_quote_recipient_is_current(s.recipient_id,p.deal_id,s.intake_id)
        AND NOT EXISTS(SELECT 1 FROM public.proposal_versions newer WHERE newer.organization_id=p.organization_id
          AND newer.deal_id=p.deal_id AND newer.version_number>p.version_number)) item
    FROM public.proposal_quote_sources s JOIN public.proposal_versions p ON p.id=s.proposal_version_id AND p.organization_id=s.organization_id
    JOIN public.orgs vendor ON vendor.id=p.vendor_organization_id
    JOIN public.orgs customer ON customer.id=s.organization_id AND customer.status='active'
    WHERE (after_id IS NULL OR s.proposal_version_id>after_id)
      AND CASE WHEN view_name='vendor' THEN p.vendor_organization_id=org_id AND s.recipient_id=target_recipient
        ELSE s.organization_id=org_id AND s.intake_id=target_intake END
      AND (view_name<>'customer' OR s.approved_at IS NOT NULL)
      AND (view_name<>'vendor' OR EXISTS(SELECT 1 FROM public.rfp_recipients rr JOIN public.vendor_profiles vp
        ON vp.id=rr.vendor_profile_id AND vp.organization_id=rr.vendor_organization_id AND vp.status='active'
        WHERE rr.id=s.recipient_id AND rr.organization_id=s.organization_id AND rr.state IN ('distributed','acknowledged','responded')))
    ORDER BY s.proposal_version_id LIMIT 26) result;
  IF jsonb_array_length(rows)>25 THEN rows:=rows-25; next_id:=(rows->24->>'proposalVersionId')::uuid; END IF;
  IF mmhr_private.r6_quote_actor(org_id,view_name) IS DISTINCT FROM actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal read authority expired'; END IF;
  RETURN jsonb_build_object('organizationId',org_id,'correlationId',correlation_id,'items',rows,'nextCursor',next_id,'submission',submission);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_proposal_quotes(jsonb,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_proposal_quotes(jsonb,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_build_quote_snapshot(org_id uuid,intake_id uuid,version_ids jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb; vendor_count integer; currency_count integer;
BEGIN
  IF jsonb_typeof(version_ids) IS DISTINCT FROM 'array' OR jsonb_array_length(version_ids) NOT BETWEEN 2 AND 5
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(version_ids) item WHERE jsonb_typeof(item) IS DISTINCT FROM 'string'
      OR item#>>'{}' !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$')
    OR (SELECT count(DISTINCT lower(item)) FROM jsonb_array_elements_text(version_ids) item)<>jsonb_array_length(version_ids) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose two to five different proposal sources'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('proposalVersionId',s.proposal_version_id,'dealId',p.deal_id,
    'recipientId',s.recipient_id,'versionNumber',p.version_number,'vendorOrganizationId',p.vendor_organization_id,
    'vendorName',vendor.name,'sourceHash',s.source_hash,'quote',s.original_quote,'receivedAt',p.received_at,'approvedAt',s.approved_at)
    ORDER BY s.proposal_version_id),'[]'::jsonb),count(DISTINCT p.vendor_organization_id),count(DISTINCT s.original_quote->'pricing'->>'currency')
    INTO rows,vendor_count,currency_count FROM public.proposal_quote_sources s
    JOIN public.proposal_versions p ON p.id=s.proposal_version_id AND p.organization_id=s.organization_id
    JOIN public.orgs vendor ON vendor.id=p.vendor_organization_id AND vendor.status='active'
    WHERE s.organization_id=org_id AND s.intake_id=$2 AND s.state='approved_for_comparison'
      AND s.proposal_version_id IN (SELECT item::uuid FROM jsonb_array_elements_text(version_ids) item)
      AND mmhr_private.r6_quote_recipient_is_current(s.recipient_id,p.deal_id,s.intake_id);
  IF jsonb_array_length(rows)<>jsonb_array_length(version_ids) OR vendor_count<>jsonb_array_length(version_ids) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current approved quotes from different vendors are required'; END IF;
  IF currency_count>1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Compare matching currencies without conversion'; END IF;
  RETURN rows;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_build_quote_snapshot(uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_guard_quote_comparison()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; ids jsonb;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal comparisons are immutable'; END IF;
  actor:=mmhr_private.r6_quote_actor(NEW.organization_id,'staff');
  IF actor IS NULL OR NOT mmhr_private.r6_quote_text_is_valid(NEW.reason,2000)
    OR NEW.source_digest IS DISTINCT FROM encode(sha256(convert_to(NEW.source_snapshot::text,'UTF8')),'hex') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal comparison denied'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'draft' OR NEW.revision<>1 OR NEW.prepared_by_identity_id IS DISTINCT FROM actor
      OR NEW.decided_by_identity_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Prepare an independent comparison'; END IF;
  ELSE
    IF OLD.state<>'draft' OR NEW.state NOT IN ('approved','rejected') OR NEW.revision<>2 OR actor=OLD.prepared_by_identity_id
      OR NEW.decided_by_identity_id IS DISTINCT FROM actor OR NEW.decided_at IS NULL
      OR (NEW.id,NEW.organization_id,NEW.intake_id,NEW.source_snapshot,NEW.source_digest,NEW.prepared_by_identity_id,NEW.created_at)
        IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.intake_id,OLD.source_snapshot,OLD.source_digest,OLD.prepared_by_identity_id,OLD.created_at)
      OR (NEW.state='approved' AND NOT mmhr_private.r6_quote_text_is_valid(NEW.approval_reference,300)) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='An independent comparison decision is required'; END IF;
  END IF;
  IF TG_OP='INSERT' OR NEW.state='approved' THEN
    SELECT jsonb_agg(item->'proposalVersionId' ORDER BY item->>'proposalVersionId') INTO ids FROM jsonb_array_elements(NEW.source_snapshot) item;
    IF NEW.source_snapshot IS DISTINCT FROM mmhr_private.r6_build_quote_snapshot(NEW.organization_id,NEW.intake_id,ids) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal comparison sources changed'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_guard_quote_comparison()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE TRIGGER proposal_quote_comparison_guard BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_quote_comparisons
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r6_guard_quote_comparison();
--> statement-breakpoint
CREATE FUNCTION public.mmhr_record_proposal_quote_comparison(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE action text; keys text[]; org_id uuid; actor uuid; receipt jsonb; ids jsonb; snapshot jsonb;
  comparison public.proposal_quote_comparisons%ROWTYPE; v_correlation uuid:=correlation_id;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL OR idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid proposal comparison command'; END IF;
  action:=payload->>'action'; keys:=CASE action WHEN 'prepare' THEN ARRAY['action','organizationId','intakeId','proposalVersionIds','reason']
    WHEN 'approve' THEN ARRAY['action','organizationId','comparisonId','expectedRevision','expectedDigest','reason','approvalReference']
    WHEN 'reject' THEN ARRAY['action','organizationId','comparisonId','expectedRevision','expectedDigest','reason'] END;
  IF keys IS NULL OR NOT(payload ?& keys) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT(k=ANY(keys)))
    OR jsonb_typeof(payload->'organizationId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string' OR NOT mmhr_private.r6_quote_text_is_valid(payload->>'reason',2000) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid proposal comparison fields'; END IF;
  org_id:=(payload->>'organizationId')::uuid;
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r6_quote_actor(org_id,'staff');
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal comparison access denied'; END IF;
  IF action='prepare' THEN
    IF jsonb_typeof(payload->'intakeId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid comparison intake'; END IF;
    -- Validate identifiers before acquiring source locks.
    snapshot:=mmhr_private.r6_build_quote_snapshot(org_id,(payload->>'intakeId')::uuid,payload->'proposalVersionIds');
    ids:=payload->'proposalVersionIds';
  ELSE
    IF jsonb_typeof(payload->'comparisonId') IS DISTINCT FROM 'string' OR payload->'expectedRevision' IS DISTINCT FROM '1'::jsonb
      OR jsonb_typeof(payload->'expectedDigest') IS DISTINCT FROM 'string' OR payload->>'expectedDigest' !~ '^[a-f0-9]{64}$'
      OR (action='approve' AND (jsonb_typeof(payload->'approvalReference') IS DISTINCT FROM 'string'
        OR NOT mmhr_private.r6_quote_text_is_valid(payload->>'approvalReference',300))) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid comparison decision'; END IF;
    SELECT * INTO comparison FROM public.proposal_quote_comparisons c WHERE c.id=(payload->>'comparisonId')::uuid AND c.organization_id=org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal comparison association denied'; END IF;
    SELECT jsonb_agg(item->'proposalVersionId') INTO ids FROM jsonb_array_elements(comparison.source_snapshot) item;
  END IF;
  PERFORM 1 FROM public.proposal_quote_sources s WHERE s.proposal_version_id IN (SELECT item::uuid FROM jsonb_array_elements_text(ids) item)
    ORDER BY s.proposal_version_id FOR UPDATE;
  IF mmhr_private.r6_quote_actor(org_id,'staff') IS DISTINCT FROM actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Comparison authority expired'; END IF;
  receipt:=mmhr_private.r1_checked_receipt(actor,'r6.proposal.comparison.'||action,idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO comparison FROM public.proposal_quote_comparisons c WHERE c.id=(receipt->>'entity_id')::uuid AND c.organization_id=org_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Comparison replay denied'; END IF;
  ELSIF action='prepare' THEN
    snapshot:=mmhr_private.r6_build_quote_snapshot(org_id,(payload->>'intakeId')::uuid,ids);
    INSERT INTO public.proposal_quote_comparisons(organization_id,intake_id,source_snapshot,source_digest,prepared_by_identity_id,reason,correlation_id)
      VALUES(org_id,(payload->>'intakeId')::uuid,snapshot,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),actor,payload->>'reason',correlation_id) RETURNING * INTO comparison;
  ELSE
    IF comparison.state<>'draft' OR comparison.revision<>1 OR comparison.source_digest<>payload->>'expectedDigest' THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Comparison revision or digest changed'; END IF;
    UPDATE public.proposal_quote_comparisons SET state=CASE action WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
      revision=2,decided_by_identity_id=actor,decided_at=clock_timestamp(),reason=payload->>'reason',correlation_id=v_correlation,
      approval_reference=CASE action WHEN 'approve' THEN payload->>'approvalReference' END WHERE id=comparison.id RETURNING * INTO comparison;
  END IF;
  IF receipt IS NULL THEN
    PERFORM mmhr_private.r1_finish_security_command(actor,'r6.proposal.comparison.'||action,'proposal.comparison.'||action,
      'proposal_quote_comparison',comparison.id,org_id,payload->>'reason',correlation_id,idempotency_key,payload,NULL,
      jsonb_build_object('state',comparison.state,'version',comparison.revision),clock_timestamp());
  END IF;
  RETURN jsonb_build_object('organizationId',org_id,'correlationId',correlation_id,'comparisonId',comparison.id,'state',comparison.state,
    'revision',comparison.revision,'sourceDigest',comparison.source_digest,'outcomeCode',CASE WHEN receipt IS NULL THEN 'recorded' ELSE 'replayed' END);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_record_proposal_quote_comparison(jsonb,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_proposal_quote_comparison(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r6_quote_comparison_is_current(org_id uuid,intake_id uuid,snapshot jsonb)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements($3) item WHERE NOT EXISTS(
    SELECT 1 FROM public.proposal_quote_sources s JOIN public.proposal_versions p ON p.id=s.proposal_version_id
    WHERE s.organization_id=$1 AND s.intake_id=$2 AND s.proposal_version_id=(item->>'proposalVersionId')::uuid
      AND s.state='approved_for_comparison' AND s.source_hash=item->>'sourceHash' AND s.original_quote=item->'quote'
      AND mmhr_private.r6_quote_recipient_is_current(s.recipient_id,p.deal_id,s.intake_id)))
$$;
REVOKE ALL ON FUNCTION mmhr_private.r6_quote_comparison_is_current(uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_proposal_quote_comparisons(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE org_id uuid; target_intake uuid; view_name text; after_id uuid; actor uuid; rows jsonb; next_id uuid;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL
    OR NOT(payload ?& ARRAY['organizationId','intakeId','view'])
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('organizationId','intakeId','view','afterId'))
    OR coalesce(payload->>'view','') NOT IN ('staff','customer')
    OR jsonb_typeof(payload->'organizationId') IS DISTINCT FROM 'string' OR jsonb_typeof(payload->'intakeId') IS DISTINCT FROM 'string'
    OR (payload ? 'afterId' AND jsonb_typeof(payload->'afterId') IS DISTINCT FROM 'string') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid proposal comparison read'; END IF;
  org_id:=(payload->>'organizationId')::uuid; target_intake:=(payload->>'intakeId')::uuid;
  view_name:=payload->>'view'; after_id:=(payload->>'afterId')::uuid;
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r6_quote_actor(org_id,view_name);
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.intakes WHERE id=target_intake AND organization_id=org_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal comparison read denied'; END IF;
  -- Five large snapshots keep the response below the application's response budget.
  SELECT coalesce(jsonb_agg(result.item ORDER BY result.id),'[]'::jsonb) INTO rows FROM (
    SELECT c.id,jsonb_build_object('comparisonId',c.id,'intakeId',c.intake_id,'state',c.state,'revision',c.revision,
      'createdAt',c.created_at,'decidedAt',c.decided_at,'sourceDigest',CASE WHEN view_name='staff' THEN c.source_digest ELSE NULL END,
      'current',mmhr_private.r6_quote_comparison_is_current(c.organization_id,c.intake_id,c.source_snapshot),
      'canApprove',view_name='staff' AND c.state='draft' AND actor<>c.prepared_by_identity_id
        AND mmhr_private.r6_quote_comparison_is_current(c.organization_id,c.intake_id,c.source_snapshot),
      'canReject',view_name='staff' AND c.state='draft' AND actor<>c.prepared_by_identity_id,
      'reason',CASE WHEN view_name='staff' THEN c.reason ELSE NULL END,
      'sources',(SELECT jsonb_agg(jsonb_build_object('proposalVersionId',item->'proposalVersionId','versionNumber',item->'versionNumber',
        'vendorName',item->'vendorName','quote',item->'quote','receivedAt',item->'receivedAt','approvedAt',item->'approvedAt')
        ORDER BY item->>'proposalVersionId') FROM jsonb_array_elements(c.source_snapshot) item)) item
    FROM public.proposal_quote_comparisons c WHERE c.organization_id=org_id AND c.intake_id=target_intake
      AND (after_id IS NULL OR c.id>after_id) AND (view_name='staff' OR c.state='approved') ORDER BY c.id LIMIT 6) result;
  IF jsonb_array_length(rows)>5 THEN rows:=rows-5; next_id:=(rows->4->>'comparisonId')::uuid; END IF;
  IF mmhr_private.r6_quote_actor(org_id,view_name) IS DISTINCT FROM actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Comparison read authority expired'; END IF;
  RETURN jsonb_build_object('organizationId',org_id,'correlationId',correlation_id,'items',rows,'nextCursor',next_id);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_proposal_quote_comparisons(jsonb,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_proposal_quote_comparisons(jsonb,uuid) TO authenticated;
