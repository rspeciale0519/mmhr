ALTER TABLE "workflow_document_uploads" DROP CONSTRAINT "workflow_document_uploads_name_ck";--> statement-breakpoint
ALTER TABLE "workflow_document_uploads" ADD CONSTRAINT "workflow_document_uploads_name_ck" CHECK (octet_length(btrim("workflow_document_uploads"."file_name")) between 1 and 255
    and octet_length("workflow_document_uploads"."file_name") <= 255 and "workflow_document_uploads"."file_name" !~ '[[:cntrl:]]'
    and position('/' in "workflow_document_uploads"."file_name") = 0 and position(chr(92) in "workflow_document_uploads"."file_name") = 0);
--> statement-breakpoint
-- Managed files require dedicated processing and review commands.
-- Preserve the old interfaces for unrelated metadata records.
ALTER FUNCTION public.mmhr_set_workflow_document_search_content(jsonb, uuid, uuid) SET SCHEMA mmhr_private;
ALTER FUNCTION mmhr_private.mmhr_set_workflow_document_search_content(jsonb, uuid, uuid) RENAME TO r4_set_legacy_document_search_content;
REVOKE ALL ON FUNCTION mmhr_private.r4_set_legacy_document_search_content(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE FUNCTION public.mmhr_set_workflow_document_search_content(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE requested_org uuid;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'versionId','') !~ '^[0-9a-fA-F-]{36}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid document search content';
  END IF;
  requested_org:=(payload->>'organizationId')::uuid;
  PERFORM mmhr_private.r1_lock_security();
  IF NOT EXISTS(SELECT 1 FROM public.mmhr_authorize('workspace.access', requested_org)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Document command denied';
  END IF;
  IF EXISTS(SELECT 1 FROM public.workflow_document_uploads u WHERE u.organization_id=requested_org AND u.version_id=(payload->>'versionId')::uuid) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Managed document review required';
  END IF;
  RETURN mmhr_private.r4_set_legacy_document_search_content(payload, correlation_id, idempotency_key);
END;
$$;
REVOKE ALL ON FUNCTION public.mmhr_set_workflow_document_search_content(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_set_workflow_document_search_content(jsonb, uuid, uuid) TO authenticated;
--> statement-breakpoint
ALTER FUNCTION public.mmhr_record_workflow_job(jsonb, uuid, uuid) SET SCHEMA mmhr_private;
ALTER FUNCTION mmhr_private.mmhr_record_workflow_job(jsonb, uuid, uuid) RENAME TO r4_record_legacy_workflow_job;
REVOKE ALL ON FUNCTION mmhr_private.r4_record_legacy_workflow_job(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE FUNCTION public.mmhr_record_workflow_job(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE requested_org uuid;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'jobId','') !~ '^[0-9a-fA-F-]{36}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid job input';
  END IF;
  requested_org:=(payload->>'organizationId')::uuid;
  PERFORM mmhr_private.r1_lock_security();
  IF NOT EXISTS(SELECT 1 FROM public.mmhr_authorize('workspace.access', requested_org)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Job command denied';
  END IF;
  IF EXISTS(SELECT 1 FROM public.workflow_document_uploads u WHERE u.organization_id=requested_org AND u.processing_job_id=(payload->>'jobId')::uuid) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Managed document worker required';
  END IF;
  RETURN mmhr_private.r4_record_legacy_workflow_job(payload, correlation_id, idempotency_key);
END;
$$;
REVOKE ALL ON FUNCTION public.mmhr_record_workflow_job(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_workflow_job(jsonb, uuid, uuid) TO authenticated;
