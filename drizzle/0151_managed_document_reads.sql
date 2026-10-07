-- Custom SQL migration file, put your code below! --
-- Expansion only. These reads expose managed workspace metadata, never file
-- locations, bytes, extraction, scan evidence, identities, jobs, or leases.
CREATE FUNCTION mmhr_private.r4_workspace_document_reader(requested_org uuid)
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
    OR NOT EXISTS(SELECT 1 FROM public.orgs WHERE id=requested_org AND status='active' AND NOT migration_review_required)
    OR EXISTS(SELECT 1 FROM public.identities WHERE status='recovery_pending') THEN RETURN NULL; END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_workspace_document_reader(uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_workspace_document_metadata(upload public.workflow_document_uploads,
  version_row public.workflow_document_versions,current_version integer)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object('documentId',(upload).document_id,'versionId',(upload).version_id,'version',(version_row).version,
    'isCurrent',(version_row).version=current_version,'fileName',(upload).file_name,'contentType',(version_row).content_type,
    'byteSize',(version_row).byte_size,'state',(upload).state,'revision',(upload).revision,
    'failureCode',CASE WHEN (upload).failure_code IS NULL OR (upload).state NOT IN ('rejected','failed') THEN NULL
      WHEN (upload).failure_code IN ('unsafe_document','document_integrity','invalid_document') THEN (upload).failure_code ELSE 'processing_failed' END,
    'createdAt',(upload).created_at,'updatedAt',(upload).updated_at)
$$;
REVOKE ALL ON FUNCTION mmhr_private.r4_workspace_document_metadata(public.workflow_document_uploads,public.workflow_document_versions,integer)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_workspace_documents(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE requested_org uuid; after_id uuid; rows jsonb; next_id uuid; actor uuid;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ? 'organizationId') OR correlation_id IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE field NOT IN ('organizationId','afterId'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR (payload ? 'afterId' AND coalesce(payload->>'afterId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document read'; END IF;
  requested_org:=(payload->>'organizationId')::uuid; after_id:=(payload->>'afterId')::uuid;
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r4_workspace_document_reader(requested_org);
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document read denied'; END IF;
  WITH candidates AS (
    SELECT d.id,mmhr_private.r4_workspace_document_metadata(u,v,d.current_version) AS item
    FROM public.workflow_documents d JOIN public.workflow_document_versions v ON v.document_id=d.id AND v.organization_id=d.organization_id AND v.version=d.current_version
      JOIN public.workflow_document_uploads u ON u.version_id=v.id AND u.document_id=d.id AND u.organization_id=d.organization_id
    WHERE d.organization_id=requested_org AND d.state='active' AND d.document_type='attachment'
      AND u.source_kind='workspace' AND u.upload_organization_id=requested_org AND (after_id IS NULL OR d.id>after_id)
    ORDER BY d.id LIMIT 26
  ), numbered AS (SELECT *,row_number() OVER(ORDER BY id) AS ordinal FROM candidates)
  SELECT coalesce(jsonb_agg(item ORDER BY id) FILTER(WHERE ordinal<=25),'[]'::jsonb),
    CASE WHEN count(*)=26 THEN (array_agg(id ORDER BY id))[25] ELSE NULL END INTO rows,next_id FROM numbered;
  RETURN jsonb_build_object('organizationId',requested_org,'correlationId',correlation_id,
    'canUpload',mmhr_private.r4_document_writer(requested_org) IS NOT NULL,'items',rows,'nextCursor',next_id);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_workspace_documents(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_workspace_documents(jsonb,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_workspace_document_versions(payload jsonb,correlation_id uuid)
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
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r4_workspace_document_reader(requested_org);
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document read denied'; END IF;
  SELECT d.current_version INTO current_version FROM public.workflow_documents d
    JOIN public.workflow_document_versions v ON v.document_id=d.id AND v.organization_id=d.organization_id AND v.version=d.current_version
    JOIN public.workflow_document_uploads u ON u.version_id=v.id AND u.document_id=d.id AND u.organization_id=d.organization_id
    WHERE d.organization_id=requested_org AND d.id=requested_doc AND d.state='active' AND d.document_type='attachment'
      AND u.source_kind='workspace' AND u.upload_organization_id=requested_org;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document read denied'; END IF;
  WITH candidates AS (
    SELECT v.version,mmhr_private.r4_workspace_document_metadata(u,v,current_version) AS item FROM public.workflow_document_versions v
      JOIN public.workflow_document_uploads u ON u.version_id=v.id AND u.document_id=v.document_id AND u.organization_id=v.organization_id
    WHERE v.organization_id=requested_org AND v.document_id=requested_doc AND u.source_kind='workspace' AND u.upload_organization_id=requested_org
      AND v.version>after_version AND v.version<=current_version ORDER BY v.version LIMIT 26
  ), numbered AS (SELECT *,row_number() OVER(ORDER BY version) AS ordinal FROM candidates)
  SELECT coalesce(jsonb_agg(item ORDER BY version) FILTER(WHERE ordinal<=25),'[]'::jsonb),
    CASE WHEN count(*)=26 THEN (array_agg(version ORDER BY version))[25] ELSE NULL END INTO rows,next_version FROM numbered;
  RETURN jsonb_build_object('organizationId',requested_org,'documentId',requested_doc,'correlationId',correlation_id,'currentVersion',current_version,
    'canUpload',mmhr_private.r4_document_writer(requested_org) IS NOT NULL,'items',rows,'nextVersion',next_version);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_workspace_document_versions(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_workspace_document_versions(jsonb,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_workspace_document_history(payload jsonb,correlation_id uuid)
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
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r4_workspace_document_reader(requested_org);
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.workflow_documents d
    JOIN public.workflow_document_versions v ON v.document_id=d.id AND v.organization_id=d.organization_id
    JOIN public.workflow_document_uploads u ON u.version_id=v.id AND u.document_id=d.id AND u.organization_id=d.organization_id
    WHERE d.organization_id=requested_org AND d.id=requested_doc AND v.id=requested_version AND d.state='active' AND d.document_type='attachment'
      AND u.source_kind='workspace' AND u.upload_organization_id=requested_org) THEN
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
REVOKE ALL ON FUNCTION public.mmhr_get_workspace_document_history(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_workspace_document_history(jsonb,uuid) TO authenticated;
