CREATE TABLE "workflow_document_upload_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor_identity_id" uuid,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_document_upload_events_revision_ck" CHECK ("workflow_document_upload_events"."revision" > 0),
	CONSTRAINT "workflow_document_upload_events_action_ck" CHECK ("workflow_document_upload_events"."action" in ('reserve', 'uploaded', 'scan_claimed', 'scan_clean', 'scan_rejected', 'scan_failed', 'approve', 'reject', 'retry', 'supersede')),
	CONSTRAINT "workflow_document_upload_events_snapshot_ck" CHECK (jsonb_typeof("workflow_document_upload_events"."snapshot") = 'object' and octet_length("workflow_document_upload_events"."snapshot"::text) <= 100000)
);
--> statement-breakpoint
CREATE TABLE "workflow_document_uploads" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"upload_organization_id" uuid NOT NULL,
	"uploaded_by_identity_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"rfp_recipient_id" uuid,
	"demo_id" uuid,
	"file_name" text NOT NULL,
	"state" text DEFAULT 'received' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"processing_job_id" uuid,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"scan_evidence" jsonb,
	"failure_code" text,
	"review_reason" text,
	"approved_by_identity_id" uuid,
	"approved_at" timestamp with time zone,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_document_uploads_source_ck" CHECK (("workflow_document_uploads"."source_kind" = 'workspace' and "workflow_document_uploads"."rfp_recipient_id" is null and "workflow_document_uploads"."demo_id" is null)
    or ("workflow_document_uploads"."source_kind" = 'rfp_response' and "workflow_document_uploads"."rfp_recipient_id" is not null and "workflow_document_uploads"."demo_id" is null)
    or ("workflow_document_uploads"."source_kind" = 'demo_evidence' and "workflow_document_uploads"."demo_id" is not null and "workflow_document_uploads"."rfp_recipient_id" is null)),
	CONSTRAINT "workflow_document_uploads_state_ck" CHECK ("workflow_document_uploads"."state" in ('received', 'quarantined', 'scanning', 'ready', 'processing', 'needs_review', 'approved', 'rejected', 'failed', 'superseded')),
	CONSTRAINT "workflow_document_uploads_name_ck" CHECK (octet_length(btrim("workflow_document_uploads"."file_name")) between 1 and 255 and octet_length("workflow_document_uploads"."file_name") <= 255 and "workflow_document_uploads"."file_name" !~ '[[:cntrl:]/\]'),
	CONSTRAINT "workflow_document_uploads_revision_ck" CHECK ("workflow_document_uploads"."revision" > 0),
	CONSTRAINT "workflow_document_uploads_lease_ck" CHECK (("workflow_document_uploads"."state" in ('scanning', 'processing') and "workflow_document_uploads"."lease_token" is not null and "workflow_document_uploads"."lease_expires_at" is not null)
    or ("workflow_document_uploads"."state" not in ('scanning', 'processing') and "workflow_document_uploads"."lease_token" is null and "workflow_document_uploads"."lease_expires_at" is null)),
	CONSTRAINT "workflow_document_uploads_scan_ck" CHECK ("workflow_document_uploads"."scan_evidence" is null or jsonb_typeof("workflow_document_uploads"."scan_evidence") = 'object'),
	CONSTRAINT "workflow_document_uploads_safe_state_ck" CHECK ("workflow_document_uploads"."state" not in ('ready', 'processing', 'needs_review', 'approved')
    or ("workflow_document_uploads"."scan_evidence" is not null and coalesce("workflow_document_uploads"."scan_evidence"->>'state', '') = 'clean')),
	CONSTRAINT "workflow_document_uploads_failure_ck" CHECK ("workflow_document_uploads"."failure_code" is null or "workflow_document_uploads"."failure_code" ~ '^[a-z][a-z0-9_]{0,63}$'),
	CONSTRAINT "workflow_document_uploads_review_ck" CHECK ("workflow_document_uploads"."review_reason" is null or octet_length(btrim("workflow_document_uploads"."review_reason")) between 1 and 2000),
	CONSTRAINT "workflow_document_uploads_approval_ck" CHECK (("workflow_document_uploads"."state" = 'approved' and "workflow_document_uploads"."approved_by_identity_id" is not null
    and "workflow_document_uploads"."approved_at" is not null and "workflow_document_uploads"."review_reason" is not null and "workflow_document_uploads"."approved_by_identity_id" <> "workflow_document_uploads"."uploaded_by_identity_id")
    or ("workflow_document_uploads"."state" <> 'approved')),
	CONSTRAINT "workflow_document_uploads_updated_ck" CHECK ("workflow_document_uploads"."updated_at" >= "workflow_document_uploads"."created_at")
);
--> statement-breakpoint
ALTER TABLE "workflow_document_versions" DROP CONSTRAINT "workflow_document_versions_content_type_ck";--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_document_uploads_organization_version_uq" ON "workflow_document_uploads" USING btree ("organization_id","version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_document_versions_organization_id_id_uq" ON "workflow_document_versions" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "workflow_document_upload_events" ADD CONSTRAINT "workflow_document_upload_events_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_document_upload_events" ADD CONSTRAINT "workflow_document_upload_events_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_document_upload_events" ADD CONSTRAINT "workflow_document_upload_events_upload_scope_fk" FOREIGN KEY ("organization_id","version_id") REFERENCES "public"."workflow_document_uploads"("organization_id","version_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_document_uploads" ADD CONSTRAINT "workflow_document_uploads_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_document_uploads" ADD CONSTRAINT "workflow_document_uploads_upload_organization_id_orgs_id_fk" FOREIGN KEY ("upload_organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_document_uploads" ADD CONSTRAINT "workflow_document_uploads_uploaded_by_identity_id_identities_id_fk" FOREIGN KEY ("uploaded_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_document_uploads" ADD CONSTRAINT "workflow_document_uploads_approved_by_identity_id_identities_id_fk" FOREIGN KEY ("approved_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_document_uploads" ADD CONSTRAINT "workflow_document_uploads_document_scope_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."workflow_documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_document_uploads" ADD CONSTRAINT "workflow_document_uploads_version_scope_fk" FOREIGN KEY ("organization_id","version_id") REFERENCES "public"."workflow_document_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_document_uploads" ADD CONSTRAINT "workflow_document_uploads_recipient_scope_fk" FOREIGN KEY ("organization_id","rfp_recipient_id") REFERENCES "public"."rfp_recipients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_document_uploads" ADD CONSTRAINT "workflow_document_uploads_demo_scope_fk" FOREIGN KEY ("organization_id","demo_id") REFERENCES "public"."demo_rounds"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_document_uploads" ADD CONSTRAINT "workflow_document_uploads_job_scope_fk" FOREIGN KEY ("organization_id","processing_job_id") REFERENCES "public"."workflow_jobs"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_document_upload_events_version_revision_uq" ON "workflow_document_upload_events" USING btree ("version_id","revision");--> statement-breakpoint
CREATE INDEX "workflow_document_uploads_state_created_idx" ON "workflow_document_uploads" USING btree ("state","created_at","version_id");--> statement-breakpoint
CREATE INDEX "workflow_document_uploads_organization_document_idx" ON "workflow_document_uploads" USING btree ("organization_id","document_id","version_id");--> statement-breakpoint
ALTER TABLE "workflow_document_versions" ADD CONSTRAINT "workflow_document_versions_content_type_ck" CHECK ("workflow_document_versions"."content_type" in ('application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/plain'));
--> statement-breakpoint
-- Generated scope indexes precede their referencing foreign keys above.
-- No upload or processor is enabled by the schema expansion alone.
ALTER TABLE public.workflow_document_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_document_uploads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_document_upload_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_document_upload_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.workflow_document_uploads, public.workflow_document_upload_events FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY workflow_document_uploads_deny_raw ON public.workflow_document_uploads FOR ALL TO anon, authenticated, service_role, mmhr_worker USING (false) WITH CHECK (false);
CREATE POLICY workflow_document_upload_events_deny_raw ON public.workflow_document_upload_events FOR ALL TO anon, authenticated, service_role, mmhr_worker USING (false) WITH CHECK (false);
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_document_upload_history_is_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Document upload history is immutable';
END;
$$;
REVOKE ALL ON FUNCTION mmhr_private.r4_document_upload_history_is_immutable() FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE TRIGGER workflow_document_upload_events_immutable BEFORE UPDATE OR DELETE ON public.workflow_document_upload_events FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_document_upload_history_is_immutable();
CREATE TRIGGER workflow_document_upload_events_no_truncate BEFORE TRUNCATE ON public.workflow_document_upload_events FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r4_document_upload_history_is_immutable();
CREATE TRIGGER workflow_document_uploads_no_truncate BEFORE TRUNCATE ON public.workflow_document_uploads FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r4_document_upload_history_is_immutable();
--> statement-breakpoint
-- The legacy interface keeps its behavior only for unmanaged documents.
-- It cannot mark an actual managed object clean, approve it, replace it, or archive it.
ALTER FUNCTION public.mmhr_record_workflow_document(jsonb, uuid, uuid) SET SCHEMA mmhr_private;
ALTER FUNCTION mmhr_private.mmhr_record_workflow_document(jsonb, uuid, uuid) RENAME TO r4_record_legacy_workflow_document;
REVOKE ALL ON FUNCTION mmhr_private.r4_record_legacy_workflow_document(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE FUNCTION public.mmhr_record_workflow_document(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE requested_org uuid;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR coalesce(payload->>'documentId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid document input';
  END IF;
  requested_org:=(payload->>'organizationId')::uuid;
  -- Serialize this lookup with upload registration and legacy mutations.
  PERFORM mmhr_private.r1_lock_security();
  IF NOT EXISTS(SELECT 1 FROM public.mmhr_authorize('workspace.access', requested_org)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Document command denied';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workflow_document_uploads u WHERE u.organization_id=requested_org AND u.document_id=(payload->>'documentId')::uuid) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Managed document command required';
  END IF;
  RETURN mmhr_private.r4_record_legacy_workflow_document(payload, correlation_id, idempotency_key);
END;
$$;
REVOKE ALL ON FUNCTION public.mmhr_record_workflow_document(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_workflow_document(jsonb, uuid, uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_document_upload_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE version_row public.workflow_document_versions%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Document upload records must be retained';
  END IF;
  SELECT v.* INTO version_row FROM public.workflow_document_versions v
    JOIN public.workflow_documents d ON d.organization_id=v.organization_id AND d.id=v.document_id
    WHERE v.id=NEW.version_id AND v.organization_id=NEW.organization_id AND v.document_id=NEW.document_id
      AND d.state='active' AND v.version<=d.current_version;
  IF NOT FOUND OR version_row.byte_size NOT BETWEEN 1 AND 25000000
    OR version_row.content_type NOT IN ('application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    OR version_row.storage_reference IS DISTINCT FROM ('quarantine://' || NEW.organization_id::text || '/' || NEW.document_id::text || '/' || NEW.version_id::text)
    OR version_row.created_by_identity_id IS DISTINCT FROM NEW.uploaded_by_identity_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Document upload association denied';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'received' OR NEW.revision<>1 OR NEW.processing_job_id IS NOT NULL
      OR NEW.scan_evidence IS NOT NULL OR NEW.approved_by_identity_id IS NOT NULL OR NEW.approved_at IS NOT NULL
      OR version_row.state<>'ready' OR version_row.scan_state<>'pending' THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Document upload initial state denied';
    END IF;
  ELSE
    IF ROW(NEW.organization_id,NEW.document_id,NEW.version_id,NEW.upload_organization_id,NEW.uploaded_by_identity_id,
      NEW.source_kind,NEW.rfp_recipient_id,NEW.demo_id,NEW.file_name,NEW.correlation_id,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.organization_id,OLD.document_id,OLD.version_id,OLD.upload_organization_id,OLD.uploaded_by_identity_id,
      OLD.source_kind,OLD.rfp_recipient_id,OLD.demo_id,OLD.file_name,OLD.correlation_id,OLD.created_at)
      OR NEW.revision<>OLD.revision+1 THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Document upload association is immutable';
    END IF;
    IF NOT (CASE OLD.state
      WHEN 'received' THEN NEW.state IN ('quarantined','failed')
      WHEN 'quarantined' THEN NEW.state IN ('scanning','rejected','failed')
      WHEN 'scanning' THEN NEW.state IN ('ready','rejected','failed')
      WHEN 'ready' THEN NEW.state IN ('processing','needs_review','superseded')
      WHEN 'processing' THEN NEW.state IN ('needs_review','rejected','failed')
      WHEN 'needs_review' THEN NEW.state IN ('approved','rejected','failed')
      WHEN 'approved' THEN NEW.state='superseded'
      WHEN 'failed' THEN NEW.state='quarantined'
      ELSE false END) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Document upload transition denied';
    END IF;
    IF OLD.state IN ('ready','processing','needs_review','approved','superseded')
      AND NEW.scan_evidence IS DISTINCT FROM OLD.scan_evidence THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Verified document scan is immutable';
    END IF;
  END IF;
  IF NEW.state IN ('ready','processing','needs_review','approved') AND
    (version_row.scan_state<>'clean' OR NEW.scan_evidence->>'sha256' IS DISTINCT FROM lower(version_row.sha256)
      OR NEW.scan_evidence->>'versionId' IS DISTINCT FROM NEW.version_id::text) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Verified document scan required';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION mmhr_private.r4_document_upload_guard() FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE TRIGGER workflow_document_uploads_guard BEFORE INSERT OR UPDATE OR DELETE ON public.workflow_document_uploads FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_document_upload_guard();
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_managed_document_version_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.workflow_document_uploads u WHERE u.version_id=OLD.id) THEN
    IF TG_OP='DELETE' THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Managed document originals must be retained';
    END IF;
    IF ROW(NEW.id,NEW.organization_id,NEW.document_id,NEW.version,NEW.sha256,NEW.storage_reference,
      NEW.content_type,NEW.byte_size,NEW.created_by_identity_id,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.document_id,OLD.version,OLD.sha256,OLD.storage_reference,
      OLD.content_type,OLD.byte_size,OLD.created_by_identity_id,OLD.created_at) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Managed document originals are immutable';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION mmhr_private.r4_managed_document_version_guard() FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE TRIGGER workflow_document_versions_managed_guard BEFORE UPDATE OR DELETE ON public.workflow_document_versions FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_managed_document_version_guard();
