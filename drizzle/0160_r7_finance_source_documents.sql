CREATE TABLE "mmhr_private"."finance_document_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"purpose" text NOT NULL,
	"actor_identity_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"correlation_id" uuid NOT NULL,
	CONSTRAINT "finance_document_access_grants_revision_ck" CHECK ("mmhr_private"."finance_document_access_grants"."revision" between 1 and 2147483646),
	CONSTRAINT "finance_document_access_grants_purpose_ck" CHECK ("mmhr_private"."finance_document_access_grants"."purpose" in ('finance_review','finance_original')),
	CONSTRAINT "finance_document_access_grants_token_ck" CHECK ("mmhr_private"."finance_document_access_grants"."access_token" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "finance_document_access_grants_lifetime_ck" CHECK ("mmhr_private"."finance_document_access_grants"."expires_at"="mmhr_private"."finance_document_access_grants"."created_at"+interval '60 seconds')
);
--> statement-breakpoint
CREATE TABLE "finance_document_approvals" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"upload_revision" integer NOT NULL,
	"sha256" text NOT NULL,
	"reviewed_access_id" uuid NOT NULL,
	"reviewer_identity_id" uuid NOT NULL,
	"approval_receipt_id" uuid NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	CONSTRAINT "finance_document_approvals_revision_ck" CHECK ("finance_document_approvals"."upload_revision" between 1 and 2147483647),
	CONSTRAINT "finance_document_approvals_hash_ck" CHECK ("finance_document_approvals"."sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "finance_document_sources" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"source_class" text NOT NULL,
	"vendor_organization_id" uuid NOT NULL,
	"contract_id" uuid,
	"handoff_id" uuid,
	"deal_id" uuid,
	"source_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_document_sources_class_ck" CHECK (("finance_document_sources"."source_class"='agreement' and "finance_document_sources"."contract_id" is null and "finance_document_sources"."handoff_id" is null and "finance_document_sources"."deal_id" is null)
    or ("finance_document_sources"."source_class"='signed_contract' and "finance_document_sources"."contract_id" is not null and "finance_document_sources"."handoff_id" is not null and "finance_document_sources"."deal_id" is not null)),
	CONSTRAINT "finance_document_sources_snapshot_ck" CHECK (jsonb_typeof("finance_document_sources"."source_snapshot")='object' and octet_length("finance_document_sources"."source_snapshot"::text)<=2000)
);
--> statement-breakpoint
ALTER TABLE "workflow_document_uploads" DROP CONSTRAINT "workflow_document_uploads_source_ck";--> statement-breakpoint
ALTER TABLE "mmhr_private"."finance_document_access_grants" ADD CONSTRAINT "finance_document_access_grants_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."finance_document_access_grants" ADD CONSTRAINT "finance_document_access_grants_upload_fk" FOREIGN KEY ("organization_id","version_id") REFERENCES "public"."workflow_document_uploads"("organization_id","version_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_document_approvals" ADD CONSTRAINT "finance_document_approvals_reviewed_access_id_finance_document_access_grants_id_fk" FOREIGN KEY ("reviewed_access_id") REFERENCES "mmhr_private"."finance_document_access_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_document_approvals" ADD CONSTRAINT "finance_document_approvals_reviewer_identity_id_identities_id_fk" FOREIGN KEY ("reviewer_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_document_approvals" ADD CONSTRAINT "finance_document_approvals_approval_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("approval_receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_document_approvals" ADD CONSTRAINT "finance_document_approvals_upload_fk" FOREIGN KEY ("organization_id","version_id") REFERENCES "public"."workflow_document_uploads"("organization_id","version_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_document_sources" ADD CONSTRAINT "finance_document_sources_vendor_organization_id_orgs_id_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_document_sources" ADD CONSTRAINT "finance_document_sources_upload_fk" FOREIGN KEY ("organization_id","version_id") REFERENCES "public"."workflow_document_uploads"("organization_id","version_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_document_sources" ADD CONSTRAINT "finance_document_sources_document_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."workflow_documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_document_access_grants_session_idx" ON "mmhr_private"."finance_document_access_grants" USING btree ("session_id","version_id","expires_at");--> statement-breakpoint
ALTER TABLE "workflow_document_uploads" ADD CONSTRAINT "workflow_document_uploads_source_ck" CHECK (("workflow_document_uploads"."source_kind" in ('workspace','finance') and "workflow_document_uploads"."rfp_recipient_id" is null and "workflow_document_uploads"."demo_id" is null)
    or ("workflow_document_uploads"."source_kind" = 'rfp_response' and "workflow_document_uploads"."rfp_recipient_id" is not null and "workflow_document_uploads"."demo_id" is null)
    or ("workflow_document_uploads"."source_kind" = 'demo_evidence' and "workflow_document_uploads"."demo_id" is not null and "workflow_document_uploads"."rfp_recipient_id" is null));
--> statement-breakpoint
-- Append after generated table DDL. No Storage policy installation occurs here.
CREATE FUNCTION mmhr_private.r7_finance_document_actor(requested_org uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=mmhr_private.r4_workspace_document_reader(requested_org); v_checked timestamptz:=clock_timestamp();
BEGIN
  IF v_actor IS NULL OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2'
    OR NOT mmhr_private.r1_evaluate_permission(v_actor,'admin.access',NULL,'aal2',v_checked,false)
    OR NOT mmhr_private.r1_evaluate_permission(v_actor,'finance.manage',requested_org,'aal2',v_checked,false) THEN RETURN NULL; END IF;
  RETURN v_actor;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r7_finance_document_actor(uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r7_finance_document_source_integrity(requested_org uuid,source jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_class text:=source->>'sourceClass'; v_vendor uuid;
BEGIN
  IF jsonb_typeof(source) IS DISTINCT FROM 'object' OR v_class IS NULL OR v_class NOT IN ('agreement','signed_contract')
    OR coalesce(source->>'vendorOrganizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  v_vendor:=(source->>'vendorOrganizationId')::uuid;
  IF requested_org=v_vendor OR NOT EXISTS(SELECT 1 FROM public.orgs o WHERE o.id=v_vendor AND o.type='vendor') THEN RETURN false; END IF;
  IF v_class='agreement' THEN
    RETURN (SELECT count(*)=2 FROM jsonb_object_keys(source)) AND source ?& ARRAY['sourceClass','vendorOrganizationId']
      AND EXISTS(SELECT 1 FROM public.orgs o WHERE o.id=requested_org AND o.type='internal' AND o.status='active' AND NOT o.migration_review_required);
  END IF;
  IF NOT(source ?& ARRAY['sourceClass','vendorOrganizationId','contractId','handoffId','dealId'])
    OR (SELECT count(*) FROM jsonb_object_keys(source))<>5
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['contractId','handoffId','dealId']) k
      WHERE coalesce(source->>k,'') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM public.portal_contract_handoff_details p
    JOIN public.contract_handoffs h ON h.id=p.handoff_id AND h.organization_id=p.organization_id
    JOIN public.portal_contract_selections s ON s.id=p.selection_id AND s.organization_id=p.organization_id AND s.handoff_id=h.id
    JOIN public.deals d ON d.id=h.deal_id AND d.organization_id=h.organization_id AND d.contract_id=p.contract_id
    JOIN public.orgs o ON o.id=p.organization_id AND o.type='customer' AND o.status='active' AND NOT o.migration_review_required
    WHERE p.organization_id=requested_org AND p.contract_id=(source->>'contractId')::uuid AND p.handoff_id=(source->>'handoffId')::uuid
      AND d.id=(source->>'dealId')::uuid AND h.vendor_organization_id=v_vendor AND h.customer_organization_id=requested_org
      AND h.status='signed' AND s.state='approved' AND s.deal_id=d.id AND p.signed_at IS NOT NULL
      AND p.signed_at>=p.introduced_at AND p.signed_at<=clock_timestamp() AND p.signature_recorded_by_identity_id IS NOT NULL
      AND EXISTS(SELECT 1 FROM public.portal_contract_handoff_events e WHERE e.handoff_id=h.id AND e.organization_id=requested_org
        AND e.action='record_signed' AND e.to_status='signed' AND e.actor_identity_id=p.signature_recorded_by_identity_id));
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r7_finance_document_source_integrity(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
--> statement-breakpoint
-- New reservations and review require live source eligibility. Retained originals
-- keep their immutable binding when a vendor later becomes unavailable.
CREATE FUNCTION mmhr_private.r7_finance_document_source_valid(requested_org uuid,source jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF mmhr_private.r7_finance_document_source_integrity(requested_org,source) IS DISTINCT FROM true THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM public.orgs o WHERE o.id=(source->>'vendorOrganizationId')::uuid AND o.type='vendor'
    AND o.status='active' AND NOT o.migration_review_required);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r7_finance_document_source_valid(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE public.finance_document_sources ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.finance_document_sources FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.finance_document_approvals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.finance_document_approvals FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mmhr_private.finance_document_access_grants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mmhr_private.finance_document_access_grants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.finance_document_sources,public.finance_document_approvals,mmhr_private.finance_document_access_grants
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r7_finance_document_binding_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_upload public.workflow_document_uploads%ROWTYPE; v_actor uuid;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document source is immutable'; END IF;
  v_actor:=mmhr_private.r7_finance_document_actor(NEW.organization_id);
  SELECT * INTO v_upload FROM public.workflow_document_uploads u WHERE u.version_id=NEW.version_id
    AND u.organization_id=NEW.organization_id AND u.document_id=NEW.document_id AND u.source_kind='finance'
    AND u.uploaded_by_identity_id=v_actor AND u.state='received' AND u.revision=1;
  IF NOT FOUND OR v_actor IS NULL OR NOT mmhr_private.r7_finance_document_source_valid(NEW.organization_id,NEW.source_snapshot)
    OR NEW.source_class IS DISTINCT FROM NEW.source_snapshot->>'sourceClass'
    OR NEW.vendor_organization_id IS DISTINCT FROM (NEW.source_snapshot->>'vendorOrganizationId')::uuid
    OR NEW.contract_id IS DISTINCT FROM (NEW.source_snapshot->>'contractId')::uuid
    OR NEW.handoff_id IS DISTINCT FROM (NEW.source_snapshot->>'handoffId')::uuid
    OR NEW.deal_id IS DISTINCT FROM (NEW.source_snapshot->>'dealId')::uuid THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document source association denied'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r7_finance_document_binding_guard() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE TRIGGER finance_document_sources_guard BEFORE INSERT OR UPDATE OR DELETE ON public.finance_document_sources
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_finance_document_binding_guard();
--> statement-breakpoint
CREATE TRIGGER finance_document_sources_no_truncate BEFORE TRUNCATE ON public.finance_document_sources
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r4_document_upload_history_is_immutable();
--> statement-breakpoint
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r7_finance_document_content_actor(requested_org uuid,requested_doc uuid,requested_version uuid,requested_revision integer,purpose text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_upload public.workflow_document_uploads%ROWTYPE; v_version public.workflow_document_versions%ROWTYPE; v_current integer;
BEGIN
  v_actor:=mmhr_private.r7_finance_document_actor(requested_org);
  IF v_actor IS NULL OR purpose IS NULL OR purpose NOT IN ('finance_review','finance_original') THEN RETURN NULL; END IF;
  SELECT u.* INTO v_upload FROM public.workflow_document_uploads u JOIN public.workflow_documents d ON d.id=u.document_id AND d.organization_id=u.organization_id
    JOIN public.finance_document_sources f ON f.version_id=u.version_id AND f.organization_id=u.organization_id AND f.document_id=u.document_id
    WHERE u.organization_id=requested_org AND u.document_id=requested_doc AND u.version_id=requested_version AND u.revision=requested_revision
      AND u.source_kind='finance' AND u.upload_organization_id=requested_org AND d.state='active' AND d.document_type='attachment'
      AND CASE WHEN purpose='finance_original' THEN mmhr_private.r7_finance_document_source_integrity(f.organization_id,f.source_snapshot)
        ELSE mmhr_private.r7_finance_document_source_valid(f.organization_id,f.source_snapshot) END;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_version FROM public.workflow_document_versions v WHERE v.id=requested_version AND v.organization_id=requested_org AND v.document_id=requested_doc;
  SELECT d.current_version INTO v_current FROM public.workflow_documents d WHERE d.id=requested_doc AND d.organization_id=requested_org;
  IF v_version.scan_state<>'clean' OR v_version.state NOT IN ('ready','approved')
    OR v_upload.scan_evidence->>'state' IS DISTINCT FROM 'clean' OR v_upload.scan_evidence->>'versionId' IS DISTINCT FROM requested_version::text
    OR v_upload.scan_evidence->>'sha256' IS DISTINCT FROM lower(v_version.sha256)
    OR v_version.storage_reference IS DISTINCT FROM 'quarantine://'||requested_org::text||'/'||requested_doc::text||'/'||requested_version::text THEN RETURN NULL; END IF;
  IF purpose='finance_review' THEN
    IF v_current<>v_version.version OR v_upload.state NOT IN ('ready','needs_review') OR v_actor=v_upload.uploaded_by_identity_id THEN RETURN NULL; END IF;
  ELSE
    IF v_upload.state NOT IN ('approved','superseded') OR v_version.state<>'approved' OR NOT EXISTS(
      SELECT 1 FROM public.finance_document_approvals a JOIN public.security_command_receipts r ON r.id=a.approval_receipt_id
      JOIN public.workflow_document_upload_events e ON e.version_id=a.version_id AND e.revision=a.upload_revision AND e.action='approve'
      WHERE a.version_id=requested_version AND a.organization_id=requested_org AND a.document_id=requested_doc AND a.sha256=lower(v_version.sha256)
        AND a.reviewer_identity_id<>v_upload.uploaded_by_identity_id AND e.actor_identity_id=a.reviewer_identity_id
        AND e.snapshot->>'sha256'=a.sha256 AND r.entity_id=requested_version AND r.command='r7.finance.document.review.approve'
        AND r.actor_identity_id=a.reviewer_identity_id AND r.action='document.approve') THEN RETURN NULL; END IF;
  END IF;
  RETURN v_actor;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r7_finance_document_content_actor(uuid,uuid,uuid,integer,text)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
-- Expansion only: register immutable workspace originals before Storage writes.
-- No bucket, Storage permission, scanner, or download access is activated here.
CREATE FUNCTION public.mmhr_reserve_finance_document(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE keys text[]:=ARRAY['organizationId','documentId','versionId','expectedVersion','fileName','contentType','byteSize','sha256','source'];
  requested_org uuid; doc_id uuid; requested_version uuid; actor uuid; checked_at timestamptz; receipt jsonb;
  doc public.workflow_documents%ROWTYPE; previous_upload public.workflow_document_uploads%ROWTYPE;
  expected_version integer; new_version integer; claims jsonb:=auth.jwt(); request_session uuid;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ?& keys)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE NOT(field=ANY(keys)))
    OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'documentId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'versionId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(payload->'expectedVersion') IS DISTINCT FROM 'number'
    OR coalesce(payload->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,4})$'
    OR jsonb_typeof(payload->'byteSize') IS DISTINCT FROM 'number'
    OR coalesce(payload->>'byteSize','') !~ '^[1-9][0-9]{0,7}$'
    OR (payload->>'byteSize')::integer NOT BETWEEN 1 AND 25000000
    OR jsonb_typeof(payload->'fileName') IS DISTINCT FROM 'string'
    OR octet_length(payload->>'fileName') NOT BETWEEN 1 AND 255
    OR payload->>'fileName' IS DISTINCT FROM btrim(payload->>'fileName')
    OR payload->>'fileName' ~ '[[:cntrl:]]' OR position('/' in payload->>'fileName')>0
    OR position(chr(92) in payload->>'fileName')>0
    OR coalesce(payload->>'sha256','') !~ '^[0-9a-f]{64}$'
    OR coalesce(payload->>'contentType','') NOT IN ('application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document reservation';
  END IF;
  requested_org:=(payload->>'organizationId')::uuid; doc_id:=(payload->>'documentId')::uuid;
  requested_version:=(payload->>'versionId')::uuid; expected_version:=(payload->>'expectedVersion')::integer;
  checked_at:=mmhr_private.r1_lock_security(); actor:=mmhr_private.r7_finance_document_actor(requested_org);
  IF actor IS NULL OR NOT mmhr_private.r7_finance_document_source_valid(requested_org,payload->'source') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document source denied'; END IF;
  receipt:=mmhr_private.r1_checked_receipt(actor,'r7.finance.document.reserve',idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    IF (receipt->>'entity_id')::uuid<>requested_version OR NOT EXISTS(SELECT 1 FROM public.workflow_document_uploads u
      WHERE u.version_id=requested_version AND u.document_id=doc_id AND u.organization_id=requested_org
        AND u.uploaded_by_identity_id=actor AND u.source_kind='finance' AND u.correlation_id=mmhr_reserve_finance_document.correlation_id
        AND EXISTS(SELECT 1 FROM public.finance_document_sources f WHERE f.version_id=u.version_id AND f.source_snapshot=payload->'source')) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document reservation replay denied';
    END IF;
    new_version:=expected_version+1;
  ELSE
    SELECT * INTO doc FROM public.workflow_documents WHERE id=doc_id FOR UPDATE;
    IF FOUND THEN
      IF doc.organization_id<>requested_org OR doc.state<>'active' OR doc.current_version<>expected_version
        OR doc.document_type<>'attachment' THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document version reservation denied';
      END IF;
      SELECT u.* INTO previous_upload FROM public.workflow_document_uploads u
        JOIN public.workflow_document_versions v ON v.id=u.version_id AND v.organization_id=u.organization_id
        WHERE u.document_id=doc_id AND u.organization_id=requested_org AND v.version=doc.current_version;
      IF NOT FOUND OR previous_upload.source_kind<>'finance' OR previous_upload.state NOT IN ('approved','rejected')
        OR NOT EXISTS(SELECT 1 FROM public.finance_document_sources f WHERE f.version_id=previous_upload.version_id AND f.source_snapshot=payload->'source') THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Previous document review required';
      END IF;
      new_version:=expected_version+1;
      UPDATE public.workflow_documents SET current_version=new_version,updated_at=clock_timestamp() WHERE id=doc_id;
    ELSE
      IF expected_version<>0 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document version reservation denied'; END IF;
      new_version:=1;
      INSERT INTO public.workflow_documents(id,organization_id,document_type,current_version,state,created_by_identity_id)
        VALUES(doc_id,requested_org,'attachment',new_version,'active',actor);
    END IF;
    IF EXISTS(SELECT 1 FROM public.workflow_document_versions WHERE id=requested_version) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document version reservation denied';
    END IF;
    INSERT INTO public.workflow_document_versions(id,organization_id,document_id,version,state,sha256,storage_reference,
      content_type,byte_size,scan_state,created_by_identity_id)
      VALUES(requested_version,requested_org,doc_id,new_version,'ready',payload->>'sha256',
        'quarantine://'||requested_org::text||'/'||doc_id::text||'/'||requested_version::text,
        payload->>'contentType',(payload->>'byteSize')::integer,'pending',actor);
    INSERT INTO public.workflow_document_uploads(version_id,organization_id,document_id,upload_organization_id,
      uploaded_by_identity_id,source_kind,file_name,correlation_id)
      VALUES(requested_version,requested_org,doc_id,requested_org,actor,'finance',payload->>'fileName',correlation_id);
    INSERT INTO public.finance_document_sources(organization_id,document_id,version_id,source_class,vendor_organization_id,contract_id,handoff_id,deal_id,source_snapshot)
      VALUES(requested_org,doc_id,requested_version,payload->'source'->>'sourceClass',(payload->'source'->>'vendorOrganizationId')::uuid,
        (payload->'source'->>'contractId')::uuid,(payload->'source'->>'handoffId')::uuid,(payload->'source'->>'dealId')::uuid,payload->'source');
    INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,actor_identity_id,snapshot,correlation_id)
      VALUES(requested_org,requested_version,1,'reserve',actor,jsonb_build_object('state','received','version',new_version),correlation_id);
    PERFORM mmhr_private.r1_finish_security_command(actor,'r7.finance.document.reserve','document.reserve','workflow_document_version',requested_version,requested_org,
      'Reserve private document upload',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),
      jsonb_build_object('status','completed'),checked_at);
  END IF;
  RETURN jsonb_build_object('organizationId',requested_org,'documentId',doc_id,'versionId',requested_version,'version',new_version,
    'state','received','revision',1,'correlationId',correlation_id,'outcomeCode',CASE WHEN receipt IS NULL THEN 'recorded' ELSE 'replayed' END);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_reserve_finance_document(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_reserve_finance_document(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_complete_finance_document_upload(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE keys text[]:=ARRAY['organizationId','documentId','versionId','expectedRevision']; requested_org uuid;
  requested_doc uuid; requested_version uuid; actor uuid; checked_at timestamptz; receipt jsonb;
  upload public.workflow_document_uploads%ROWTYPE; version_row public.workflow_document_versions%ROWTYPE;
  object_record record; object_count integer; object_path text; queued_job uuid:=gen_random_uuid();
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ?& keys)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE NOT(field=ANY(keys)))
    OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'documentId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'versionId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR payload->'expectedRevision' IS DISTINCT FROM '1'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document upload completion'; END IF;
  requested_org:=(payload->>'organizationId')::uuid; requested_doc:=(payload->>'documentId')::uuid;
  requested_version:=(payload->>'versionId')::uuid; checked_at:=mmhr_private.r1_lock_security();
  actor:=mmhr_private.r7_finance_document_actor(requested_org);
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document upload completion denied'; END IF;
  SELECT * INTO upload FROM public.workflow_document_uploads u WHERE u.version_id=requested_version
    AND u.organization_id=requested_org AND u.document_id=requested_doc AND u.uploaded_by_identity_id=actor AND u.source_kind='finance' FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.finance_document_sources f WHERE f.version_id=requested_version
    AND mmhr_private.r7_finance_document_source_valid(f.organization_id,f.source_snapshot)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document upload completion denied'; END IF;
  receipt:=mmhr_private.r1_checked_receipt(actor,'r7.finance.document.uploaded',idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    IF (receipt->>'entity_id')::uuid<>requested_version OR NOT EXISTS(SELECT 1 FROM public.workflow_document_upload_events e
      WHERE e.version_id=requested_version AND e.revision=2 AND e.action='uploaded' AND e.actor_identity_id=actor
        AND e.correlation_id=mmhr_complete_finance_document_upload.correlation_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document upload replay denied'; END IF;
  ELSE
    IF upload.state<>'received' OR upload.revision<>1 OR upload.processing_job_id IS NOT NULL
      OR upload.created_at<=clock_timestamp()-interval '10 minutes' OR to_regclass('storage.objects') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document upload completion denied'; END IF;
    SELECT v.* INTO version_row FROM public.workflow_document_versions v JOIN public.workflow_documents d
      ON d.id=v.document_id AND d.organization_id=v.organization_id WHERE v.id=requested_version
      AND v.organization_id=requested_org AND v.document_id=requested_doc AND v.scan_state='pending' AND v.state='ready'
      AND d.state='active' AND d.current_version=v.version;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document upload completion denied'; END IF;
    object_path:=requested_org::text||'/'||requested_doc::text||'/'||requested_version::text;
    EXECUTE $query$SELECT o.metadata,o.owner_id,b.public,b.file_size_limit FROM storage.objects o
      JOIN storage.buckets b ON b.id=o.bucket_id WHERE o.bucket_id='mmhr-document-quarantine' AND o.name=$1$query$
      INTO object_record USING object_path;
    GET DIAGNOSTICS object_count=ROW_COUNT;
    IF object_count<>1 OR object_record.public IS DISTINCT FROM false OR object_record.file_size_limit IS DISTINCT FROM 25000000::bigint
      OR object_record.owner_id IS DISTINCT FROM auth.uid()::text
      OR jsonb_typeof(object_record.metadata) IS DISTINCT FROM 'object'
      OR object_record.metadata->>'size' IS DISTINCT FROM version_row.byte_size::text
      OR object_record.metadata->>'mimetype' IS DISTINCT FROM version_row.content_type THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Verified document object required'; END IF;
    INSERT INTO public.workflow_jobs(id,organization_id,job_type,correlation_id,idempotency_key,payload_references,
      maximum_attempts,state,created_by_identity_id)
      VALUES(queued_job,requested_org,'document_scan',upload.correlation_id,idempotency_key,
        jsonb_build_array(jsonb_build_object('documentId',requested_doc,'versionId',requested_version)),3,'queued',actor);
    UPDATE public.workflow_document_uploads SET state='quarantined',revision=2,processing_job_id=queued_job,updated_at=clock_timestamp()
      WHERE version_id=requested_version;
    INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,actor_identity_id,snapshot,correlation_id)
      VALUES(requested_org,requested_version,2,'uploaded',actor,jsonb_build_object('state','quarantined'),correlation_id);
    PERFORM mmhr_private.r1_finish_security_command(actor,'r7.finance.document.uploaded','document.uploaded','workflow_document_version',requested_version,requested_org,
      'Record private document upload',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),checked_at);
  END IF;
  RETURN jsonb_build_object('organizationId',requested_org,'documentId',requested_doc,'versionId',requested_version,
    'state','quarantined','revision',2,'correlationId',correlation_id,'outcomeCode',CASE WHEN receipt IS NULL THEN 'recorded' ELSE 'replayed' END);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_complete_finance_document_upload(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_complete_finance_document_upload(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_finance_documents(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE requested_org uuid; after_id uuid; rows jsonb; next_id uuid; actor uuid;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ? 'organizationId') OR correlation_id IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE field NOT IN ('organizationId','afterId'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR (payload ? 'afterId' AND coalesce(payload->>'afterId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document read'; END IF;
  requested_org:=(payload->>'organizationId')::uuid; after_id:=(payload->>'afterId')::uuid;
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r7_finance_document_actor(requested_org);
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document read denied'; END IF;
  WITH candidates AS (
    SELECT d.id,mmhr_private.r4_workspace_document_metadata(u,v,d.current_version) AS item
    FROM public.workflow_documents d JOIN public.workflow_document_versions v ON v.document_id=d.id AND v.organization_id=d.organization_id AND v.version=d.current_version
      JOIN public.workflow_document_uploads u ON u.version_id=v.id AND u.document_id=d.id AND u.organization_id=d.organization_id
    WHERE d.organization_id=requested_org AND d.state='active' AND d.document_type='attachment'
      AND u.source_kind='finance' AND EXISTS(SELECT 1 FROM public.finance_document_sources f WHERE f.version_id=u.version_id AND mmhr_private.r7_finance_document_source_integrity(f.organization_id,f.source_snapshot)) AND u.upload_organization_id=requested_org AND (after_id IS NULL OR d.id>after_id)
    ORDER BY d.id LIMIT 26
  ), numbered AS (SELECT *,row_number() OVER(ORDER BY id) AS ordinal FROM candidates)
  SELECT coalesce(jsonb_agg(item ORDER BY id) FILTER(WHERE ordinal<=25),'[]'::jsonb),
    CASE WHEN count(*)=26 THEN (array_agg(id ORDER BY id))[25] ELSE NULL END INTO rows,next_id FROM numbered;
  RETURN jsonb_build_object('organizationId',requested_org,'correlationId',correlation_id,
    'canUpload',mmhr_private.r7_finance_document_actor(requested_org) IS NOT NULL,'items',rows,'nextCursor',next_id);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_finance_documents(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_get_finance_documents(jsonb,uuid) TO authenticated;
--> statement-breakpoint
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_finance_document_versions(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE requested_org uuid; requested_doc uuid; after_version integer; current_version integer; rows jsonb; next_version integer; actor uuid;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ?& ARRAY['organizationId','documentId','afterVersion']) OR correlation_id IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE field NOT IN ('organizationId','documentId','afterVersion'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'documentId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(payload->'afterVersion') IS DISTINCT FROM 'number'
    OR coalesce(payload->>'afterVersion','') !~ '^(0|[1-9][0-9]{0,5})$'
    OR (payload->>'afterVersion')::numeric>100000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document version read'; END IF;
  requested_org:=(payload->>'organizationId')::uuid; requested_doc:=(payload->>'documentId')::uuid; after_version:=(payload->>'afterVersion')::integer;
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r7_finance_document_actor(requested_org);
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document read denied'; END IF;
  SELECT d.current_version INTO current_version FROM public.workflow_documents d
    JOIN public.workflow_document_versions v ON v.document_id=d.id AND v.organization_id=d.organization_id AND v.version=d.current_version
    JOIN public.workflow_document_uploads u ON u.version_id=v.id AND u.document_id=d.id AND u.organization_id=d.organization_id
    WHERE d.organization_id=requested_org AND d.id=requested_doc AND d.state='active' AND d.document_type='attachment'
      AND u.source_kind='finance' AND EXISTS(SELECT 1 FROM public.finance_document_sources f WHERE f.version_id=u.version_id AND mmhr_private.r7_finance_document_source_integrity(f.organization_id,f.source_snapshot)) AND u.upload_organization_id=requested_org;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document read denied'; END IF;
  WITH candidates AS (
    SELECT v.version,mmhr_private.r4_workspace_document_metadata(u,v,current_version) AS item FROM public.workflow_document_versions v
      JOIN public.workflow_document_uploads u ON u.version_id=v.id AND u.document_id=v.document_id AND u.organization_id=v.organization_id
    WHERE v.organization_id=requested_org AND v.document_id=requested_doc AND u.source_kind='finance' AND EXISTS(SELECT 1 FROM public.finance_document_sources f WHERE f.version_id=u.version_id AND mmhr_private.r7_finance_document_source_integrity(f.organization_id,f.source_snapshot)) AND u.upload_organization_id=requested_org
      AND v.version>after_version AND v.version<=current_version ORDER BY v.version LIMIT 26
  ), numbered AS (SELECT *,row_number() OVER(ORDER BY version) AS ordinal FROM candidates)
  SELECT coalesce(jsonb_agg(item ORDER BY version) FILTER(WHERE ordinal<=25),'[]'::jsonb),
    CASE WHEN count(*)=26 THEN (array_agg(version ORDER BY version))[25] ELSE NULL END INTO rows,next_version FROM numbered;
  RETURN jsonb_build_object('organizationId',requested_org,'documentId',requested_doc,'correlationId',correlation_id,'currentVersion',current_version,
    'canUpload',mmhr_private.r7_finance_document_actor(requested_org) IS NOT NULL,'items',rows,'nextVersion',next_version);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_finance_document_versions(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_get_finance_document_versions(jsonb,uuid) TO authenticated;
--> statement-breakpoint
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_finance_document_history(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE requested_org uuid; requested_doc uuid; requested_version uuid; after_revision integer; rows jsonb; next_revision integer; actor uuid;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ?& ARRAY['organizationId','documentId','versionId','afterRevision']) OR correlation_id IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE field NOT IN ('organizationId','documentId','versionId','afterRevision'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'documentId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'versionId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(payload->'afterRevision') IS DISTINCT FROM 'number'
    OR coalesce(payload->>'afterRevision','') !~ '^(0|[1-9][0-9]{0,9})$'
    OR (payload->>'afterRevision')::numeric>2147483646 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document history read'; END IF;
  requested_org:=(payload->>'organizationId')::uuid; requested_doc:=(payload->>'documentId')::uuid;
  requested_version:=(payload->>'versionId')::uuid; after_revision:=(payload->>'afterRevision')::integer;
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r7_finance_document_actor(requested_org);
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.workflow_documents d
    JOIN public.workflow_document_versions v ON v.document_id=d.id AND v.organization_id=d.organization_id
    JOIN public.workflow_document_uploads u ON u.version_id=v.id AND u.document_id=d.id AND u.organization_id=d.organization_id
    WHERE d.organization_id=requested_org AND d.id=requested_doc AND v.id=requested_version AND d.state='active' AND d.document_type='attachment'
      AND u.source_kind='finance' AND EXISTS(SELECT 1 FROM public.finance_document_sources f WHERE f.version_id=u.version_id AND mmhr_private.r7_finance_document_source_integrity(f.organization_id,f.source_snapshot)) AND u.upload_organization_id=requested_org) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document read denied'; END IF;
  WITH candidates AS (
    SELECT e.revision,jsonb_build_object('revision',e.revision,'action',e.action,'occurredAt',e.created_at) AS item
    FROM public.workflow_document_upload_events e WHERE e.organization_id=requested_org AND e.version_id=requested_version AND e.revision>after_revision
    ORDER BY e.revision LIMIT 26
  ), numbered AS (SELECT *,row_number() OVER(ORDER BY revision) AS ordinal FROM candidates)
  SELECT coalesce(jsonb_agg(item ORDER BY revision) FILTER(WHERE ordinal<=25),'[]'::jsonb),
    CASE WHEN count(*)=26 THEN (array_agg(revision ORDER BY revision))[25] ELSE NULL END INTO rows,next_revision FROM numbered;
  RETURN jsonb_build_object('organizationId',requested_org,'documentId',requested_doc,'versionId',requested_version,'correlationId',correlation_id,
    'items',rows,'nextRevision',next_revision);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_finance_document_history(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_get_finance_document_history(jsonb,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_finance_document_review(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org_id uuid; doc_id uuid; ver_id uuid; upload public.workflow_document_uploads%ROWTYPE;
  version_row public.workflow_document_versions%ROWTYPE; actor uuid; current_version integer;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ?& ARRAY['organizationId','documentId','versionId'])
    OR correlation_id IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE field NOT IN ('organizationId','documentId','versionId'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'documentId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'versionId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document review'; END IF;
  org_id:=(payload->>'organizationId')::uuid; doc_id:=(payload->>'documentId')::uuid; ver_id:=(payload->>'versionId')::uuid;
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r7_finance_document_actor(org_id);
  SELECT u.* INTO upload FROM public.workflow_document_uploads u
    JOIN public.workflow_documents d ON d.id=u.document_id AND d.organization_id=u.organization_id
    JOIN public.workflow_document_versions v ON v.id=u.version_id AND v.document_id=d.id AND v.organization_id=d.organization_id
    WHERE u.organization_id=org_id AND u.document_id=doc_id AND u.version_id=ver_id
      AND u.source_kind='finance' AND u.upload_organization_id=org_id AND EXISTS(SELECT 1 FROM public.finance_document_sources f WHERE f.version_id=u.version_id AND mmhr_private.r7_finance_document_source_integrity(f.organization_id,f.source_snapshot)) AND d.state='active' AND d.document_type='attachment';
  IF actor IS NULL OR NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document review denied'; END IF;
  SELECT d.current_version INTO current_version FROM public.workflow_documents d WHERE d.id=doc_id AND d.organization_id=org_id;
  SELECT * INTO version_row FROM public.workflow_document_versions WHERE id=ver_id;
  RETURN jsonb_build_object('organizationId',org_id,'correlationId',correlation_id,
    'document',mmhr_private.r4_workspace_document_metadata(upload,version_row,current_version),
    'canReview',mmhr_private.r7_finance_document_content_actor(org_id,doc_id,ver_id,upload.revision,'finance_review') IS NOT NULL);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_finance_document_review(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_get_finance_document_review(jsonb,uuid) TO authenticated;
--> statement-breakpoint
--> statement-breakpoint
-- Immutable, private, short-lived access grants. The token is never audit data.
-- These links still require the original live Auth session and current authority.
CREATE FUNCTION public.mmhr_issue_finance_document_access(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org_id uuid; doc_id uuid; ver_id uuid; actor uuid; checked_at timestamptz; receipt jsonb;
  access_row mmhr_private.finance_document_access_grants%ROWTYPE; access_revision integer; requested_purpose text;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ?& ARRAY['organizationId','documentId','versionId','expectedRevision','purpose'])
    OR correlation_id IS NULL OR idempotency_key IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE field NOT IN ('organizationId','documentId','versionId','expectedRevision','purpose'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'documentId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'versionId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(payload->'expectedRevision') IS DISTINCT FROM 'number'
    OR coalesce(payload->>'expectedRevision','') !~ '^[1-9][0-9]{0,9}$'
    OR (payload->>'expectedRevision')::numeric>2147483646
    OR coalesce(payload->>'purpose','') NOT IN ('finance_review','finance_original') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document access'; END IF;
  org_id:=(payload->>'organizationId')::uuid; doc_id:=(payload->>'documentId')::uuid; ver_id:=(payload->>'versionId')::uuid;
  access_revision:=(payload->>'expectedRevision')::integer; requested_purpose:=payload->>'purpose';
  checked_at:=mmhr_private.r1_lock_security(); actor:=mmhr_private.r7_finance_document_content_actor(org_id,doc_id,ver_id,access_revision,requested_purpose);
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document access denied'; END IF;
  receipt:=mmhr_private.r1_checked_receipt(actor,'r7.finance.document.access.issue',idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    SELECT a.* INTO access_row FROM mmhr_private.finance_document_access_grants a WHERE a.id=(receipt->>'entity_id')::uuid
      AND a.organization_id=org_id AND a.document_id=doc_id AND a.version_id=ver_id AND a.actor_identity_id=actor
      AND a.session_id=(auth.jwt()->>'session_id')::uuid AND a.revision=access_revision
      AND a.purpose=requested_purpose AND a.correlation_id=mmhr_issue_finance_document_access.correlation_id AND a.expires_at>clock_timestamp();
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document access retry expired'; END IF;
  ELSE
    IF (SELECT count(*) FROM mmhr_private.finance_document_access_grants a WHERE a.actor_identity_id=actor AND a.session_id=(auth.jwt()->>'session_id')::uuid
      AND a.expires_at>clock_timestamp())>=16 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document access limit reached'; END IF;
    INSERT INTO mmhr_private.finance_document_access_grants(organization_id,document_id,version_id,revision,purpose,actor_identity_id,session_id,
      access_token,created_at,expires_at,correlation_id)
      VALUES(org_id,doc_id,ver_id,access_revision,requested_purpose,actor,(auth.jwt()->>'session_id')::uuid,
        encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex'),checked_at,checked_at+interval '60 seconds',correlation_id)
      RETURNING * INTO access_row;
    PERFORM mmhr_private.r1_finish_security_command(actor,'r7.finance.document.access.issue','document.access.requested','document_access_grant',access_row.id,org_id,
      'Request bounded private document access',correlation_id,idempotency_key,payload,NULL,
      jsonb_build_object('status','active','record_id',ver_id),checked_at);
  END IF;
  RETURN jsonb_build_object('organizationId',org_id,'documentId',doc_id,'versionId',ver_id,'revision',access_revision,'purpose',requested_purpose,
    'accessId',access_row.id,'accessToken',access_row.access_token,'issuedAt',access_row.created_at,'expiresAt',access_row.expires_at,
    'correlationId',correlation_id,'outcomeCode',CASE WHEN receipt IS NULL THEN 'recorded' ELSE 'replayed' END);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_issue_finance_document_access(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_issue_finance_document_access(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
--> statement-breakpoint
CREATE FUNCTION public.mmhr_resolve_finance_document_access(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org_id uuid; access_row mmhr_private.finance_document_access_grants%ROWTYPE; actor uuid;
  version_row public.workflow_document_versions%ROWTYPE; upload public.workflow_document_uploads%ROWTYPE;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ?& ARRAY['organizationId','accessId','accessToken'])
    OR correlation_id IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE field NOT IN ('organizationId','accessId','accessToken'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'accessId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'accessToken','') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document access'; END IF;
  org_id:=(payload->>'organizationId')::uuid; PERFORM mmhr_private.r1_lock_security();
  actor:=mmhr_private.r7_finance_document_actor(org_id);
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document access denied'; END IF;
  SELECT * INTO access_row FROM mmhr_private.finance_document_access_grants WHERE id=(payload->>'accessId')::uuid
    AND organization_id=org_id AND access_token=payload->>'accessToken' AND session_id=(auth.jwt()->>'session_id')::uuid
    AND expires_at>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document access denied'; END IF;
  actor:=mmhr_private.r7_finance_document_content_actor(org_id,access_row.document_id,access_row.version_id,access_row.revision,access_row.purpose);
  IF actor IS DISTINCT FROM access_row.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document access denied'; END IF;
  SELECT * INTO version_row FROM public.workflow_document_versions WHERE id=access_row.version_id;
  SELECT * INTO upload FROM public.workflow_document_uploads WHERE version_id=access_row.version_id;
  RETURN jsonb_build_object('organizationId',org_id,'accessId',access_row.id,'documentId',access_row.document_id,'versionId',access_row.version_id,
    'revision',access_row.revision,'purpose',access_row.purpose,'correlationId',correlation_id,'expiresAt',access_row.expires_at,
    'fileName',upload.file_name,'contentType',version_row.content_type,'byteSize',version_row.byte_size,'sha256',lower(version_row.sha256));
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_resolve_finance_document_access(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_resolve_finance_document_access(jsonb,uuid) TO authenticated;
--> statement-breakpoint
--> statement-breakpoint
CREATE FUNCTION public.mmhr_record_finance_document_review(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE required_keys text[]:=ARRAY['organizationId','documentId','versionId','expectedRevision','action','reason','reviewReference'];
  org_id uuid; doc_id uuid; ver_id uuid; requested_revision integer; requested_action text; actor uuid; checked_at timestamptz;
  receipt jsonb; command_key text; target_state text; upload public.workflow_document_uploads%ROWTYPE;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ?& required_keys) OR correlation_id IS NULL OR idempotency_key IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE field NOT IN ('organizationId','documentId','versionId','expectedRevision','action','reason','reviewReference','reviewedAccessId','contentsReviewed'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'documentId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'versionId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(payload->'expectedRevision') IS DISTINCT FROM 'number'
    OR coalesce(payload->>'expectedRevision','') !~ '^[1-9][0-9]{0,9}$' OR (payload->>'expectedRevision')::numeric>2147483646
    OR coalesce(payload->>'action','') NOT IN ('begin_review','approve','reject')
    OR jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string' OR octet_length(btrim(payload->>'reason')) NOT BETWEEN 1 AND 2000
    OR payload->>'reason' ~ '[[:cntrl:]]' OR payload->>'reason' IS DISTINCT FROM btrim(payload->>'reason')
    OR NOT mmhr_private.r1_security_reason_is_safe(payload->>'reason')
    OR jsonb_typeof(payload->'reviewReference') IS DISTINCT FROM 'string'
    OR octet_length(payload->>'reviewReference') NOT BETWEEN 1 AND 500
    OR coalesce(payload->>'reviewReference','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document review'; END IF;
  requested_action:=payload->>'action';
  IF (requested_action='begin_review' AND (payload ? 'reviewedAccessId' OR payload ? 'contentsReviewed'))
    OR (requested_action<>'begin_review' AND (payload->'contentsReviewed' IS DISTINCT FROM 'true'::jsonb
      OR coalesce(payload->>'reviewedAccessId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Explicit document review required'; END IF;
  org_id:=(payload->>'organizationId')::uuid; doc_id:=(payload->>'documentId')::uuid; ver_id:=(payload->>'versionId')::uuid;
  requested_revision:=(payload->>'expectedRevision')::integer; command_key:='r7.finance.document.review.'||requested_action;
  target_state:=CASE requested_action WHEN 'begin_review' THEN 'needs_review' WHEN 'approve' THEN 'approved' ELSE 'rejected' END;
  checked_at:=mmhr_private.r1_lock_security(); actor:=mmhr_private.r7_finance_document_actor(org_id);
  SELECT * INTO upload FROM public.workflow_document_uploads WHERE version_id=ver_id AND organization_id=org_id AND document_id=doc_id FOR UPDATE;
  IF actor IS NULL OR NOT FOUND OR actor=upload.uploaded_by_identity_id OR upload.source_kind<>'finance' OR upload.upload_organization_id<>org_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document review denied'; END IF;
  receipt:=mmhr_private.r1_checked_receipt(actor,command_key,idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    IF (receipt->>'entity_id')::uuid IS DISTINCT FROM ver_id OR NOT EXISTS(SELECT 1 FROM public.workflow_document_upload_events e
      WHERE e.version_id=ver_id AND e.organization_id=org_id AND e.revision=requested_revision+1 AND e.actor_identity_id=actor
        AND e.action=CASE requested_action WHEN 'begin_review' THEN 'review_started' ELSE requested_action END
        AND e.correlation_id=mmhr_record_finance_document_review.correlation_id
        AND e.snapshot->>'sha256'=(SELECT lower(v.sha256) FROM public.workflow_document_versions v WHERE v.id=ver_id)) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document review replay denied'; END IF;
  ELSE
    IF mmhr_private.r7_finance_document_content_actor(org_id,doc_id,ver_id,requested_revision,'finance_review') IS DISTINCT FROM actor
      OR (requested_action='begin_review' AND upload.state<>'ready') OR (requested_action<>'begin_review' AND upload.state<>'needs_review') THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document review state denied'; END IF;
    IF requested_action<>'begin_review' AND NOT EXISTS(SELECT 1 FROM mmhr_private.finance_document_access_grants a
      WHERE a.id=(payload->>'reviewedAccessId')::uuid AND a.organization_id=org_id AND a.document_id=doc_id AND a.version_id=ver_id
        AND a.revision=requested_revision AND a.purpose='finance_review' AND a.actor_identity_id=actor
        AND a.session_id=(auth.jwt()->>'session_id')::uuid AND a.created_at>checked_at-interval '30 minutes') THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current document access request required'; END IF;
    UPDATE public.workflow_document_uploads SET state=target_state,revision=requested_revision+1,review_reason=payload->>'reason',
      approved_by_identity_id=CASE WHEN requested_action='approve' THEN actor ELSE NULL END,
      approved_at=CASE WHEN requested_action='approve' THEN checked_at ELSE NULL END,updated_at=checked_at WHERE version_id=ver_id;
    IF requested_action='approve' THEN UPDATE public.workflow_document_versions SET state='approved' WHERE id=ver_id; END IF;
    INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,actor_identity_id,snapshot,correlation_id)
      VALUES(org_id,ver_id,requested_revision+1,CASE requested_action WHEN 'begin_review' THEN 'review_started' ELSE requested_action END,actor,
        jsonb_build_object('state',target_state,'reason',payload->>'reason','reviewReference',payload->>'reviewReference',
          'reviewedAccessId',payload->>'reviewedAccessId','contentsReviewed',payload->'contentsReviewed',
          'sha256',(SELECT lower(v.sha256) FROM public.workflow_document_versions v WHERE v.id=ver_id),
          'idempotencyKey',idempotency_key),correlation_id);
    PERFORM mmhr_private.r1_finish_security_command(actor,command_key,'document.'||requested_action,'workflow_document_version',ver_id,org_id,
      payload->>'reason',correlation_id,idempotency_key,payload,NULL,
      jsonb_build_object('state','completed','record_id',ver_id),checked_at);
    IF requested_action='approve' THEN
      INSERT INTO public.finance_document_approvals(organization_id,document_id,version_id,upload_revision,sha256,reviewed_access_id,
        reviewer_identity_id,approval_receipt_id,approved_at)
        SELECT org_id,doc_id,ver_id,requested_revision+1,lower(v.sha256),(payload->>'reviewedAccessId')::uuid,actor,r.id,checked_at
        FROM public.workflow_document_versions v JOIN public.security_command_receipts r ON r.entity_id=ver_id
          AND r.actor_identity_id=actor AND r.command=command_key AND r.idempotency_key=mmhr_record_finance_document_review.idempotency_key
        WHERE v.id=ver_id;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document approval receipt missing'; END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('organizationId',org_id,'documentId',doc_id,'versionId',ver_id,'action',requested_action,
    'state',target_state,'revision',requested_revision+1,'correlationId',correlation_id,'outcomeCode',CASE WHEN receipt IS NULL THEN 'recorded' ELSE 'replayed' END);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_record_finance_document_review(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_record_finance_document_review(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r7_finance_document_approval_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document approval is immutable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workflow_document_uploads u
    JOIN public.workflow_document_versions v ON v.id=u.version_id AND v.organization_id=u.organization_id AND v.document_id=u.document_id
    JOIN mmhr_private.finance_document_access_grants g ON g.id=NEW.reviewed_access_id AND g.version_id=u.version_id
      AND g.organization_id=u.organization_id AND g.document_id=u.document_id AND g.revision=u.revision-1 AND g.purpose='finance_review'
    JOIN public.workflow_document_upload_events e ON e.version_id=u.version_id AND e.revision=u.revision AND e.action='approve'
    JOIN public.security_command_receipts r ON r.id=NEW.approval_receipt_id AND r.entity_id=u.version_id
      AND r.command='r7.finance.document.review.approve' AND r.action='document.approve'
    JOIN public.audit_events a ON a.id=r.audit_event_id AND a.organization_id=u.organization_id
      AND a.command=r.command AND a.action=r.action AND a.entity_type='workflow_document_version' AND a.entity_id=r.entity_id::text
      AND a.idempotency_key=r.idempotency_key::text
    WHERE u.version_id=NEW.version_id AND u.organization_id=NEW.organization_id AND u.document_id=NEW.document_id
      AND u.source_kind='finance' AND u.state='approved' AND u.revision=NEW.upload_revision AND u.approved_at=NEW.approved_at
      AND v.scan_state='clean' AND v.state='approved' AND lower(v.sha256)=NEW.sha256 AND e.snapshot->>'sha256'=NEW.sha256
      AND NEW.reviewer_identity_id=u.approved_by_identity_id AND NEW.reviewer_identity_id<>u.uploaded_by_identity_id
      AND e.actor_identity_id=NEW.reviewer_identity_id AND r.actor_identity_id=NEW.reviewer_identity_id
      AND a.actor_identity_id=NEW.reviewer_identity_id AND a.correlation_id=e.correlation_id
      AND g.actor_identity_id=NEW.reviewer_identity_id AND g.session_id=(auth.jwt()->>'session_id')::uuid
      AND g.created_at>NEW.approved_at-interval '30 minutes' AND NEW.reviewer_identity_id=mmhr_private.r7_finance_document_actor(NEW.organization_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document approval evidence denied'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r7_finance_document_approval_guard() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE TRIGGER finance_document_approvals_guard BEFORE INSERT OR UPDATE OR DELETE ON public.finance_document_approvals
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_finance_document_approval_guard();
--> statement-breakpoint
CREATE TRIGGER finance_document_approvals_no_truncate BEFORE TRUNCATE ON public.finance_document_approvals
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r4_document_upload_history_is_immutable();
--> statement-breakpoint
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r7_finance_document_grant_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP<>'INSERT' OR NEW.actor_identity_id IS DISTINCT FROM mmhr_private.r7_finance_document_content_actor(
    NEW.organization_id,NEW.document_id,NEW.version_id,NEW.revision,NEW.purpose)
    OR NEW.session_id IS DISTINCT FROM (auth.jwt()->>'session_id')::uuid OR NEW.created_at>clock_timestamp()
    OR NEW.created_at<clock_timestamp()-interval '10 seconds' OR NEW.expires_at<>NEW.created_at+interval '60 seconds' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document capability denied'; END IF;
  IF (SELECT count(*) FROM mmhr_private.finance_document_access_grants g WHERE g.actor_identity_id=NEW.actor_identity_id
    AND g.session_id=NEW.session_id AND g.expires_at>clock_timestamp())>=16 THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document capability limit reached'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r7_finance_document_grant_guard() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE TRIGGER finance_document_access_grants_guard BEFORE INSERT OR UPDATE OR DELETE ON mmhr_private.finance_document_access_grants
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_finance_document_grant_guard();
--> statement-breakpoint
CREATE TRIGGER finance_document_access_grants_no_truncate BEFORE TRUNCATE ON mmhr_private.finance_document_access_grants
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r4_document_upload_history_is_immutable();
--> statement-breakpoint
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r7_finance_document_grant_commit_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.security_command_receipts r JOIN public.audit_events a ON a.id=r.audit_event_id
    WHERE r.entity_id=NEW.id AND r.actor_identity_id=NEW.actor_identity_id AND r.command='r7.finance.document.access.issue'
      AND r.action='document.access.requested' AND a.organization_id=NEW.organization_id AND a.correlation_id=NEW.correlation_id
      AND a.actor_identity_id=NEW.actor_identity_id AND a.command=r.command AND a.action=r.action
      AND a.entity_type='document_access_grant' AND a.entity_id=NEW.id::text AND a.idempotency_key=r.idempotency_key::text
      AND r.request_digest=encode(sha256(convert_to(jsonb_build_object(
        'organizationId',NEW.organization_id,'documentId',NEW.document_id,'versionId',NEW.version_id,
        'expectedRevision',NEW.revision,'purpose',NEW.purpose)::text,'UTF8')),'hex')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document capability receipt missing'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r7_finance_document_grant_commit_guard() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER finance_document_grant_commit_guard AFTER INSERT ON mmhr_private.finance_document_access_grants
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_finance_document_grant_commit_guard();
--> statement-breakpoint
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r7_finance_document_commit_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_version uuid:=NEW.version_id; v_upload public.workflow_document_uploads%ROWTYPE;
  v_original public.workflow_document_versions%ROWTYPE; v_source jsonb; v_object_ok boolean;
BEGIN
  SELECT * INTO v_upload FROM public.workflow_document_uploads u WHERE u.version_id=v_version AND u.source_kind='finance';
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO v_original FROM public.workflow_document_versions v WHERE v.id=v_version;
  SELECT f.source_snapshot INTO v_source FROM public.finance_document_sources f WHERE f.version_id=v_version;
  IF NOT EXISTS(SELECT 1 FROM public.finance_document_sources f WHERE f.version_id=v_version AND f.organization_id=v_upload.organization_id
    AND f.document_id=v_upload.document_id) OR NOT EXISTS(SELECT 1 FROM public.workflow_document_upload_events e
      JOIN public.security_command_receipts r ON r.entity_id=e.version_id AND r.actor_identity_id=e.actor_identity_id
        AND r.command='r7.finance.document.reserve' AND r.action='document.reserve'
      JOIN public.audit_events a ON a.id=r.audit_event_id AND a.correlation_id=e.correlation_id
        AND a.organization_id=e.organization_id AND a.actor_identity_id=e.actor_identity_id
        AND a.command=r.command AND a.action=r.action AND a.entity_type='workflow_document_version' AND a.entity_id=r.entity_id::text
        AND a.idempotency_key=r.idempotency_key::text
      WHERE e.version_id=v_version AND e.revision=1 AND e.action='reserve' AND e.correlation_id=v_upload.correlation_id
        AND r.request_digest=encode(sha256(convert_to(jsonb_build_object('organizationId',v_upload.organization_id,
          'documentId',v_upload.document_id,'versionId',v_version,'expectedVersion',v_original.version-1,'fileName',v_upload.file_name,
          'contentType',v_original.content_type,'byteSize',v_original.byte_size,'sha256',lower(v_original.sha256),'source',v_source)::text,'UTF8')),'hex'))
    OR NOT EXISTS(SELECT 1 FROM public.workflow_document_upload_events e WHERE e.version_id=v_version AND e.revision=v_upload.revision
      AND e.organization_id=v_upload.organization_id AND e.snapshot->>'state'=v_upload.state)
    OR (v_upload.state='approved' AND NOT EXISTS(SELECT 1 FROM public.finance_document_approvals a
      WHERE a.version_id=v_version AND a.upload_revision=v_upload.revision)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document committed evidence missing'; END IF;
  IF v_upload.state<>'received' THEN
    IF NOT EXISTS(SELECT 1 FROM public.workflow_document_upload_events e
      JOIN public.security_command_receipts r ON r.entity_id=e.version_id AND r.actor_identity_id=e.actor_identity_id
        AND r.command='r7.finance.document.uploaded' AND r.action='document.uploaded'
      JOIN public.audit_events a ON a.id=r.audit_event_id AND a.correlation_id=e.correlation_id AND a.organization_id=e.organization_id
        AND a.actor_identity_id=e.actor_identity_id AND a.command=r.command AND a.action=r.action
        AND a.entity_type='workflow_document_version' AND a.entity_id=r.entity_id::text AND a.idempotency_key=r.idempotency_key::text
      JOIN public.workflow_jobs j ON j.id=v_upload.processing_job_id AND j.organization_id=v_upload.organization_id
        AND j.job_type='document_scan' AND j.created_by_identity_id=v_upload.uploaded_by_identity_id
        AND j.payload_references=jsonb_build_array(jsonb_build_object('documentId',v_upload.document_id,'versionId',v_version))
      WHERE e.version_id=v_version AND e.revision=2 AND e.action='uploaded' AND e.actor_identity_id=v_upload.uploaded_by_identity_id
        AND r.request_digest=encode(sha256(convert_to(jsonb_build_object('organizationId',v_upload.organization_id,
          'documentId',v_upload.document_id,'versionId',v_version,'expectedRevision',1)::text,'UTF8')),'hex'))
      OR to_regclass('storage.objects') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document upload receipt and job missing'; END IF;
    EXECUTE $object$SELECT EXISTS(SELECT 1 FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id
      JOIN public.identities i ON i.id=$2 WHERE o.bucket_id='mmhr-document-quarantine' AND o.name=$1 AND o.owner_id=i.auth_user_id::text
        AND b.public=false AND b.file_size_limit=25000000 AND o.metadata->>'size'=$3 AND o.metadata->>'mimetype'=$4)$object$
      INTO v_object_ok USING v_upload.organization_id::text||'/'||v_upload.document_id::text||'/'||v_version::text,
        v_upload.uploaded_by_identity_id,v_original.byte_size::text,v_original.content_type;
    IF v_object_ok IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document actual object missing'; END IF;
  END IF;
  IF v_upload.state IN ('needs_review','approved') OR EXISTS(SELECT 1 FROM public.workflow_document_upload_events e
    WHERE e.version_id=v_version AND e.revision=v_upload.revision AND e.action='reject') THEN
    IF NOT EXISTS(SELECT 1 FROM public.workflow_document_upload_events e JOIN public.security_command_receipts r
      ON r.entity_id=e.version_id AND r.actor_identity_id=e.actor_identity_id
        AND r.command='r7.finance.document.review.'||CASE e.action WHEN 'review_started' THEN 'begin_review' ELSE e.action END
        AND r.action='document.'||CASE e.action WHEN 'review_started' THEN 'begin_review' ELSE e.action END
      JOIN public.audit_events a ON a.id=r.audit_event_id AND a.organization_id=e.organization_id AND a.correlation_id=e.correlation_id
        AND a.actor_identity_id=e.actor_identity_id AND a.command=r.command AND a.action=r.action
        AND a.entity_type='workflow_document_version' AND a.entity_id=r.entity_id::text AND a.idempotency_key=r.idempotency_key::text
      WHERE e.version_id=v_version AND e.revision=v_upload.revision AND e.action IN ('review_started','approve','reject')
        AND r.request_digest=encode(sha256(convert_to((jsonb_build_object('organizationId',v_upload.organization_id,
          'documentId',v_upload.document_id,'versionId',v_version,'expectedRevision',e.revision-1,
          'action',CASE e.action WHEN 'review_started' THEN 'begin_review' ELSE e.action END,
          'reason',e.snapshot->>'reason','reviewReference',e.snapshot->>'reviewReference')
          || CASE WHEN e.action='review_started' THEN '{}'::jsonb ELSE jsonb_build_object(
            'reviewedAccessId',e.snapshot->>'reviewedAccessId','contentsReviewed',true) END)::text,'UTF8')),'hex')) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document review receipt missing'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r7_finance_document_commit_guard() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER finance_document_commit_guard AFTER INSERT OR UPDATE ON public.workflow_document_uploads
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_finance_document_commit_guard();
--> statement-breakpoint
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r7_finance_document_event_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_upload public.workflow_document_uploads%ROWTYPE;
BEGIN
  SELECT * INTO v_upload FROM public.workflow_document_uploads u WHERE u.version_id=NEW.version_id AND u.source_kind='finance';
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.organization_id IS DISTINCT FROM v_upload.organization_id OR NEW.revision<>v_upload.revision
    OR NEW.snapshot->>'state' IS DISTINCT FROM v_upload.state OR v_upload.state IS DISTINCT FROM (CASE NEW.action
      WHEN 'reserve' THEN 'received' WHEN 'uploaded' THEN 'quarantined' WHEN 'scan_claimed' THEN 'scanning'
      WHEN 'scan_clean' THEN 'ready' WHEN 'scan_rejected' THEN 'rejected' WHEN 'scan_failed' THEN 'failed'
      WHEN 'retry' THEN 'quarantined' WHEN 'review_started' THEN 'needs_review' WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE NULL END)
    OR (NEW.action='reserve' AND NEW.revision<>1) OR (NEW.action='uploaded' AND NEW.revision<>2) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document current history denied'; END IF;
  IF NEW.action IN ('scan_claimed','scan_clean','scan_rejected','scan_failed','retry') THEN
    IF NEW.actor_identity_id IS NOT NULL OR NOT mmhr_private.r4_document_worker_login_is_safe(session_user) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document worker history denied'; END IF;
  ELSE
    IF NEW.action NOT IN ('reserve','uploaded','review_started','approve','reject') OR NEW.actor_identity_id IS NULL
      OR NEW.actor_identity_id IS DISTINCT FROM mmhr_private.r7_finance_document_actor(NEW.organization_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document user history denied'; END IF;
    IF (NEW.action IN ('reserve','uploaded') AND NEW.actor_identity_id<>v_upload.uploaded_by_identity_id)
      OR (NEW.action IN ('review_started','approve','reject') AND NEW.actor_identity_id=v_upload.uploaded_by_identity_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document independent event actor denied'; END IF;
    IF NEW.action IN ('review_started','approve','reject') AND (NOT mmhr_private.r1_security_reason_is_safe(NEW.snapshot->>'reason')
      OR octet_length(coalesce(NEW.snapshot->>'reviewReference','')) NOT BETWEEN 1 AND 500
      OR coalesce(NEW.snapshot->>'reviewReference','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
      OR NEW.snapshot->>'sha256' IS DISTINCT FROM (SELECT lower(v.sha256) FROM public.workflow_document_versions v WHERE v.id=NEW.version_id)
      OR (NEW.action<>'review_started' AND (NEW.snapshot->'contentsReviewed' IS DISTINCT FROM 'true'::jsonb
        OR coalesce(NEW.snapshot->>'reviewedAccessId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'))) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance document explicit review evidence denied'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r7_finance_document_event_guard() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE TRIGGER finance_document_event_guard BEFORE INSERT ON public.workflow_document_upload_events
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r7_finance_document_event_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mmhr_private.r4_quarantine_insert_allowed(object_name text,object_owner text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE parts text[]; actor uuid;
BEGIN
  IF object_name IS NULL OR object_name !~ '^([0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/){2}[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR object_owner IS DISTINCT FROM auth.uid()::text THEN RETURN false; END IF;
  parts:=string_to_array(object_name,'/'); actor:=CASE WHEN EXISTS(SELECT 1 FROM public.workflow_document_uploads u WHERE u.version_id=parts[3]::uuid AND u.source_kind='finance')
    THEN mmhr_private.r7_finance_document_actor(parts[1]::uuid) ELSE mmhr_private.r4_document_writer(parts[1]::uuid) END;
  IF actor IS NULL THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM public.workflow_document_uploads u
    JOIN public.workflow_document_versions v ON v.id=u.version_id AND v.organization_id=u.organization_id
    JOIN public.workflow_documents d ON d.id=u.document_id AND d.organization_id=u.organization_id
    WHERE u.organization_id=parts[1]::uuid AND u.document_id=parts[2]::uuid AND u.version_id=parts[3]::uuid
      AND u.upload_organization_id=u.organization_id AND u.uploaded_by_identity_id=actor AND (u.source_kind='workspace' OR (u.source_kind='finance' AND EXISTS(SELECT 1 FROM public.finance_document_sources f WHERE f.version_id=u.version_id AND mmhr_private.r7_finance_document_source_valid(f.organization_id,f.source_snapshot))))
      AND u.state='received' AND u.revision=1 AND u.created_at>clock_timestamp()-interval '10 minutes'
      AND v.storage_reference='quarantine://'||object_name AND v.scan_state='pending' AND v.state='ready'
      AND d.state='active' AND d.current_version=v.version);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r4_quarantine_insert_allowed(text,text) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT USAGE ON SCHEMA mmhr_private TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mmhr_private.r4_quarantine_insert_allowed(text,text) TO authenticated;
--> statement-breakpoint
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r7_quarantine_workspace_read_allowed(object_name text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_allowed boolean; parts text[]; actor uuid; access_row mmhr_private.document_access_grants%ROWTYPE;
BEGIN
  IF object_name IS NULL OR object_name !~ '^([0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/){2}[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR to_regprocedure('storage.allow_only_operation(text)') IS NULL THEN RETURN false; END IF;
  EXECUTE 'SELECT storage.allow_only_operation(''object.get_authenticated'')' INTO operation_allowed;
  IF operation_allowed IS DISTINCT FROM true THEN RETURN false; END IF;
  parts:=string_to_array(object_name,'/'); actor:=mmhr_private.r4_workspace_document_reader(parts[1]::uuid);
  IF actor IS NULL THEN RETURN false; END IF;
  FOR access_row IN SELECT * FROM mmhr_private.document_access_grants a WHERE a.organization_id=parts[1]::uuid
    AND a.document_id=parts[2]::uuid AND a.version_id=parts[3]::uuid AND a.actor_identity_id=actor
    AND a.session_id=(auth.jwt()->>'session_id')::uuid AND a.expires_at>clock_timestamp() LOOP
    IF mmhr_private.r4_document_content_actor(access_row.organization_id,access_row.document_id,access_row.version_id,access_row.revision,access_row.purpose)=actor THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r7_quarantine_workspace_read_allowed(text) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mmhr_private.r4_quarantine_content_read_allowed(object_name text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_parts text[]; v_actor uuid; v_operation boolean; v_grant mmhr_private.finance_document_access_grants%ROWTYPE;
BEGIN
  IF mmhr_private.r7_quarantine_workspace_read_allowed(object_name) THEN RETURN true; END IF;
  IF object_name IS NULL OR object_name !~ '^([0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/){2}[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR to_regprocedure('storage.allow_only_operation(text)') IS NULL THEN RETURN false; END IF;
  EXECUTE 'SELECT storage.allow_only_operation(''object.get_authenticated'')' INTO v_operation;
  IF v_operation IS DISTINCT FROM true THEN RETURN false; END IF;
  v_parts:=string_to_array(object_name,'/'); v_actor:=mmhr_private.r7_finance_document_actor(v_parts[1]::uuid);
  IF v_actor IS NULL THEN RETURN false; END IF;
  FOR v_grant IN SELECT a.* FROM mmhr_private.finance_document_access_grants a WHERE a.organization_id=v_parts[1]::uuid
    AND a.document_id=v_parts[2]::uuid AND a.version_id=v_parts[3]::uuid AND a.actor_identity_id=v_actor
    AND a.session_id=(auth.jwt()->>'session_id')::uuid AND a.expires_at>clock_timestamp() LOOP
    IF mmhr_private.r7_finance_document_content_actor(v_grant.organization_id,v_grant.document_id,v_grant.version_id,v_grant.revision,v_grant.purpose)=v_actor THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r4_quarantine_content_read_allowed(text) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mmhr_private.r4_quarantine_content_read_allowed(text) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_search_workflow_documents(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; v_org uuid; v_actor uuid; v_query text; v_type text; v_limit integer; v_results jsonb;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR length(btrim(coalesce(payload->>'query',''))) < 1 OR length(btrim(coalesce(payload->>'query',''))) > 200 OR (payload->>'documentType' IS NOT NULL AND payload->>'documentType' NOT IN ('rfp','response','proposal','contract','attachment','other')) OR coalesce((payload->>'limit')::integer, 0) NOT BETWEEN 1 AND 100 OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid document search'; END IF;
  v_org := (payload->>'organizationId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_query := btrim(payload->>'query'); v_type := NULLIF(payload->>'documentType',''); v_limit := (payload->>'limit')::integer;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Search workflow documents', correlation_id, idempotency_key);
  IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.doc.search', idempotency_key, payload);
  IF receipt IS NOT NULL THEN RETURN jsonb_build_object('organizationId', v_org, 'query', v_query, 'results', '[]'::jsonb, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('documentId', v.document_id, 'versionId', v.version_id, 'documentType', v.document_type, 'version', v.version, 'metadata', v.metadata, 'snippet', left(v.approved_extracted_content, 500)) ORDER BY v.created_at DESC), '[]'::jsonb) INTO v_results
  FROM (SELECT d.id AS document_id, d.document_type, v.id AS version_id, v.version, v.metadata, v.approved_extracted_content, v.created_at FROM public.workflow_documents d JOIN public.workflow_document_versions v ON v.organization_id = d.organization_id AND v.document_id = d.id WHERE d.organization_id = v_org AND d.state = 'active' AND v.state = 'approved' AND v.scan_state = 'clean' AND NOT EXISTS(SELECT 1 FROM public.workflow_document_uploads u WHERE u.version_id=v.id AND u.source_kind='finance') AND (v_type IS NULL OR d.document_type = v_type) AND lower(coalesce(v.metadata::text,'') || ' ' || coalesce(v.approved_extracted_content,'')) LIKE '%' || lower(v_query) || '%' ORDER BY v.created_at DESC LIMIT v_limit) v;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.doc.search', 'document.search', 'workflow_document_search', correlation_id, v_org, 'Search workflow documents', correlation_id, idempotency_key, payload, NULL, jsonb_build_object('state','completed'), context.authorization_time);
  RETURN jsonb_build_object('organizationId', v_org, 'query', v_query, 'results', v_results, 'outcomeCode', 'recorded', 'correlationId', correlation_id);
END; $$;
--> statement-breakpoint
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_search_workflow_documents(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_search_workflow_documents(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
-- Finance source choices resolve stored associations under the same live scope.
-- They do not accept a caller's signing timestamp or a free-text source search.
CREATE FUNCTION public.mmhr_get_finance_document_sources(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE requested_org uuid; requested_doc uuid; after_id uuid; actor uuid; workspace_type text;
  items jsonb; next_id uuid; binding jsonb; source_row public.finance_document_sources%ROWTYPE;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL
    OR NOT payload ? 'organizationId'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE field NOT IN ('organizationId','afterId','documentId'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR (payload ? 'afterId' AND coalesce(payload->>'afterId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
    OR (payload ? 'documentId' AND coalesce(payload->>'documentId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid finance source read';
  END IF;
  requested_org:=(payload->>'organizationId')::uuid; requested_doc:=(payload->>'documentId')::uuid;
  after_id:=(payload->>'afterId')::uuid;
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r7_finance_document_actor(requested_org);
  SELECT o.type INTO workspace_type FROM public.orgs o WHERE o.id=requested_org;
  IF actor IS NULL OR workspace_type IS NULL OR workspace_type NOT IN ('internal','customer') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance source read denied';
  END IF;
  IF workspace_type='internal' THEN
    WITH candidates AS (
      SELECT o.id,jsonb_build_object('choiceId',o.id,
        'vendorLabel',left(coalesce(nullif(btrim(regexp_replace(o.name,'[[:cntrl:]]','','g')),''),'Vendor name unavailable'),500),
        'dealLabel',NULL,'source',jsonb_build_object('sourceClass','agreement','vendorOrganizationId',o.id)) AS item
      FROM public.orgs o WHERE o.type='vendor' AND (after_id IS NULL OR o.id>after_id)
        AND mmhr_private.r7_finance_document_source_valid(requested_org,jsonb_build_object('sourceClass','agreement','vendorOrganizationId',o.id))
      ORDER BY o.id LIMIT 26
    ), numbered AS (SELECT *,row_number() OVER(ORDER BY id) AS ordinal FROM candidates)
    SELECT coalesce(jsonb_agg(item ORDER BY id) FILTER(WHERE ordinal<=25),'[]'::jsonb),
      CASE WHEN count(*)=26 THEN (array_agg(id ORDER BY id))[25] ELSE NULL END INTO items,next_id FROM numbered;
  ELSE
    WITH candidates AS (
      SELECT p.handoff_id AS id,jsonb_build_object('choiceId',p.handoff_id,
        'vendorLabel',left(coalesce(nullif(btrim(regexp_replace(vendor.name,'[[:cntrl:]]','','g')),''),'Vendor name unavailable'),500),
        'dealLabel',left(regexp_replace(concat_ws(' · ',customer.name,vendor.name,product.name,replace(d.stage,'_',' ')),'[[:cntrl:]]','','g'),500),
        'source',jsonb_build_object('sourceClass','signed_contract','vendorOrganizationId',h.vendor_organization_id,
          'contractId',p.contract_id,'handoffId',p.handoff_id,'dealId',h.deal_id)) AS item
      FROM public.portal_contract_handoff_details p JOIN public.contract_handoffs h ON h.id=p.handoff_id AND h.organization_id=p.organization_id
        JOIN public.deals d ON d.id=h.deal_id AND d.organization_id=h.organization_id
        JOIN public.orgs customer ON customer.id=p.organization_id
        JOIN public.orgs vendor ON vendor.id=h.vendor_organization_id
        LEFT JOIN public.products product ON product.id=d.product_id AND product.organization_id=d.vendor_organization_id
      WHERE p.organization_id=requested_org AND (after_id IS NULL OR p.handoff_id>after_id)
        AND mmhr_private.r7_finance_document_source_valid(requested_org,jsonb_build_object('sourceClass','signed_contract',
          'vendorOrganizationId',h.vendor_organization_id,'contractId',p.contract_id,'handoffId',p.handoff_id,'dealId',h.deal_id))
      ORDER BY p.handoff_id LIMIT 26
    ), numbered AS (SELECT *,row_number() OVER(ORDER BY id) AS ordinal FROM candidates)
    SELECT coalesce(jsonb_agg(item ORDER BY id) FILTER(WHERE ordinal<=25),'[]'::jsonb),
      CASE WHEN count(*)=26 THEN (array_agg(id ORDER BY id))[25] ELSE NULL END INTO items,next_id FROM numbered;
  END IF;
  IF requested_doc IS NOT NULL THEN
    SELECT f.* INTO source_row FROM public.workflow_documents doc
      JOIN public.workflow_document_versions ver ON ver.document_id=doc.id AND ver.organization_id=doc.organization_id AND ver.version=doc.current_version
      JOIN public.workflow_document_uploads u ON u.version_id=ver.id AND u.organization_id=doc.organization_id AND u.document_id=doc.id
      JOIN public.finance_document_sources f ON f.version_id=u.version_id AND f.organization_id=u.organization_id AND f.document_id=u.document_id
      WHERE doc.id=requested_doc AND doc.organization_id=requested_org AND doc.state='active' AND doc.document_type='attachment'
        AND u.source_kind='finance' AND u.upload_organization_id=requested_org
        AND mmhr_private.r7_finance_document_source_integrity(requested_org,f.source_snapshot);
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance source read denied'; END IF;
    SELECT jsonb_build_object('documentId',source_row.document_id,'source',source_row.source_snapshot,
      'vendorLabel',left(coalesce(nullif(btrim(regexp_replace(vendor.name,'[[:cntrl:]]','','g')),''),'Vendor name unavailable'),500),
      'dealLabel',CASE WHEN source_row.source_class='agreement' THEN NULL ELSE
        left(regexp_replace(concat_ws(' · ',customer.name,vendor.name,product.name,replace(d.stage,'_',' ')),'[[:cntrl:]]','','g'),500) END)
      INTO binding FROM public.orgs vendor JOIN public.orgs customer ON customer.id=requested_org
        LEFT JOIN public.deals d ON d.id=source_row.deal_id AND d.organization_id=requested_org
        LEFT JOIN public.products product ON product.id=d.product_id AND product.organization_id=d.vendor_organization_id
      WHERE vendor.id=source_row.vendor_organization_id;
    IF binding IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance source read denied'; END IF;
  END IF;
  RETURN jsonb_build_object('organizationId',requested_org,'correlationId',correlation_id,'workspaceType',workspace_type,
    'choices',items,'nextCursor',next_id,'documentBinding',binding);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_finance_document_sources(jsonb,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_get_finance_document_sources(jsonb,uuid) TO authenticated;
--> statement-breakpoint
-- Additive function correction. Preserve all existing demo rows and receipts.
-- Only new complete/no_show evidence associations reject finance originals.
DO $$
DECLARE definition text; corrected_definition text; current_definition text;
  function_oid oid; before_properties jsonb; after_properties jsonb;
  original constant text := $old$WHERE v.id=evidence::uuid AND v.organization_id=demo.organization_id AND v.scan_state='clean' AND v.state='approved' AND d.state='active')) THEN$old$;
  corrected constant text := $new$WHERE v.id=evidence::uuid AND v.organization_id=demo.organization_id AND v.scan_state='clean' AND v.state='approved' AND d.state='active'
                AND NOT EXISTS(SELECT 1 FROM public.workflow_document_uploads finance_upload
                  WHERE finance_upload.version_id=v.id AND finance_upload.source_kind='finance'))) THEN$new$;
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid),jsonb_build_object(
    'owner',p.proowner,'acl',p.proacl,'securityDefiner',p.prosecdef,'volatility',p.provolatile,
    'parallel',p.proparallel,'returnType',p.prorettype,'config',p.proconfig)
    INTO function_oid,definition,before_properties
    FROM pg_proc p WHERE p.oid='public.mmhr_record_demo_coordination(jsonb,uuid,uuid)'::regprocedure;
  IF definition IS NULL OR (length(definition)-length(replace(definition,original,'')))/length(original)<>1 THEN
    RAISE EXCEPTION 'Finance demo evidence baseline requires review'; END IF;
  corrected_definition:=replace(definition,original,corrected);
  EXECUTE corrected_definition;
  SELECT pg_get_functiondef(p.oid),jsonb_build_object(
    'owner',p.proowner,'acl',p.proacl,'securityDefiner',p.prosecdef,'volatility',p.provolatile,
    'parallel',p.proparallel,'returnType',p.prorettype,'config',p.proconfig)
    INTO current_definition,after_properties FROM pg_proc p WHERE p.oid=function_oid;
  IF current_definition IS DISTINCT FROM corrected_definition OR before_properties IS DISTINCT FROM after_properties
    OR (length(current_definition)-length(replace(current_definition,corrected,'')))/length(corrected)<>1 THEN
    RAISE EXCEPTION 'Finance demo evidence function identity requires review'; END IF;
END $$;
