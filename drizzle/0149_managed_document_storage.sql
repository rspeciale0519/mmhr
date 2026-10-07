-- Storage initializes its own schema. The owner installs these policies after
-- creating the private bucket through the Storage API. No provider is enabled here.
CREATE FUNCTION mmhr_private.r4_document_writer(requested_org uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE claims jsonb:=auth.jwt(); checked_at timestamptz:=clock_timestamp(); actor uuid; request_session uuid;
BEGIN
  IF requested_org IS NULL OR claims->>'role' IS DISTINCT FROM 'authenticated'
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
    OR NOT mmhr_private.r1_evaluate_permission(actor,'workspace.access',requested_org,claims->>'aal',checked_at,false)
    OR NOT (EXISTS(SELECT 1 FROM public.org_members m WHERE m.org_id=requested_org AND m.identity_id=actor
      AND m.status='active' AND NOT m.migration_review_required AND m.role_key IN ('organization_admin','contributor'))
      OR (mmhr_private.r1_evaluate_permission(actor,'admin.access',NULL,claims->>'aal',checked_at,false)
        AND mmhr_private.r1_evaluate_permission(actor,'rfp.approve',requested_org,claims->>'aal',checked_at,false)))
    OR NOT EXISTS(SELECT 1 FROM public.orgs WHERE id=requested_org AND status='active' AND NOT migration_review_required)
    OR EXISTS(SELECT 1 FROM public.identities WHERE status='recovery_pending') THEN RETURN NULL; END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_document_writer(uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_quarantine_insert_allowed(object_name text,object_owner text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE parts text[]; actor uuid;
BEGIN
  IF object_name IS NULL OR object_name !~ '^([0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/){2}[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR object_owner IS DISTINCT FROM auth.uid()::text THEN RETURN false; END IF;
  parts:=string_to_array(object_name,'/'); actor:=mmhr_private.r4_document_writer(parts[1]::uuid);
  IF actor IS NULL THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM public.workflow_document_uploads u
    JOIN public.workflow_document_versions v ON v.id=u.version_id AND v.organization_id=u.organization_id
    JOIN public.workflow_documents d ON d.id=u.document_id AND d.organization_id=u.organization_id
    WHERE u.organization_id=parts[1]::uuid AND u.document_id=parts[2]::uuid AND u.version_id=parts[3]::uuid
      AND u.upload_organization_id=u.organization_id AND u.uploaded_by_identity_id=actor AND u.source_kind='workspace'
      AND u.state='received' AND u.revision=1 AND u.created_at>clock_timestamp()-interval '10 minutes'
      AND v.storage_reference='quarantine://'||object_name AND v.scan_state='pending' AND v.state='ready'
      AND d.state='active' AND d.current_version=v.version);
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_quarantine_insert_allowed(text,text) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT USAGE ON SCHEMA mmhr_private TO authenticated;
GRANT EXECUTE ON FUNCTION mmhr_private.r4_quarantine_insert_allowed(text,text) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_install_document_storage_upload_policies()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document Storage schema is unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.buckets b WHERE b.id='mmhr-document-quarantine' AND b.public=false
    AND b.file_size_limit=25000000 AND b.allowed_mime_types @> ARRAY['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
    AND cardinality(b.allowed_mime_types)=4) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Verified private document bucket required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='storage.objects'::regclass
      AND polname IN ('mmhr_document_insert_allow','mmhr_document_insert_bound','mmhr_document_anon_insert_bound',
        'mmhr_document_read_bound','mmhr_document_update_bound','mmhr_document_delete_bound')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document Storage policies require review'; END IF;
  -- Restrictive policies also contain pre-existing permissive policies. Ordinary
  -- callers never read quarantine, replace originals, delete them, or sign access.
  EXECUTE $policy$CREATE POLICY mmhr_document_insert_allow ON storage.objects FOR INSERT TO authenticated
    WITH CHECK(bucket_id='mmhr-document-quarantine' AND mmhr_private.r4_quarantine_insert_allowed(name,owner_id))$policy$;
  EXECUTE $policy$CREATE POLICY mmhr_document_insert_bound ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK(bucket_id<>'mmhr-document-quarantine' OR mmhr_private.r4_quarantine_insert_allowed(name,owner_id))$policy$;
  EXECUTE $policy$CREATE POLICY mmhr_document_anon_insert_bound ON storage.objects AS RESTRICTIVE FOR INSERT TO anon
    WITH CHECK(bucket_id<>'mmhr-document-quarantine')$policy$;
  EXECUTE $policy$CREATE POLICY mmhr_document_read_bound ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated
    USING(bucket_id<>'mmhr-document-quarantine')$policy$;
  EXECUTE $policy$CREATE POLICY mmhr_document_update_bound ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
    USING(bucket_id<>'mmhr-document-quarantine') WITH CHECK(bucket_id<>'mmhr-document-quarantine')$policy$;
  EXECUTE $policy$CREATE POLICY mmhr_document_delete_bound ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
    USING(bucket_id<>'mmhr-document-quarantine')$policy$;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_install_document_storage_upload_policies() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_complete_workspace_document_upload(payload jsonb,correlation_id uuid,idempotency_key uuid)
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
  actor:=mmhr_private.r4_document_writer(requested_org);
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document upload completion denied'; END IF;
  SELECT * INTO upload FROM public.workflow_document_uploads u WHERE u.version_id=requested_version
    AND u.organization_id=requested_org AND u.document_id=requested_doc AND u.uploaded_by_identity_id=actor AND u.source_kind='workspace' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document upload completion denied'; END IF;
  receipt:=mmhr_private.r1_checked_receipt(actor,'r4.document.uploaded',idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    IF (receipt->>'entity_id')::uuid<>requested_version OR NOT EXISTS(SELECT 1 FROM public.workflow_document_upload_events e
      WHERE e.version_id=requested_version AND e.revision=2 AND e.action='uploaded') THEN
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
    PERFORM mmhr_private.r1_finish_security_command(actor,'r4.document.uploaded','document.uploaded','workflow_document_version',requested_version,requested_org,
      'Record private document upload',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),checked_at);
  END IF;
  RETURN jsonb_build_object('organizationId',requested_org,'documentId',requested_doc,'versionId',requested_version,
    'state','quarantined','revision',2,'correlationId',correlation_id,'outcomeCode',CASE WHEN receipt IS NULL THEN 'recorded' ELSE 'replayed' END);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_complete_workspace_document_upload(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_complete_workspace_document_upload(jsonb,uuid,uuid) TO authenticated;
