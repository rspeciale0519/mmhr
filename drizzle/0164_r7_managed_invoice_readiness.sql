CREATE TABLE "managed_invoice_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"preparation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_identity_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"request" jsonb NOT NULL,
	"request_digest" text NOT NULL,
	"invoice_snapshot" jsonb NOT NULL,
	"preparation_snapshot" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "managed_invoice_events_action_ck" CHECK ("managed_invoice_events"."action" in ('prepare_invoice','approve_invoice','reject_invoice','issue_invoice')),
	CONSTRAINT "managed_invoice_events_evidence_ck" CHECK ("managed_invoice_events"."request_digest" ~ '^[a-f0-9]{64}$' and jsonb_typeof("managed_invoice_events"."request") = 'object'
    and jsonb_typeof("managed_invoice_events"."invoice_snapshot") = 'object' and jsonb_typeof("managed_invoice_events"."preparation_snapshot") = 'object'
    and jsonb_typeof("managed_invoice_events"."result") = 'object' and octet_length("managed_invoice_events"."request"::text) <= 100000
    and octet_length("managed_invoice_events"."invoice_snapshot"::text) <= 100000 and octet_length("managed_invoice_events"."preparation_snapshot"::text) <= 600000)
);
--> statement-breakpoint
CREATE TABLE "managed_invoice_preparations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"commission_event_id" uuid NOT NULL,
	"calculation_id" uuid NOT NULL,
	"expected_event_revision" integer NOT NULL,
	"expected_invoice_revision" integer NOT NULL,
	"owner_identity_id" uuid NOT NULL,
	"amount_minor_units" bigint NOT NULL,
	"currency" text NOT NULL,
	"invoice_number" text NOT NULL,
	"issue_date" timestamp with time zone NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"collection_terms" text NOT NULL,
	"supporting_sources" jsonb NOT NULL,
	"source_observation" jsonb NOT NULL,
	"source_digest" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"prepared_by_identity_id" uuid NOT NULL,
	"prepared_at" timestamp with time zone NOT NULL,
	"correlation_id" uuid NOT NULL,
	"prepare_receipt_id" uuid NOT NULL,
	"prepare_request" jsonb NOT NULL,
	"prepare_request_digest" text NOT NULL,
	"decided_by_identity_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_receipt_id" uuid,
	"decision_request" jsonb,
	"decision_request_digest" text,
	"decision_correlation_id" uuid,
	CONSTRAINT "managed_invoice_preparations_value_ck" CHECK ("managed_invoice_preparations"."amount_minor_units" between 0 and 9007199254740991 and "managed_invoice_preparations"."currency" ~ '^[A-Z]{3}$'
    and "managed_invoice_preparations"."expected_event_revision" > 0 and "managed_invoice_preparations"."expected_invoice_revision" >= 0 and "managed_invoice_preparations"."due_date" >= "managed_invoice_preparations"."issue_date"),
	CONSTRAINT "managed_invoice_preparations_evidence_ck" CHECK ("managed_invoice_preparations"."source_digest" ~ '^[a-f0-9]{64}$' and "managed_invoice_preparations"."prepare_request_digest" ~ '^[a-f0-9]{64}$'
    and jsonb_typeof("managed_invoice_preparations"."supporting_sources") = 'array' and jsonb_array_length("managed_invoice_preparations"."supporting_sources") between 2 and 10
    and jsonb_typeof("managed_invoice_preparations"."source_observation") = 'object' and jsonb_typeof("managed_invoice_preparations"."prepare_request") = 'object'
    and octet_length("managed_invoice_preparations"."source_observation"::text) <= 400000 and octet_length("managed_invoice_preparations"."prepare_request"::text) <= 100000),
	CONSTRAINT "managed_invoice_preparations_decision_ck" CHECK (("managed_invoice_preparations"."state" = 'pending' and "managed_invoice_preparations"."revision" = 1
    and "managed_invoice_preparations"."decided_by_identity_id" is null and "managed_invoice_preparations"."decided_at" is null and "managed_invoice_preparations"."decision_receipt_id" is null
    and "managed_invoice_preparations"."decision_request" is null and "managed_invoice_preparations"."decision_request_digest" is null and "managed_invoice_preparations"."decision_correlation_id" is null)
    or ("managed_invoice_preparations"."state" in ('approved','rejected') and "managed_invoice_preparations"."revision" = 2 and "managed_invoice_preparations"."decided_by_identity_id" is not null
    and "managed_invoice_preparations"."decided_by_identity_id" <> "managed_invoice_preparations"."prepared_by_identity_id" and "managed_invoice_preparations"."decided_at" >= "managed_invoice_preparations"."prepared_at"
    and "managed_invoice_preparations"."decided_at" is not null and "managed_invoice_preparations"."decision_receipt_id" is not null and jsonb_typeof("managed_invoice_preparations"."decision_request") = 'object'
    and "managed_invoice_preparations"."decision_request_digest" is not null and "managed_invoice_preparations"."decision_request_digest" ~ '^[a-f0-9]{64}$' and "managed_invoice_preparations"."decision_correlation_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "finance_invoices" ADD COLUMN "source_mode" text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
ALTER TABLE "finance_invoices" ADD COLUMN "invoice_revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "finance_invoices" ADD COLUMN "current_preparation_id" uuid;
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_invoice_events_receipt_uq" ON "managed_invoice_events" USING btree ("receipt_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_invoice_events_action_uq" ON "managed_invoice_events" USING btree ("preparation_id","action");
--> statement-breakpoint
CREATE INDEX "managed_invoice_events_scope_idx" ON "managed_invoice_events" USING btree ("organization_id","invoice_id","occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_invoice_preparations_scope_uq" ON "managed_invoice_preparations" USING btree ("organization_id","invoice_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_invoice_preparations_lineage_uq" ON "managed_invoice_preparations" USING btree ("invoice_id","expected_invoice_revision");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_invoices_event_identity_uq" ON "finance_invoices" USING btree ("organization_id","id","commission_event_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_invoices_managed_active_uq" ON "finance_invoices" USING btree ("organization_id","commission_event_id") WHERE "finance_invoices"."source_mode" = 'managed' and "finance_invoices"."status" <> 'voided';
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_commission_calculations_event_identity_uq" ON "managed_commission_calculations" USING btree ("organization_id","commission_event_id","id");
--> statement-breakpoint
ALTER TABLE "managed_invoice_events" ADD CONSTRAINT "managed_invoice_events_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_invoice_events" ADD CONSTRAINT "managed_invoice_events_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_invoice_events" ADD CONSTRAINT "managed_invoice_events_preparation_fk" FOREIGN KEY ("organization_id","invoice_id","preparation_id") REFERENCES "public"."managed_invoice_preparations"("organization_id","invoice_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_invoice_preparations" ADD CONSTRAINT "managed_invoice_preparations_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_invoice_preparations" ADD CONSTRAINT "managed_invoice_preparations_owner_identity_id_identities_id_fk" FOREIGN KEY ("owner_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_invoice_preparations" ADD CONSTRAINT "managed_invoice_preparations_prepared_by_identity_id_identities_id_fk" FOREIGN KEY ("prepared_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_invoice_preparations" ADD CONSTRAINT "managed_invoice_preparations_prepare_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("prepare_receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_invoice_preparations" ADD CONSTRAINT "managed_invoice_preparations_decided_by_identity_id_identities_id_fk" FOREIGN KEY ("decided_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_invoice_preparations" ADD CONSTRAINT "managed_invoice_preparations_decision_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("decision_receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_invoice_preparations" ADD CONSTRAINT "managed_invoice_preparations_invoice_fk" FOREIGN KEY ("organization_id","invoice_id","commission_event_id") REFERENCES "public"."finance_invoices"("organization_id","id","commission_event_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_invoice_preparations" ADD CONSTRAINT "managed_invoice_preparations_event_fk" FOREIGN KEY ("organization_id","commission_event_id") REFERENCES "public"."commission_events"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_invoice_preparations" ADD CONSTRAINT "managed_invoice_preparations_calculation_fk" FOREIGN KEY ("organization_id","commission_event_id","calculation_id") REFERENCES "public"."managed_commission_calculations"("organization_id","commission_event_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_invoices" ADD CONSTRAINT "finance_invoices_managed_mode_ck" CHECK (("finance_invoices"."source_mode" = 'legacy' and "finance_invoices"."invoice_revision" = 0 and "finance_invoices"."current_preparation_id" is null) or ("finance_invoices"."source_mode" = 'managed' and "finance_invoices"."invoice_revision" > 0 and "finance_invoices"."current_preparation_id" is not null));
--> statement-breakpoint
-- Scratch draft. Install after reviewed generated DDL. No migration number is assigned.
CREATE FUNCTION mmhr_private.r7_invoice_sources_input_ok(p jsonb,reviewed boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE v_s jsonb; v_keys text[]:=ARRAY['organizationId','documentId','versionId','sha256'];
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p) NOT BETWEEN 2 AND 10 THEN RETURN false; END IF;
  IF reviewed THEN v_keys:=v_keys||ARRAY['reviewedAccessId']; END IF;
  FOR v_s IN SELECT value FROM jsonb_array_elements(p) LOOP
    IF mmhr_private.r7_managed_exact_keys(v_s,v_keys) IS NOT TRUE
      OR mmhr_private.r7_managed_uuid(v_s->'organizationId') IS NOT TRUE
      OR mmhr_private.r7_managed_uuid(v_s->'documentId') IS NOT TRUE
      OR mmhr_private.r7_managed_uuid(v_s->'versionId') IS NOT TRUE
      OR jsonb_typeof(v_s->'sha256') IS DISTINCT FROM 'string' OR coalesce(v_s->>'sha256','') !~ '^[a-f0-9]{64}$'
      OR (reviewed AND mmhr_private.r7_managed_uuid(v_s->'reviewedAccessId') IS NOT TRUE) THEN RETURN false; END IF;
  END LOOP;
  RETURN (SELECT count(*)=count(DISTINCT (value->>'organizationId',value->>'documentId',value->>'versionId')) FROM jsonb_array_elements(p));
END $$;

CREATE FUNCTION mmhr_private.r7_invoice_command_input_ok(p jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE v_keys text[]:=ARRAY['organizationId','action','reason','invoiceId','preparationId','commissionEventId',
  'expectedEventRevision','expectedInvoiceRevision','expectedSourceDigest']; v_a text:=p->>'action'; v_k text;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>100000 THEN RETURN false; END IF;
  FOREACH v_k IN ARRAY ARRAY['organizationId','invoiceId','preparationId','commissionEventId'] LOOP
    IF mmhr_private.r7_managed_uuid(p->v_k) IS NOT TRUE THEN RETURN false; END IF;
  END LOOP;
  IF mmhr_private.r7_managed_integer(p->'expectedEventRevision',1,2147483646) IS NOT TRUE
    OR jsonb_typeof(p->'expectedSourceDigest') IS DISTINCT FROM 'string'
    OR coalesce(p->>'expectedSourceDigest','') !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p->'reason') IS DISTINCT FROM 'string' OR btrim(p->>'reason') IS DISTINCT FROM p->>'reason'
    OR length(p->>'reason') NOT BETWEEN 1 AND 500 OR mmhr_private.r1_security_reason_is_safe(p->>'reason') IS NOT TRUE THEN RETURN false; END IF;
  IF v_a='prepare_invoice' THEN
    v_keys:=v_keys||ARRAY['calculationId','ownerIdentityId','invoiceNumber','issueDate','dueDate','collectionTerms','supportingSources'];
    IF mmhr_private.r7_managed_uuid(p->'calculationId') IS NOT TRUE OR mmhr_private.r7_managed_uuid(p->'ownerIdentityId') IS NOT TRUE
      OR mmhr_private.r7_managed_integer(p->'expectedInvoiceRevision',0,2147483646) IS NOT TRUE
      OR mmhr_private.r7_managed_reference(p->'invoiceNumber') IS NOT TRUE OR length(p->>'invoiceNumber')>100
      OR btrim(p->>'invoiceNumber') IS DISTINCT FROM p->>'invoiceNumber'
      OR mmhr_private.r7_managed_reference(p->'collectionTerms') IS NOT TRUE OR btrim(p->>'collectionTerms') IS DISTINCT FROM p->>'collectionTerms'
      OR mmhr_private.r7_managed_instant(p->'issueDate') IS NOT TRUE OR mmhr_private.r7_managed_instant(p->'dueDate') IS NOT TRUE
      OR mmhr_private.r7_invoice_sources_input_ok(p->'supportingSources') IS NOT TRUE THEN RETURN false; END IF;
    IF (p->>'dueDate')::timestamptz<(p->>'issueDate')::timestamptz THEN RETURN false; END IF;
  ELSIF v_a IN ('approve_invoice','reject_invoice') THEN
    v_keys:=v_keys||ARRAY['expectedPreparationRevision','contentsReviewed','reviewReference','reviewedSources'];
    IF p->'expectedPreparationRevision' IS DISTINCT FROM '1'::jsonb OR p->'contentsReviewed' IS DISTINCT FROM 'true'::jsonb
      OR mmhr_private.r7_managed_reference(p->'reviewReference') IS NOT TRUE OR btrim(p->>'reviewReference') IS DISTINCT FROM p->>'reviewReference'
      OR mmhr_private.r7_invoice_sources_input_ok(p->'reviewedSources',true) IS NOT TRUE THEN RETURN false; END IF;
  ELSIF v_a='issue_invoice' THEN
    v_keys:=v_keys||ARRAY['expectedPreparationRevision'];
    IF p->'expectedPreparationRevision' IS DISTINCT FROM '2'::jsonb THEN RETURN false; END IF;
  ELSE RETURN false; END IF;
  RETURN mmhr_private.r7_managed_exact_keys(p,v_keys) AND (v_a='prepare_invoice'
    OR mmhr_private.r7_managed_integer(p->'expectedInvoiceRevision',1,2147483646));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $$;

CREATE FUNCTION mmhr_private.r7_invoice_owner_ok(p_owner uuid,p_customer uuid,p_internal uuid,p_time timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT mmhr_private.r1_verified_identity(p_owner,true)
    AND (SELECT count(*)=2 FROM public.orgs o WHERE o.id IN(p_customer,p_internal) AND o.status='active' AND NOT o.migration_review_required)
    AND EXISTS(SELECT 1 FROM public.orgs o WHERE o.id=p_internal AND o.type='internal')
    AND EXISTS(SELECT 1 FROM public.orgs o WHERE o.id=p_customer AND o.type='customer')
    AND EXISTS(SELECT 1 FROM public.org_members m WHERE m.identity_id=p_owner AND m.org_id=p_internal AND m.status='active' AND NOT m.migration_review_required)
    AND EXISTS(SELECT 1 FROM public.org_members m WHERE m.identity_id=p_owner AND m.org_id=p_customer AND m.status='active' AND NOT m.migration_review_required)
    AND mmhr_private.r1_evaluate_permission(p_owner,'admin.access',NULL,'aal2',p_time,false)
    AND mmhr_private.r1_evaluate_permission(p_owner,'workspace.access',p_customer,'aal2',p_time,false)
    AND mmhr_private.r1_evaluate_permission(p_owner,'finance.manage',p_customer,'aal2',p_time,false)
    AND mmhr_private.r1_evaluate_permission(p_owner,'workspace.access',p_internal,'aal2',p_time,false)
    AND mmhr_private.r1_evaluate_permission(p_owner,'finance.manage',p_internal,'aal2',p_time,false)
$$;

CREATE FUNCTION mmhr_private.r7_invoice_actor(p_org uuid,p_event uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_actor uuid:=mmhr_private.r7_finance_document_actor(p_org); v_internal_org uuid;
BEGIN
  SELECT s.agreement_organization_id INTO v_internal_org FROM public.managed_commission_sources s
    JOIN public.commission_events e ON e.id=s.commission_event_id AND e.organization_id=s.organization_id
    WHERE e.id=p_event AND e.organization_id=p_org AND e.source_mode='managed';
  IF v_actor IS NULL OR v_internal_org IS NULL OR mmhr_private.r7_finance_document_actor(v_internal_org) IS DISTINCT FROM v_actor THEN RETURN NULL; END IF;
  RETURN v_actor;
END $$;

CREATE FUNCTION mmhr_private.r7_invoice_originals_ok(p_event uuid,p_calculation uuid,p_sources jsonb,p_live boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_s jsonb; v_binding jsonb; v_source public.managed_commission_sources%ROWTYPE; v_calculation public.managed_commission_calculations%ROWTYPE;
  v_agreement public.finance_agreement_versions%ROWTYPE; v_facts public.finance_contract_facts_versions%ROWTYPE; v_vendor_org uuid;
BEGIN
  IF mmhr_private.r7_invoice_sources_input_ok(p_sources) IS NOT TRUE THEN RETURN false; END IF;
  SELECT * INTO v_source FROM public.managed_commission_sources x WHERE x.commission_event_id=p_event;
  SELECT * INTO v_calculation FROM public.managed_commission_calculations c WHERE c.id=p_calculation
    AND c.commission_event_id=p_event AND c.organization_id=v_source.organization_id AND c.contract_id=v_source.contract_id AND c.state='approved';
  SELECT * INTO v_agreement FROM public.finance_agreement_versions a WHERE a.id=v_source.agreement_version_id
    AND a.organization_id=v_source.agreement_organization_id AND a.agreement_id=v_source.agreement_id AND a.state='approved';
  SELECT a.vendor_organization_id INTO v_vendor_org FROM public.finance_agreement_series a
    WHERE a.id=v_agreement.agreement_id AND a.organization_id=v_agreement.organization_id;
  SELECT * INTO v_facts FROM public.finance_contract_facts_versions f WHERE f.id=v_calculation.facts_version_id
    AND f.organization_id=v_source.organization_id AND f.contract_id=v_source.contract_id AND f.handoff_id=v_source.handoff_id AND f.state='approved';
  IF v_source.commission_event_id IS NULL OR v_calculation.id IS NULL OR v_agreement.id IS NULL OR v_facts.id IS NULL OR v_vendor_org IS NULL
    OR NOT p_sources @> jsonb_build_array(jsonb_build_object('organizationId',v_agreement.organization_id,'documentId',v_agreement.source_document_id,
      'versionId',v_agreement.source_version_id,'sha256',v_agreement.source_sha256))
    OR NOT p_sources @> jsonb_build_array(jsonb_build_object('organizationId',v_facts.organization_id,'documentId',v_facts.source_document_id,
      'versionId',v_facts.source_version_id,'sha256',v_facts.source_sha256)) THEN RETURN false; END IF;
  FOR v_s IN SELECT value FROM jsonb_array_elements(p_sources) LOOP
    SELECT f.source_snapshot INTO v_binding FROM public.finance_document_sources f WHERE f.organization_id=(v_s->>'organizationId')::uuid
      AND f.document_id=(v_s->>'documentId')::uuid AND f.version_id=(v_s->>'versionId')::uuid;
    IF v_binding IS NULL OR (v_binding->>'vendorOrganizationId')::uuid IS DISTINCT FROM v_vendor_org
      OR NOT ((v_binding->>'sourceClass'='agreement' AND (v_s->>'organizationId')::uuid=v_agreement.organization_id)
        OR (v_binding->>'sourceClass'='signed_contract' AND (v_s->>'organizationId')::uuid=v_source.organization_id
          AND (v_binding->>'contractId')::uuid=v_source.contract_id AND (v_binding->>'handoffId')::uuid=v_source.handoff_id
          AND v_binding->>'dealId'=v_source.source_snapshot->>'dealId'))
      OR mmhr_private.r7_managed_original_retained_ok((v_s->>'organizationId')::uuid,(v_s->>'documentId')::uuid,(v_s->>'versionId')::uuid,v_s->>'sha256',v_binding) IS NOT TRUE
      OR (p_live AND mmhr_private.r7_finance_document_source_valid((v_s->>'organizationId')::uuid,v_binding) IS NOT TRUE) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;

CREATE FUNCTION mmhr_private.r7_invoice_observation(p_org uuid,p_event uuid,p_calculation uuid,p_sources jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_event public.commission_events%ROWTYPE; v_calculation public.managed_commission_calculations%ROWTYPE;
  v_source public.managed_commission_sources%ROWTYPE; v_latest_facts uuid; v_tips jsonb;
BEGIN
  IF mmhr_private.r7_invoice_actor(p_org,p_event) IS NULL OR mmhr_private.r7_invoice_originals_ok(p_event,p_calculation,p_sources,true) IS NOT TRUE THEN RETURN NULL; END IF;
  SELECT * INTO v_event FROM public.commission_events e WHERE e.id=p_event AND e.organization_id=p_org AND e.source_mode='managed' AND e.state='approved';
  SELECT * INTO v_calculation FROM public.managed_commission_calculations c WHERE c.id=p_calculation AND c.organization_id=p_org
    AND c.commission_event_id=v_event.id AND c.contract_id=v_event.contract_id AND c.state='approved'
    AND c.calculation_revision=v_event.calculation_revision AND c.amount_minor_units=v_event.commission_amount_minor_units AND c.currency=v_event.currency;
  SELECT * INTO v_source FROM public.managed_commission_sources s WHERE s.organization_id=p_org AND s.commission_event_id=v_event.id;
  SELECT f.id INTO v_latest_facts FROM public.finance_contract_facts_versions f WHERE f.organization_id=p_org AND f.contract_id=v_event.contract_id
    AND f.handoff_id=v_source.handoff_id AND f.state='approved' ORDER BY f.version DESC LIMIT 1;
  IF v_event.id IS NULL OR v_calculation.id IS NULL OR v_calculation.facts_version_id IS DISTINCT FROM v_latest_facts
    OR v_event.commission_amount_minor_units IS NULL OR v_event.commission_amount_minor_units NOT BETWEEN 0 AND 9007199254740991
    OR mmhr_private.r7_managed_currency(to_jsonb(v_event.currency)) IS NOT TRUE THEN RETURN NULL; END IF;
  SELECT jsonb_agg(mmhr_private.r7_managed_document_observation((s.value->>'organizationId')::uuid,
    (s.value->>'documentId')::uuid,(s.value->>'versionId')::uuid) ORDER BY s.ordinality) INTO v_tips
    FROM jsonb_array_elements(p_sources) WITH ORDINALITY s(value,ordinality);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_tips) item WHERE item='null'::jsonb) THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('event',to_jsonb(v_event),'calculation',to_jsonb(v_calculation),'source',to_jsonb(v_source),
    'approvedFactsTip',v_latest_facts,'supportingSources',p_sources,'documentObservations',v_tips);
END $$;

CREATE FUNCTION mmhr_private.r7_invoice_review_ok(p_sources jsonb,p_reviewed jsonb,p_actor uuid,p_time timestamptz)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_original jsonb; v_reviewed jsonb;
BEGIN
  IF mmhr_private.r7_invoice_sources_input_ok(p_reviewed,true) IS NOT TRUE OR jsonb_array_length(p_sources)<>jsonb_array_length(p_reviewed) THEN RETURN false; END IF;
  FOR v_original IN SELECT value FROM jsonb_array_elements(p_sources) LOOP
    SELECT value INTO v_reviewed FROM jsonb_array_elements(p_reviewed) WHERE value-'reviewedAccessId'=v_original;
    IF v_reviewed IS NULL OR mmhr_private.r7_managed_review_access_ok((v_original->>'organizationId')::uuid,(v_original->>'documentId')::uuid,
      (v_original->>'versionId')::uuid,p_actor,(v_reviewed->>'reviewedAccessId')::uuid,p_time) IS NOT TRUE THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION mmhr_private.r7_invoice_sources_input_ok(jsonb,boolean),mmhr_private.r7_invoice_command_input_ok(jsonb),
  mmhr_private.r7_invoice_owner_ok(uuid,uuid,uuid,timestamptz),mmhr_private.r7_invoice_actor(uuid,uuid),
  mmhr_private.r7_invoice_originals_ok(uuid,uuid,jsonb,boolean),mmhr_private.r7_invoice_observation(uuid,uuid,uuid,jsonb),
  mmhr_private.r7_invoice_review_ok(jsonb,jsonb,uuid,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r7_invoice_receipt_ok(p_receipt uuid,p_actor uuid,p_org uuid,p_invoice uuid,p_action text,p_correlation uuid,p_request jsonb,p_time timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT EXISTS(SELECT 1 FROM public.security_command_receipts r JOIN public.audit_events a ON a.id=r.audit_event_id
    WHERE r.id=p_receipt AND r.actor_identity_id=p_actor AND r.entity_id=p_invoice AND r.created_at=p_time
      AND r.command='r7.invoice.managed.'||p_action AND r.action='finance.'||p_action
      AND r.request_digest=mmhr_private.r7_managed_digest(p_request)
      AND a.actor_type='user' AND a.actor_identity_id=p_actor AND a.organization_id=p_org
      AND a.entity_type='finance_invoice' AND a.entity_id=p_invoice::text AND a.reason=btrim(p_request->>'reason')
      AND a.command=r.command AND a.action=r.action AND a.idempotency_key=r.idempotency_key::text
      AND a.correlation_id=p_correlation AND a.occurred_at=p_time
      AND a.before_summary IS NOT DISTINCT FROM CASE WHEN p_action='prepare_invoice' THEN NULL ELSE jsonb_build_object('status','completed') END
      AND a.after_summary=jsonb_build_object('status','completed'))
$$;

CREATE FUNCTION mmhr_private.r7_invoice_preparation_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_actor uuid; v_event public.commission_events%ROWTYPE; v_invoice public.finance_invoices%ROWTYPE;
  v_internal_org uuid; v_observation jsonb; v_expected jsonb; v_rejection boolean; v_decision_keys text[]:=ARRAY[
    'state','revision','decided_by_identity_id','decided_at','decision_receipt_id','decision_request','decision_request_digest','decision_correlation_id'];
BEGIN
  IF TG_OP NOT IN ('INSERT','UPDATE') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice preparation is immutable'; END IF;
  PERFORM mmhr_private.r1_lock_security(); v_actor:=mmhr_private.r7_invoice_actor(NEW.organization_id,NEW.commission_event_id);
  SELECT * INTO v_event FROM public.commission_events e WHERE e.id=NEW.commission_event_id AND e.organization_id=NEW.organization_id FOR UPDATE;
  SELECT * INTO v_invoice FROM public.finance_invoices i WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id FOR UPDATE;
  SELECT s.agreement_organization_id INTO v_internal_org FROM public.managed_commission_sources s WHERE s.commission_event_id=v_event.id AND s.organization_id=v_event.organization_id;
  v_rejection:=TG_OP='UPDATE' AND NEW.state='rejected';
  IF v_actor IS NULL OR v_event.id IS NULL OR v_event.state<>'approved' OR v_event.event_revision<>NEW.expected_event_revision
    OR (v_invoice.id IS NOT NULL AND (v_invoice.source_mode<>'managed' OR v_invoice.commission_event_id<>v_event.id OR v_invoice.status NOT IN ('draft','ready')))
    OR mmhr_private.r7_managed_currency(to_jsonb(NEW.currency)) IS NOT TRUE
    OR NEW.amount_minor_units IS DISTINCT FROM v_event.commission_amount_minor_units OR NEW.currency IS DISTINCT FROM v_event.currency THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice preparation authority or event denied'; END IF;
  v_expected:=jsonb_build_object('organizationId',NEW.organization_id,'action','prepare_invoice','invoiceId',NEW.invoice_id,'preparationId',NEW.id,
    'commissionEventId',NEW.commission_event_id,'calculationId',NEW.calculation_id,'expectedEventRevision',NEW.expected_event_revision,
    'expectedInvoiceRevision',NEW.expected_invoice_revision,'expectedSourceDigest',NEW.source_digest,'ownerIdentityId',NEW.owner_identity_id,
    'invoiceNumber',NEW.invoice_number,'issueDate',NEW.prepare_request->'issueDate','dueDate',NEW.prepare_request->'dueDate',
    'collectionTerms',NEW.collection_terms,'supportingSources',NEW.supporting_sources,'reason',NEW.prepare_request->'reason');
  IF mmhr_private.r7_invoice_command_input_ok(NEW.prepare_request) IS NOT TRUE OR NEW.prepare_request IS DISTINCT FROM v_expected
    OR NEW.prepare_request_digest IS DISTINCT FROM mmhr_private.r7_managed_digest(v_expected)
    OR (NEW.prepare_request->>'issueDate')::timestamptz IS DISTINCT FROM NEW.issue_date
    OR (NEW.prepare_request->>'dueDate')::timestamptz IS DISTINCT FROM NEW.due_date
    OR NEW.source_digest IS DISTINCT FROM mmhr_private.r7_managed_digest(NEW.source_observation)
    OR mmhr_private.r7_invoice_originals_ok(NEW.commission_event_id,NEW.calculation_id,NEW.supporting_sources,false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice preparation original request denied'; END IF;
  IF NOT v_rejection THEN
    v_observation:=mmhr_private.r7_invoice_observation(NEW.organization_id,NEW.commission_event_id,NEW.calculation_id,NEW.supporting_sources);
    IF v_observation IS NULL OR v_observation IS DISTINCT FROM NEW.source_observation
      OR mmhr_private.r7_invoice_owner_ok(NEW.owner_identity_id,NEW.organization_id,v_internal_org,clock_timestamp()) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice preparation source or owner changed'; END IF;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'pending' OR NEW.revision<>1 OR NEW.prepared_by_identity_id IS DISTINCT FROM v_actor
      OR NEW.prepared_at>clock_timestamp() OR NEW.prepared_at<clock_timestamp()-interval '10 seconds'
      OR coalesce(v_invoice.invoice_revision,0)<>NEW.expected_invoice_revision THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice preparation revision denied'; END IF;
  ELSE
    IF OLD.state<>'pending' OR OLD.revision<>1 OR NEW.state NOT IN ('approved','rejected') OR NEW.revision<>2
      OR v_invoice.id IS NULL OR v_invoice.current_preparation_id<>NEW.id OR v_invoice.invoice_revision<>NEW.expected_invoice_revision+1
      OR NEW.decided_by_identity_id IS DISTINCT FROM v_actor OR v_actor=OLD.prepared_by_identity_id
      OR NEW.decided_at>clock_timestamp() OR NEW.decided_at<clock_timestamp()-interval '10 seconds'
      OR (to_jsonb(NEW)-v_decision_keys) IS DISTINCT FROM (to_jsonb(OLD)-v_decision_keys)
      OR mmhr_private.r7_invoice_command_input_ok(NEW.decision_request) IS NOT TRUE
      OR NEW.decision_request_digest IS DISTINCT FROM mmhr_private.r7_managed_digest(NEW.decision_request)
      OR NEW.decision_request IS DISTINCT FROM jsonb_build_object('organizationId',NEW.organization_id,
        'action',CASE WHEN v_rejection THEN 'reject_invoice' ELSE 'approve_invoice' END,'invoiceId',NEW.invoice_id,'preparationId',NEW.id,
        'commissionEventId',NEW.commission_event_id,'expectedEventRevision',NEW.expected_event_revision,
        'expectedInvoiceRevision',v_invoice.invoice_revision,'expectedPreparationRevision',1,'expectedSourceDigest',NEW.source_digest,
        'contentsReviewed',true,'reviewReference',NEW.decision_request->'reviewReference','reviewedSources',NEW.decision_request->'reviewedSources',
        'reason',NEW.decision_request->'reason')
      OR mmhr_private.r7_invoice_review_ok(NEW.supporting_sources,NEW.decision_request->'reviewedSources',v_actor,NEW.decided_at) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice independent readiness decision denied'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mmhr_private.r7_invoice_preparation_commit_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_action text; v_receipt uuid; v_actor uuid; v_correlation uuid; v_request jsonb; v_checked_at timestamptz;
BEGIN
  v_action:=CASE WHEN TG_OP='INSERT' THEN 'prepare_invoice' WHEN NEW.state='approved' THEN 'approve_invoice' ELSE 'reject_invoice' END;
  v_receipt:=CASE WHEN TG_OP='INSERT' THEN NEW.prepare_receipt_id ELSE NEW.decision_receipt_id END;
  v_actor:=CASE WHEN TG_OP='INSERT' THEN NEW.prepared_by_identity_id ELSE NEW.decided_by_identity_id END;
  v_correlation:=CASE WHEN TG_OP='INSERT' THEN NEW.correlation_id ELSE NEW.decision_correlation_id END;
  v_request:=CASE WHEN TG_OP='INSERT' THEN NEW.prepare_request ELSE NEW.decision_request END;
  v_checked_at:=CASE WHEN TG_OP='INSERT' THEN NEW.prepared_at ELSE NEW.decided_at END;
  IF mmhr_private.r7_invoice_receipt_ok(v_receipt,v_actor,NEW.organization_id,NEW.invoice_id,v_action,v_correlation,v_request,v_checked_at) IS NOT TRUE
    OR NOT EXISTS(SELECT 1 FROM public.managed_invoice_events h WHERE h.receipt_id=v_receipt AND h.organization_id=NEW.organization_id
      AND h.invoice_id=NEW.invoice_id AND h.preparation_id=NEW.id AND h.action=v_action AND h.actor_identity_id=v_actor
      AND h.correlation_id=v_correlation AND h.request=v_request AND h.occurred_at=v_checked_at AND h.preparation_snapshot=to_jsonb(NEW)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice preparation receipt or history denied'; END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION mmhr_private.r7_invoice_receipt_ok(uuid,uuid,uuid,uuid,text,uuid,jsonb,timestamptz),
  mmhr_private.r7_invoice_preparation_guard(),mmhr_private.r7_invoice_preparation_commit_guard()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE TRIGGER managed_invoice_preparations_guard BEFORE INSERT OR UPDATE OR DELETE ON public.managed_invoice_preparations
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_invoice_preparation_guard();
CREATE CONSTRAINT TRIGGER managed_invoice_preparations_commit_guard AFTER INSERT OR UPDATE ON public.managed_invoice_preparations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_invoice_preparation_commit_guard();
--> statement-breakpoint
-- Add after generated DDL. New preparation precedes canonical invoice creation.
ALTER TABLE public.managed_invoice_preparations ALTER CONSTRAINT managed_invoice_preparations_invoice_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.finance_invoices ADD CONSTRAINT finance_invoices_managed_preparation_fk
  FOREIGN KEY(organization_id,id,current_preparation_id) REFERENCES public.managed_invoice_preparations(organization_id,invoice_id,id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX managed_invoice_events_issued_number_uq ON public.managed_invoice_events
  (organization_id,lower(btrim(invoice_snapshot->>'invoice_number'))) WHERE action='issue_invoice';

CREATE FUNCTION mmhr_private.r7_invoice_canonical_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_p public.managed_invoice_preparations%ROWTYPE; v_e public.commission_events%ROWTYPE; v_actor uuid; v_internal_org uuid;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.source_mode='managed' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice is immutable'; END IF; RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND NEW.source_mode IS DISTINCT FROM OLD.source_mode THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Invoice source mode is immutable'; END IF;
  SELECT * INTO v_e FROM public.commission_events event WHERE event.id=NEW.commission_event_id AND event.organization_id=NEW.organization_id;
  IF NEW.source_mode='legacy' THEN
    IF v_e.source_mode='managed' OR (TG_OP='UPDATE' AND (NEW.invoice_revision IS DISTINCT FROM OLD.invoice_revision
      OR NEW.current_preparation_id IS DISTINCT FROM OLD.current_preparation_id)) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Legacy invoice managed path denied'; END IF;
    RETURN NEW;
  END IF;
  PERFORM mmhr_private.r1_lock_security(); v_actor:=mmhr_private.r7_invoice_actor(NEW.organization_id,NEW.commission_event_id);
  SELECT * INTO v_p FROM public.managed_invoice_preparations prep WHERE prep.id=NEW.current_preparation_id
    AND prep.organization_id=NEW.organization_id AND prep.invoice_id=NEW.id AND prep.commission_event_id=NEW.commission_event_id;
  SELECT s.agreement_organization_id INTO v_internal_org FROM public.managed_commission_sources s WHERE s.commission_event_id=v_e.id AND s.organization_id=v_e.organization_id;
  -- Legacy invoice dates retain calendar values; managed preparation retains exact UTC instants.
  IF v_actor IS NULL OR v_p.id IS NULL OR v_e.state<>'approved' OR v_e.event_revision<>v_p.expected_event_revision
    OR NEW.vendor_organization_id<>v_e.vendor_organization_id OR NEW.amount_minor_units IS DISTINCT FROM v_e.commission_amount_minor_units
    OR NEW.currency IS DISTINCT FROM v_e.currency OR NEW.amount_minor_units IS DISTINCT FROM v_p.amount_minor_units OR NEW.currency IS DISTINCT FROM v_p.currency
    OR NEW.invoice_number IS DISTINCT FROM v_p.invoice_number
    OR NEW.issue_date IS DISTINCT FROM (v_p.issue_date AT TIME ZONE 'UTC')::date
    OR NEW.due_date IS DISTINCT FROM (v_p.due_date AT TIME ZONE 'UTC')::date
    OR NEW.supporting_document_references IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice canonical source denied'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'draft' OR NEW.invoice_revision<>1 OR v_p.expected_invoice_revision<>0 OR v_p.state<>'pending'
      OR NEW.created_by_identity_id IS DISTINCT FROM v_p.prepared_by_identity_id OR NEW.created_at IS DISTINCT FROM v_p.prepared_at THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice initial state denied'; END IF;
  ELSE
    IF NEW.invoice_revision<>OLD.invoice_revision+1
      OR (to_jsonb(NEW)-ARRAY['status','invoice_revision','current_preparation_id','invoice_number','issue_date','due_date'])
        IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','invoice_revision','current_preparation_id','invoice_number','issue_date','due_date']) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice canonical mutation denied'; END IF;
    IF NEW.current_preparation_id<>OLD.current_preparation_id THEN
      IF OLD.status NOT IN ('draft','ready') OR NEW.status<>'draft' OR v_p.state<>'pending' OR v_p.prepared_by_identity_id<>v_actor
        OR v_p.expected_invoice_revision<>OLD.invoice_revision THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice replacement denied'; END IF;
    ELSIF OLD.status='draft' AND NEW.status='ready' THEN
      IF v_p.state<>'approved' OR v_p.decided_by_identity_id<>v_actor OR NEW.invoice_revision<>v_p.expected_invoice_revision+2 THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice readiness publication denied'; END IF;
    ELSIF OLD.status='ready' AND NEW.status='issued' THEN
      IF v_p.state<>'approved' OR OLD.invoice_revision<>v_p.expected_invoice_revision+2 OR v_p.issue_date>clock_timestamp()
        OR mmhr_private.r7_invoice_owner_ok(v_p.owner_identity_id,v_p.organization_id,v_internal_org,clock_timestamp()) IS NOT TRUE
        OR mmhr_private.r7_invoice_owner_ok(v_p.decided_by_identity_id,v_p.organization_id,v_internal_org,clock_timestamp()) IS NOT TRUE
        OR mmhr_private.r7_invoice_observation(v_p.organization_id,v_p.commission_event_id,v_p.calculation_id,v_p.supporting_sources) IS DISTINCT FROM v_p.source_observation
        OR EXISTS(SELECT 1 FROM public.finance_invoices other WHERE other.organization_id=NEW.organization_id AND other.id<>NEW.id
          AND other.status IN ('issued','voided') AND lower(btrim(other.invoice_number))=lower(btrim(NEW.invoice_number))) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice issue readiness denied'; END IF;
    ELSE RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice transition denied'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mmhr_private.r7_invoice_canonical_commit_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_action text;
BEGIN
  IF NEW.source_mode<>'managed' THEN RETURN NEW; END IF;
  v_action:=CASE NEW.status WHEN 'draft' THEN 'prepare_invoice' WHEN 'ready' THEN 'approve_invoice' WHEN 'issued' THEN 'issue_invoice' END;
  IF NOT EXISTS(SELECT 1 FROM public.managed_invoice_events h WHERE h.organization_id=NEW.organization_id AND h.invoice_id=NEW.id
    AND h.preparation_id=NEW.current_preparation_id AND h.action=v_action AND h.invoice_snapshot=to_jsonb(NEW)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice canonical history missing'; END IF;
  IF NEW.status='issued' AND NOT EXISTS(SELECT 1 FROM public.commission_events e JOIN public.managed_invoice_events h
      ON h.invoice_id=NEW.id AND h.organization_id=NEW.organization_id AND h.action='issue_invoice'
    JOIN public.commission_event_history eh ON eh.commission_event_id=e.id AND eh.organization_id=e.organization_id
      AND eh.event_revision=e.event_revision AND eh.from_state='approved' AND eh.to_state='invoiced'
      AND eh.actor_identity_id=h.actor_identity_id AND eh.correlation_id=h.correlation_id AND eh.occurred_at=h.occurred_at AND eh.reason=h.request->>'reason'
    WHERE e.id=NEW.commission_event_id AND e.organization_id=NEW.organization_id AND e.state='invoiced'
      AND e.event_revision=(h.request->>'expectedEventRevision')::integer+1) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice event issue publication missing'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mmhr_private.r7_invoice_history_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_invoice public.finance_invoices%ROWTYPE; v_p public.managed_invoice_preparations%ROWTYPE; v_expected jsonb; v_actor uuid;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice history is immutable'; END IF;
  v_actor:=mmhr_private.r7_invoice_actor(NEW.organization_id,(NEW.request->>'commissionEventId')::uuid);
  SELECT * INTO v_invoice FROM public.finance_invoices i WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id AND i.source_mode='managed';
  SELECT * INTO v_p FROM public.managed_invoice_preparations x WHERE x.id=NEW.preparation_id AND x.organization_id=NEW.organization_id AND x.invoice_id=v_invoice.id;
  IF v_actor IS NULL OR v_actor IS DISTINCT FROM NEW.actor_identity_id OR v_invoice.id IS NULL OR v_p.id IS NULL
    OR v_invoice.current_preparation_id<>v_p.id OR NEW.invoice_snapshot IS DISTINCT FROM to_jsonb(v_invoice)
    OR NEW.preparation_snapshot IS DISTINCT FROM to_jsonb(v_p) OR mmhr_private.r7_invoice_command_input_ok(NEW.request) IS NOT TRUE
    OR NEW.request_digest IS DISTINCT FROM mmhr_private.r7_managed_digest(NEW.request)
    OR NEW.request->>'action' IS DISTINCT FROM NEW.action
    OR NEW.request->>'organizationId' IS DISTINCT FROM NEW.organization_id::text
    OR NEW.request->>'invoiceId' IS DISTINCT FROM v_invoice.id::text OR NEW.request->>'preparationId' IS DISTINCT FROM v_p.id::text
    OR NEW.request->>'commissionEventId' IS DISTINCT FROM v_p.commission_event_id::text
    OR NEW.request->>'expectedSourceDigest' IS DISTINCT FROM v_p.source_digest
    OR mmhr_private.r7_invoice_receipt_ok(NEW.receipt_id,v_actor,NEW.organization_id,NEW.invoice_id,NEW.action,NEW.correlation_id,NEW.request,NEW.occurred_at) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice history receipt or binding denied'; END IF;
  IF NEW.action='prepare_invoice' THEN
    IF v_p.state<>'pending' OR v_p.revision<>1 OR v_p.prepare_receipt_id<>NEW.receipt_id OR v_p.prepare_request<>NEW.request
      OR v_p.prepared_by_identity_id<>v_actor OR v_p.prepared_at<>NEW.occurred_at OR v_invoice.status<>'draft' THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice preparation history denied'; END IF;
  ELSIF NEW.action IN ('approve_invoice','reject_invoice') THEN
    IF v_p.state IS DISTINCT FROM (CASE NEW.action WHEN 'approve_invoice' THEN 'approved' ELSE 'rejected' END)
      OR v_p.revision<>2 OR v_p.decision_receipt_id<>NEW.receipt_id OR v_p.decision_request<>NEW.request
      OR v_p.decided_by_identity_id<>v_actor OR v_p.decided_at<>NEW.occurred_at
      OR v_invoice.status IS DISTINCT FROM (CASE NEW.action WHEN 'approve_invoice' THEN 'ready' ELSE 'draft' END) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice decision history denied'; END IF;
  ELSE
    IF v_p.state<>'approved' OR v_p.revision<>2 OR v_invoice.status<>'issued' OR v_p.issue_date>NEW.occurred_at
      OR NEW.occurred_at>clock_timestamp() OR NEW.occurred_at<clock_timestamp()-interval '10 seconds'
      OR NEW.request IS DISTINCT FROM jsonb_build_object('organizationId',NEW.organization_id,'action','issue_invoice','invoiceId',v_invoice.id,
        'preparationId',v_p.id,'commissionEventId',v_p.commission_event_id,'expectedEventRevision',v_p.expected_event_revision,
        'expectedInvoiceRevision',v_p.expected_invoice_revision+2,'expectedPreparationRevision',2,'expectedSourceDigest',v_p.source_digest,'reason',NEW.request->'reason') THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice issue history denied'; END IF;
  END IF;
  v_expected:=jsonb_build_object('organizationId',NEW.organization_id,'correlationId',NEW.correlation_id,'invoiceId',v_invoice.id,'preparationId',v_p.id,
    'commissionEventId',v_p.commission_event_id,'action',NEW.action,'preparationRevision',CASE WHEN NEW.action='prepare_invoice' THEN 1 ELSE 2 END,
    'invoiceRevision',(NEW.request->>'expectedInvoiceRevision')::integer+CASE WHEN NEW.action='reject_invoice' THEN 0 ELSE 1 END,
    'eventRevision',(NEW.request->>'expectedEventRevision')::integer+CASE WHEN NEW.action='issue_invoice' THEN 1 ELSE 0 END,
    'status',v_invoice.status,'outcomeCode','recorded');
  IF NEW.result IS DISTINCT FROM v_expected OR v_invoice.invoice_revision<>(v_expected->>'invoiceRevision')::integer THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice immutable result denied'; END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION mmhr_private.r7_invoice_canonical_guard(),mmhr_private.r7_invoice_canonical_commit_guard(),mmhr_private.r7_invoice_history_guard()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE TRIGGER finance_invoices_managed_guard BEFORE INSERT OR UPDATE OR DELETE ON public.finance_invoices
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_invoice_canonical_guard();
CREATE CONSTRAINT TRIGGER finance_invoices_managed_commit_guard AFTER INSERT OR UPDATE ON public.finance_invoices DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_invoice_canonical_commit_guard();
CREATE CONSTRAINT TRIGGER managed_invoice_events_guard AFTER INSERT ON public.managed_invoice_events DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_invoice_history_guard();
CREATE TRIGGER managed_invoice_events_immutable BEFORE UPDATE OR DELETE ON public.managed_invoice_events
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_managed_no_truncate();
DO $$ DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['managed_invoice_preparations','managed_invoice_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',name);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated,service_role,mmhr_worker,mmhr_document_worker USING(false) WITH CHECK(false)',name||'_deny_raw',name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker',name);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r7_managed_no_truncate()',name||'_no_truncate',name);
  END LOOP;
END $$;
--> statement-breakpoint
-- Preserve current function bodies. Exact fragment/count checks fail closed on drift.
DO $$
DECLARE definition text; anchor text; replacement text;
BEGIN
  definition:=pg_get_functiondef('mmhr_private.r7_managed_legacy_financial_path_guard()'::regprocedure);
  anchor:='        RAISE EXCEPTION USING ERRCODE=''42501'',MESSAGE=''Managed downstream finance workflow is not enabled'';';
  replacement:='        IF TG_TABLE_NAME<>''finance_invoices'' OR v_row->>''source_mode'' IS DISTINCT FROM ''managed'' THEN
          RAISE EXCEPTION USING ERRCODE=''42501'',MESSAGE=''Managed downstream finance workflow is not enabled'';
        END IF;';
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Managed invoice legacy guard source changed'; END IF;
  EXECUTE replace(definition,anchor,replacement);

  definition:=pg_get_functiondef('mmhr_private.r7_managed_canonical_event_guard()'::regprocedure);
  anchor:='  ELSE
    SELECT * INTO v_calculation FROM public.managed_commission_calculations c WHERE c.commission_event_id=NEW.id AND c.organization_id=NEW.organization_id';
  replacement:='  ELSE
    IF OLD.state=''approved'' AND NEW.state=''invoiced'' THEN
      IF NEW.event_revision<>OLD.event_revision+1
        OR (to_jsonb(NEW)-ARRAY[''state'',''event_revision'']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY[''state'',''event_revision''])
        OR NOT EXISTS(SELECT 1 FROM public.finance_invoices i JOIN public.managed_invoice_preparations p
          ON p.organization_id=i.organization_id AND p.invoice_id=i.id AND p.id=i.current_preparation_id
          WHERE i.organization_id=NEW.organization_id AND i.commission_event_id=NEW.id AND i.source_mode=''managed'' AND i.status=''issued''
            AND p.state=''approved'' AND p.expected_event_revision=OLD.event_revision AND i.invoice_revision=p.expected_invoice_revision+3)
        THEN RAISE EXCEPTION USING ERRCODE=''42501'',MESSAGE=''Managed event invoice publication denied''; END IF;
      RETURN NEW;
    END IF;
    SELECT * INTO v_calculation FROM public.managed_commission_calculations c WHERE c.commission_event_id=NEW.id AND c.organization_id=NEW.organization_id';
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Managed event publication source changed'; END IF;
  EXECUTE replace(definition,anchor,replacement);

  definition:=pg_get_functiondef('mmhr_private.r7_managed_canonical_event_commit_guard()'::regprocedure);
  anchor:='  IF TG_OP=''UPDATE'' AND NEW.source_mode=''managed'' AND NOT EXISTS(SELECT 1 FROM public.commission_event_history h';
  replacement:='  IF TG_OP=''UPDATE'' AND NEW.source_mode=''managed'' AND NEW.state=''invoiced'' THEN
    IF NOT EXISTS(SELECT 1 FROM public.finance_invoices i JOIN public.managed_invoice_events h ON h.invoice_id=i.id AND h.organization_id=i.organization_id
      JOIN public.commission_event_history eh ON eh.commission_event_id=NEW.id AND eh.organization_id=NEW.organization_id
        AND eh.event_revision=NEW.event_revision AND eh.from_state=''approved'' AND eh.to_state=''invoiced''
        AND eh.actor_identity_id=h.actor_identity_id AND eh.correlation_id=h.correlation_id AND eh.occurred_at=h.occurred_at AND eh.reason=h.request->>''reason''
      WHERE i.commission_event_id=NEW.id AND i.organization_id=NEW.organization_id AND i.source_mode=''managed'' AND i.status=''issued'' AND h.action=''issue_invoice''
        AND h.actor_identity_id=mmhr_private.r7_invoice_actor(NEW.organization_id,NEW.id)
        AND (h.result->>''eventRevision'')::integer=NEW.event_revision) THEN
      RAISE EXCEPTION USING ERRCODE=''42501'',MESSAGE=''Managed invoiced event receipt history missing''; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP=''UPDATE'' AND NEW.source_mode=''managed'' AND NOT EXISTS(SELECT 1 FROM public.commission_event_history h';
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Managed event commit source changed'; END IF;
  EXECUTE replace(definition,anchor,replacement);

  definition:=pg_get_functiondef('mmhr_private.r7_managed_event_history_guard()'::regprocedure);
  anchor:='  IF v_managed IS TRUE AND (TG_OP<>''INSERT'' OR NOT EXISTS(SELECT 1 FROM public.commission_events e';
  replacement:='  IF v_managed IS TRUE AND TG_OP=''INSERT'' AND NEW.from_state=''approved'' AND NEW.to_state=''invoiced'' THEN
    IF NOT EXISTS(SELECT 1 FROM public.commission_events e JOIN public.finance_invoices i ON i.organization_id=e.organization_id AND i.commission_event_id=e.id
      JOIN public.managed_invoice_events h ON h.invoice_id=i.id AND h.organization_id=i.organization_id AND h.action=''issue_invoice''
      WHERE e.id=v_event AND e.organization_id=v_org AND e.state=''invoiced'' AND e.event_revision=NEW.event_revision
        AND i.source_mode=''managed'' AND i.status=''issued'' AND h.actor_identity_id=NEW.actor_identity_id
        AND NEW.actor_identity_id=mmhr_private.r7_invoice_actor(v_org,v_event) AND h.correlation_id=NEW.correlation_id
        AND h.occurred_at=NEW.occurred_at AND h.request->>''reason''=NEW.reason
        AND (h.result->>''eventRevision'')::integer=NEW.event_revision) THEN
      RAISE EXCEPTION USING ERRCODE=''42501'',MESSAGE=''Managed invoiced history denied''; END IF;
    RETURN NEW;
  END IF;
  IF v_managed IS TRUE AND (TG_OP<>''INSERT'' OR NOT EXISTS(SELECT 1 FROM public.commission_events e';
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Managed event history source changed'; END IF;
  EXECUTE replace(definition,anchor,replacement);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_managed_invoice_command(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_org_id uuid; v_event_id uuid; v_invoice_id uuid; v_preparation_id uuid; v_action text; v_actor uuid; v_checked_at timestamptz;
  v_invoice public.finance_invoices%ROWTYPE; v_event public.commission_events%ROWTYPE; v_p public.managed_invoice_preparations%ROWTYPE;
  v_receipt jsonb; v_receipt_id uuid; v_original public.managed_invoice_events%ROWTYPE; v_observation jsonb; v_result jsonb; v_internal_org uuid;
  v_command_correlation_id uuid:=correlation_id;
BEGIN
  IF correlation_id IS NULL OR idempotency_key IS NULL OR mmhr_private.r7_invoice_command_input_ok(payload) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid managed invoice command'; END IF;
  v_org_id:=(payload->>'organizationId')::uuid; v_event_id:=(payload->>'commissionEventId')::uuid;
  v_invoice_id:=(payload->>'invoiceId')::uuid; v_preparation_id:=(payload->>'preparationId')::uuid; v_action:=payload->>'action';
  PERFORM mmhr_private.r1_lock_security(); v_actor:=mmhr_private.r7_invoice_actor(v_org_id,v_event_id);
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice cross-workspace authority denied'; END IF;
  SELECT * INTO v_event FROM public.commission_events e WHERE e.id=v_event_id AND e.organization_id=v_org_id AND e.source_mode='managed' FOR UPDATE;
  SELECT * INTO v_invoice FROM public.finance_invoices i WHERE i.id=v_invoice_id AND i.organization_id=v_org_id FOR UPDATE;
  SELECT * INTO v_p FROM public.managed_invoice_preparations x WHERE x.id=v_preparation_id AND x.organization_id=v_org_id
    AND x.invoice_id=v_invoice_id AND x.commission_event_id=v_event_id FOR UPDATE;
  IF v_event.id IS NULL OR (v_invoice.id IS NOT NULL AND (v_invoice.source_mode<>'managed' OR v_invoice.commission_event_id<>v_event_id))
    OR (v_action<>'prepare_invoice' AND (v_invoice.id IS NULL OR v_p.id IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice target denied'; END IF;
  v_receipt:=mmhr_private.r1_replay_security_command(v_actor,'r7.invoice.managed.'||v_action,idempotency_key,payload);
  IF v_receipt IS NOT NULL AND v_receipt->'request_matches' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Managed invoice retry identifiers differ';
  END IF;
  v_receipt:=v_receipt-'request_matches';
  IF v_receipt IS NOT NULL THEN
    SELECT * INTO v_original FROM public.managed_invoice_events h WHERE h.receipt_id=(v_receipt->>'receipt_id')::uuid
      AND h.organization_id=v_org_id AND h.invoice_id=v_invoice_id AND h.preparation_id=v_preparation_id AND h.actor_identity_id=v_actor AND h.action=v_action;
    IF v_original.id IS NULL OR v_original.correlation_id IS DISTINCT FROM correlation_id OR v_original.request IS DISTINCT FROM payload
      OR v_original.request_digest IS DISTINCT FROM mmhr_private.r7_managed_digest(payload)
      OR mmhr_private.r7_invoice_receipt_ok(v_original.receipt_id,v_actor,v_org_id,v_invoice_id,v_action,correlation_id,payload,v_original.occurred_at) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Managed invoice retry identifiers differ'; END IF;
    RETURN v_original.result||jsonb_build_object('outcomeCode','replayed');
  END IF;
  IF v_event.state<>'approved' OR v_event.event_revision<>(payload->>'expectedEventRevision')::integer
    OR v_event.commission_amount_minor_units IS NULL OR v_event.currency IS NULL
    OR coalesce(v_invoice.invoice_revision,0)<>(payload->>'expectedInvoiceRevision')::integer THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice event or invoice revision changed'; END IF;
  IF v_action='prepare_invoice' THEN
    IF v_p.id IS NOT NULL OR (v_invoice.id IS NOT NULL AND v_invoice.status NOT IN ('draft','ready'))
      OR EXISTS(SELECT 1 FROM public.finance_invoices other WHERE other.organization_id=v_org_id AND other.commission_event_id=v_event_id
        AND other.id<>v_invoice_id AND other.status<>'voided') THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice already exists or preparation reused'; END IF;
    v_observation:=mmhr_private.r7_invoice_observation(v_org_id,v_event_id,(payload->>'calculationId')::uuid,payload->'supportingSources');
    IF v_observation IS NULL OR mmhr_private.r7_managed_digest(v_observation) IS DISTINCT FROM payload->>'expectedSourceDigest' THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice preparation source changed'; END IF;
  ELSE
    IF v_invoice.current_preparation_id<>v_p.id OR v_p.source_digest<>payload->>'expectedSourceDigest'
      OR v_p.revision<>(payload->>'expectedPreparationRevision')::integer
      OR (v_action IN ('approve_invoice','reject_invoice') AND (v_invoice.status<>'draft' OR v_p.state<>'pending'))
      OR (v_action='issue_invoice' AND (v_invoice.status<>'ready' OR v_p.state<>'approved')) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice readiness changed'; END IF;
  END IF;
  IF v_action='issue_invoice' THEN
    SELECT s.agreement_organization_id INTO v_internal_org FROM public.managed_commission_sources s WHERE s.commission_event_id=v_event_id AND s.organization_id=v_org_id;
    IF mmhr_private.r7_invoice_observation(v_org_id,v_event_id,v_p.calculation_id,v_p.supporting_sources) IS DISTINCT FROM v_p.source_observation
      OR mmhr_private.r7_invoice_owner_ok(v_p.owner_identity_id,v_org_id,v_internal_org,clock_timestamp()) IS NOT TRUE
      OR mmhr_private.r7_invoice_owner_ok(v_p.decided_by_identity_id,v_org_id,v_internal_org,clock_timestamp()) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice issue source or authority changed'; END IF;
  END IF;
  v_checked_at:=clock_timestamp();
  IF v_action='issue_invoice' AND v_p.issue_date>v_checked_at THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice issue date not reached'; END IF;
  v_receipt:=mmhr_private.r1_finish_security_command(v_actor,'r7.invoice.managed.'||v_action,'finance.'||v_action,'finance_invoice',v_invoice_id,v_org_id,
    payload->>'reason',correlation_id,idempotency_key,payload,CASE WHEN v_action='prepare_invoice' THEN NULL ELSE jsonb_build_object('status','completed') END,
    jsonb_build_object('status','completed'),v_checked_at);
  v_receipt_id:=(v_receipt->>'receipt_id')::uuid;
  IF v_action='prepare_invoice' THEN
    INSERT INTO public.managed_invoice_preparations(id,organization_id,invoice_id,commission_event_id,calculation_id,
      expected_event_revision,expected_invoice_revision,owner_identity_id,amount_minor_units,currency,invoice_number,issue_date,due_date,
      collection_terms,supporting_sources,source_observation,source_digest,state,revision,prepared_by_identity_id,prepared_at,correlation_id,
      prepare_receipt_id,prepare_request,prepare_request_digest)
    VALUES(v_preparation_id,v_org_id,v_invoice_id,v_event_id,(payload->>'calculationId')::uuid,v_event.event_revision,coalesce(v_invoice.invoice_revision,0),
      (payload->>'ownerIdentityId')::uuid,v_event.commission_amount_minor_units,v_event.currency,payload->>'invoiceNumber',(payload->>'issueDate')::timestamptz,
      (payload->>'dueDate')::timestamptz,payload->>'collectionTerms',payload->'supportingSources',v_observation,mmhr_private.r7_managed_digest(v_observation),
      'pending',1,v_actor,v_checked_at,correlation_id,v_receipt_id,payload,mmhr_private.r7_managed_digest(payload)) RETURNING * INTO v_p;
    IF v_invoice.id IS NULL THEN
      INSERT INTO public.finance_invoices(id,organization_id,commission_event_id,vendor_organization_id,currency,amount_minor_units,status,
        invoice_number,issue_date,due_date,supporting_document_references,created_by_identity_id,created_at,source_mode,invoice_revision,current_preparation_id)
      VALUES(v_invoice_id,v_org_id,v_event_id,v_event.vendor_organization_id,v_event.currency,v_event.commission_amount_minor_units,'draft',v_p.invoice_number,
        (v_p.issue_date AT TIME ZONE 'UTC')::date,(v_p.due_date AT TIME ZONE 'UTC')::date,'[]'::jsonb,v_actor,v_checked_at,'managed',1,v_p.id) RETURNING * INTO v_invoice;
    ELSE
      UPDATE public.finance_invoices i SET status='draft',invoice_revision=i.invoice_revision+1,current_preparation_id=v_p.id,
        invoice_number=v_p.invoice_number,issue_date=(v_p.issue_date AT TIME ZONE 'UTC')::date,due_date=(v_p.due_date AT TIME ZONE 'UTC')::date
        WHERE i.id=v_invoice_id AND i.organization_id=v_org_id RETURNING * INTO v_invoice;
    END IF;
  ELSIF v_action IN ('approve_invoice','reject_invoice') THEN
    UPDATE public.managed_invoice_preparations x SET state=CASE v_action WHEN 'approve_invoice' THEN 'approved' ELSE 'rejected' END,
      revision=2,decided_by_identity_id=v_actor,decided_at=v_checked_at,decision_receipt_id=v_receipt_id,decision_request=payload,
      decision_request_digest=mmhr_private.r7_managed_digest(payload),decision_correlation_id=v_command_correlation_id
      WHERE x.id=v_preparation_id AND x.organization_id=v_org_id RETURNING * INTO v_p;
    IF v_action='approve_invoice' THEN
      UPDATE public.finance_invoices i SET status='ready',invoice_revision=i.invoice_revision+1 WHERE i.id=v_invoice_id AND i.organization_id=v_org_id RETURNING * INTO v_invoice;
    END IF;
  ELSE
    UPDATE public.finance_invoices i SET status='issued',invoice_revision=i.invoice_revision+1 WHERE i.id=v_invoice_id AND i.organization_id=v_org_id RETURNING * INTO v_invoice;
    UPDATE public.commission_events e SET state='invoiced',event_revision=e.event_revision+1 WHERE e.id=v_event_id AND e.organization_id=v_org_id RETURNING * INTO v_event;
  END IF;
  v_result:=jsonb_build_object('organizationId',v_org_id,'correlationId',correlation_id,'invoiceId',v_invoice_id,'preparationId',v_preparation_id,
    'commissionEventId',v_event_id,'action',v_action,'preparationRevision',v_p.revision,'invoiceRevision',v_invoice.invoice_revision,
    'eventRevision',v_event.event_revision,'status',v_invoice.status,'outcomeCode','recorded');
  INSERT INTO public.managed_invoice_events(organization_id,invoice_id,preparation_id,action,actor_identity_id,receipt_id,correlation_id,
    request,request_digest,invoice_snapshot,preparation_snapshot,result,occurred_at)
  VALUES(v_org_id,v_invoice_id,v_preparation_id,v_action,v_actor,v_receipt_id,correlation_id,payload,mmhr_private.r7_managed_digest(payload),to_jsonb(v_invoice),to_jsonb(v_p),v_result,v_checked_at);
  IF v_action='issue_invoice' THEN
    INSERT INTO public.commission_event_history(organization_id,commission_event_id,event_revision,from_state,to_state,actor_identity_id,reason,occurred_at,correlation_id)
    VALUES(v_org_id,v_event_id,v_event.event_revision,'approved','invoiced',v_actor,payload->>'reason',v_checked_at,correlation_id);
  END IF;
  RETURN v_result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid managed invoice command';
END $$;
REVOKE ALL ON FUNCTION public.mmhr_managed_invoice_command(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_managed_invoice_command(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r7_invoice_read_input_ok(p jsonb,kind text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE v_required text[]:=ARRAY['organizationId','commissionEventId']; v_optional text[]; v_key text;
BEGIN
  v_optional:=CASE kind WHEN 'owners' THEN ARRAY['afterId'] WHEN 'detail' THEN ARRAY['invoiceId','afterPreparationId'] WHEN 'source' THEN ARRAY[]::text[] ELSE NULL END;
  IF kind='source' THEN v_required:=v_required||ARRAY['calculationId','supportingSources']; END IF;
  IF v_optional IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>100000 OR NOT p ?& v_required
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k<>ALL(v_required||v_optional)) THEN RETURN false; END IF;
  FOREACH v_key IN ARRAY v_required||v_optional LOOP
    IF p ? v_key AND v_key<>'supportingSources' AND mmhr_private.r7_managed_uuid(p->v_key) IS NOT TRUE THEN RETURN false; END IF;
  END LOOP;
  RETURN kind<>'source' OR mmhr_private.r7_invoice_sources_input_ok(p->'supportingSources');
END $$;

CREATE FUNCTION public.mmhr_get_managed_invoice_owners(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_org_id uuid; v_event_id uuid; v_after_id uuid; v_actor uuid; v_internal_org uuid; v_owners jsonb; v_next_id uuid;
BEGIN
  IF correlation_id IS NULL OR mmhr_private.r7_invoice_read_input_ok(payload,'owners') IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid managed invoice owner read'; END IF;
  v_org_id:=(payload->>'organizationId')::uuid; v_event_id:=(payload->>'commissionEventId')::uuid; v_after_id:=(payload->>'afterId')::uuid;
  PERFORM mmhr_private.r1_lock_security(); v_actor:=mmhr_private.r7_invoice_actor(v_org_id,v_event_id);
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice owner read denied'; END IF;
  SELECT s.agreement_organization_id INTO v_internal_org FROM public.managed_commission_sources s WHERE s.organization_id=v_org_id AND s.commission_event_id=v_event_id;
  WITH candidates AS (
    SELECT i.id,jsonb_build_object('identityId',i.id,'label',left(mmhr_private.r7_managed_identity_label(i.id),320)) AS item
    FROM public.identities i JOIN public.org_members m ON m.identity_id=i.id AND m.org_id=v_internal_org AND m.status='active' AND NOT m.migration_review_required
    WHERE (v_after_id IS NULL OR i.id>v_after_id) AND mmhr_private.r7_invoice_owner_ok(i.id,v_org_id,v_internal_org,clock_timestamp())
    ORDER BY i.id LIMIT 26
  ), numbered AS (SELECT *,row_number() OVER(ORDER BY id) AS ordinal FROM candidates)
  SELECT coalesce(jsonb_agg(item ORDER BY id) FILTER(WHERE ordinal<=25),'[]'::jsonb),
    CASE WHEN count(*)=26 THEN (array_agg(id ORDER BY id))[25] ELSE NULL END INTO v_owners,v_next_id FROM numbered;
  RETURN jsonb_build_object('organizationId',v_org_id,'correlationId',correlation_id,'commissionEventId',v_event_id,'owners',v_owners,'nextCursor',v_next_id);
END $$;

CREATE FUNCTION public.mmhr_get_managed_invoice_source(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_org_id uuid; v_event_id uuid; v_calculation_id uuid; v_observation jsonb;
BEGIN
  IF correlation_id IS NULL OR mmhr_private.r7_invoice_read_input_ok(payload,'source') IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid managed invoice source read'; END IF;
  v_org_id:=(payload->>'organizationId')::uuid; v_event_id:=(payload->>'commissionEventId')::uuid; v_calculation_id:=(payload->>'calculationId')::uuid;
  PERFORM mmhr_private.r1_lock_security();
  IF mmhr_private.r7_invoice_actor(v_org_id,v_event_id) IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice source read denied'; END IF;
  v_observation:=mmhr_private.r7_invoice_observation(v_org_id,v_event_id,v_calculation_id,payload->'supportingSources');
  IF v_observation IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice source is not eligible'; END IF;
  RETURN jsonb_build_object('organizationId',v_org_id,'correlationId',correlation_id,'commissionEventId',v_event_id,'calculationId',v_calculation_id,
    'eventRevision',v_observation->'event'->'event_revision','calculationRevision',v_observation->'calculation'->'calculation_revision',
    'sourceDigest',mmhr_private.r7_managed_digest(v_observation),'amountMinorUnits',v_observation->'event'->'commission_amount_minor_units',
    'currency',v_observation->'event'->'currency','supportingSources',payload->'supportingSources');
END $$;

CREATE FUNCTION public.mmhr_get_managed_invoice_detail(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_org_id uuid; v_event_id uuid; v_actor uuid; v_after_id uuid; v_internal_org uuid;
  v_event public.commission_events%ROWTYPE; v_invoice public.finance_invoices%ROWTYPE; v_p public.managed_invoice_preparations%ROWTYPE;
  v_calculation public.managed_commission_calculations%ROWTYPE; v_agreement public.finance_agreement_versions%ROWTYPE; v_facts public.finance_contract_facts_versions%ROWTYPE;
  v_observation jsonb; v_originals jsonb; v_mandatory jsonb:='[]'; v_invoice_json jsonb; v_preparation_json jsonb; v_rows jsonb; v_next_id uuid;
  v_source_current boolean; v_owner_current boolean:=false; v_reviewer_current boolean:=false; v_can_reject boolean:=false;
BEGIN
  IF correlation_id IS NULL OR mmhr_private.r7_invoice_read_input_ok(payload,'detail') IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid managed invoice detail'; END IF;
  v_org_id:=(payload->>'organizationId')::uuid; v_event_id:=(payload->>'commissionEventId')::uuid; v_after_id:=(payload->>'afterPreparationId')::uuid;
  PERFORM mmhr_private.r1_lock_security(); v_actor:=mmhr_private.r7_invoice_actor(v_org_id,v_event_id);
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice detail denied'; END IF;
  SELECT * INTO v_event FROM public.commission_events e WHERE e.id=v_event_id AND e.organization_id=v_org_id AND e.source_mode='managed';
  SELECT s.agreement_organization_id INTO v_internal_org FROM public.managed_commission_sources s WHERE s.organization_id=v_org_id AND s.commission_event_id=v_event_id;
  SELECT * INTO v_calculation FROM public.managed_commission_calculations c WHERE c.organization_id=v_org_id AND c.commission_event_id=v_event_id
    AND c.state='approved' AND c.calculation_revision=v_event.calculation_revision;
  SELECT * INTO v_invoice FROM public.finance_invoices i WHERE i.organization_id=v_org_id AND i.commission_event_id=v_event_id AND i.source_mode='managed'
    AND i.status<>'voided' AND (NOT payload ? 'invoiceId' OR i.id=(payload->>'invoiceId')::uuid);
  IF payload ? 'invoiceId' AND v_invoice.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice selected target denied'; END IF;
  IF v_calculation.id IS NOT NULL THEN
    SELECT a.* INTO v_agreement FROM public.finance_agreement_versions a JOIN public.managed_commission_sources s ON s.agreement_organization_id=a.organization_id
      AND s.agreement_version_id=a.id WHERE s.commission_event_id=v_event_id AND s.organization_id=v_org_id;
    SELECT * INTO v_facts FROM public.finance_contract_facts_versions f WHERE f.id=v_calculation.facts_version_id AND f.organization_id=v_org_id AND f.contract_id=v_event.contract_id;
    v_mandatory:=jsonb_build_array(jsonb_build_object('organizationId',v_agreement.organization_id,'documentId',v_agreement.source_document_id,
      'versionId',v_agreement.source_version_id,'sha256',v_agreement.source_sha256),jsonb_build_object('organizationId',v_facts.organization_id,
      'documentId',v_facts.source_document_id,'versionId',v_facts.source_version_id,'sha256',v_facts.source_sha256));
    IF mmhr_private.r7_invoice_originals_ok(v_event_id,v_calculation.id,v_mandatory,false) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice historical sources denied'; END IF;
  END IF;
  IF v_invoice.id IS NOT NULL THEN
    SELECT * INTO v_p FROM public.managed_invoice_preparations x WHERE x.id=v_invoice.current_preparation_id AND x.organization_id=v_org_id AND x.invoice_id=v_invoice.id;
    IF v_p.id IS NULL OR mmhr_private.r7_invoice_originals_ok(v_event_id,v_p.calculation_id,v_p.supporting_sources,false) IS NOT TRUE
      OR v_invoice.issue_date IS DISTINCT FROM (v_p.issue_date AT TIME ZONE 'UTC')::date
      OR v_invoice.due_date IS DISTINCT FROM (v_p.due_date AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice current preparation denied'; END IF;
    SELECT jsonb_agg(mmhr_private.r7_managed_original_metadata((s.value->>'organizationId')::uuid,(s.value->>'documentId')::uuid,
      (s.value->>'versionId')::uuid) ORDER BY s.ordinality) INTO v_originals FROM jsonb_array_elements(v_p.supporting_sources) WITH ORDINALITY s(value,ordinality);
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_originals) original WHERE original='null'::jsonb) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed invoice original metadata denied'; END IF;
    IF v_event.state='approved' THEN
      v_observation:=mmhr_private.r7_invoice_observation(v_org_id,v_event_id,v_p.calculation_id,v_p.supporting_sources);
      v_source_current:=v_observation IS NOT NULL AND v_observation=v_p.source_observation;
    END IF;
    v_owner_current:=mmhr_private.r7_invoice_owner_ok(v_p.owner_identity_id,v_org_id,v_internal_org,clock_timestamp());
    v_reviewer_current:=coalesce(mmhr_private.r7_invoice_owner_ok(v_p.decided_by_identity_id,v_org_id,v_internal_org,clock_timestamp()),false);
    v_can_reject:=v_p.state='pending' AND v_p.revision=1 AND v_p.prepared_by_identity_id<>v_actor AND v_invoice.status='draft'
      AND v_event.state='approved' AND v_event.event_revision=v_p.expected_event_revision AND v_invoice.invoice_revision=v_p.expected_invoice_revision+1;
    v_invoice_json:=jsonb_build_object('invoiceId',v_invoice.id,'commissionEventId',v_event_id,'vendorOrganizationId',v_invoice.vendor_organization_id,
      'invoiceRevision',v_invoice.invoice_revision,'status',v_invoice.status,'currentPreparationId',v_p.id,'invoiceNumber',v_invoice.invoice_number,
      'issueDate',v_p.issue_date,'dueDate',v_p.due_date,'amountMinorUnits',v_invoice.amount_minor_units,'currency',v_invoice.currency);
    v_preparation_json:=jsonb_build_object('preparationId',v_p.id,'revision',v_p.revision,'state',v_p.state,'ownerIdentityId',v_p.owner_identity_id,
      'ownerLabel',mmhr_private.r7_managed_identity_label(v_p.owner_identity_id),'preparedByIdentityId',v_p.prepared_by_identity_id,
      'preparedByLabel',mmhr_private.r7_managed_identity_label(v_p.prepared_by_identity_id),'preparedAt',v_p.prepared_at,
      'decidedByIdentityId',v_p.decided_by_identity_id,'decidedByLabel',mmhr_private.r7_managed_identity_label(v_p.decided_by_identity_id),
      'decidedAt',v_p.decided_at,'collectionTerms',v_p.collection_terms,'sourceDigest',v_p.source_digest,'supportingOriginals',v_originals,
      'sourceCurrent',v_source_current,'ownerCurrent',v_owner_current,'reviewerCurrent',v_reviewer_current,'canReject',v_can_reject,
      'canApprove',v_can_reject AND coalesce(v_source_current,false) AND v_owner_current,
      'canIssue',v_p.state='approved' AND v_invoice.status='ready' AND v_invoice.invoice_revision=v_p.expected_invoice_revision+2
        AND v_event.event_revision=v_p.expected_event_revision AND coalesce(v_source_current,false) AND v_owner_current AND v_reviewer_current AND v_p.issue_date<=clock_timestamp());
  END IF;
  WITH candidates AS (
    SELECT x.id,jsonb_build_object('preparationId',x.id,'revision',x.revision,'state',x.state,'preparedAt',x.prepared_at,
      'preparedByLabel',mmhr_private.r7_managed_identity_label(x.prepared_by_identity_id),'invoiceRevisionAfterPrepare',x.expected_invoice_revision+1) AS item
    FROM public.managed_invoice_preparations x WHERE x.organization_id=v_org_id AND x.invoice_id=v_invoice.id AND (v_after_id IS NULL OR x.id>v_after_id) ORDER BY x.id LIMIT 26
  ), numbered AS (SELECT *,row_number() OVER(ORDER BY id) AS ordinal FROM candidates)
  SELECT coalesce(jsonb_agg(item ORDER BY id) FILTER(WHERE ordinal<=25),'[]'::jsonb),
    CASE WHEN count(*)=26 THEN (array_agg(id ORDER BY id))[25] ELSE NULL END INTO v_rows,v_next_id FROM numbered;
  RETURN jsonb_build_object('organizationId',v_org_id,'correlationId',correlation_id,'commissionEventId',v_event_id,'currentActorIdentityId',v_actor,
    'eventRevision',v_event.event_revision,'eventState',v_event.state,'calculationId',v_calculation.id,'calculationRevision',v_event.calculation_revision,
    'mandatorySources',v_mandatory,'invoice',v_invoice_json,'currentPreparation',v_preparation_json,'preparations',v_rows,'nextPreparationCursor',v_next_id);
END $$;

REVOKE ALL ON FUNCTION mmhr_private.r7_invoice_read_input_ok(jsonb,text) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
REVOKE ALL ON FUNCTION public.mmhr_get_managed_invoice_owners(jsonb,uuid),public.mmhr_get_managed_invoice_source(jsonb,uuid),public.mmhr_get_managed_invoice_detail(jsonb,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_managed_invoice_owners(jsonb,uuid),public.mmhr_get_managed_invoice_source(jsonb,uuid),public.mmhr_get_managed_invoice_detail(jsonb,uuid) TO authenticated;
