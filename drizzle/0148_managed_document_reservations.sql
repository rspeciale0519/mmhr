-- Expansion only: register immutable workspace originals before Storage writes.
-- No bucket, Storage permission, scanner, or download access is activated here.
CREATE FUNCTION public.mmhr_reserve_workspace_document(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE keys text[]:=ARRAY['organizationId','documentId','versionId','expectedVersion','fileName','contentType','byteSize','sha256'];
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
  checked_at:=mmhr_private.r1_lock_security(); actor:=mmhr_private.r1_request_identity_id();
  IF claims->>'role' IS DISTINCT FROM 'authenticated' OR coalesce(claims->>'aal','') NOT IN ('aal1','aal2')
    OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$' OR coalesce(claims->>'iat','') !~ '^[0-9]{1,12}$'
    OR lower(coalesce(claims->>'sub','')) IS DISTINCT FROM lower(auth.uid()::text)
    OR coalesce(claims->>'session_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document reservation denied';
  END IF;
  request_session:=(claims->>'session_id')::uuid;
  IF (claims->>'exp')::numeric<=extract(epoch FROM checked_at)
    OR (claims->>'iat')::numeric>floor(extract(epoch FROM checked_at))
    OR (claims->>'iat')::numeric>=(claims->>'exp')::numeric
    OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=request_session AND s.user_id=auth.uid()
      AND (s.not_after IS NULL OR s.not_after>checked_at))
    OR (claims->>'aal'='aal2' AND NOT mmhr_private.r1_session_is_aal2(auth.uid(),request_session,checked_at)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document reservation denied';
  END IF;
  IF actor IS NULL OR NOT mmhr_private.r1_verified_identity(actor,false)
    OR NOT mmhr_private.r1_evaluate_permission(actor,'workspace.access',requested_org,claims->>'aal',checked_at,false)
    OR NOT (EXISTS(SELECT 1 FROM public.org_members m WHERE m.org_id=requested_org AND m.identity_id=actor
      AND m.status='active' AND NOT m.migration_review_required AND m.role_key IN ('organization_admin','contributor'))
      OR (mmhr_private.r1_evaluate_permission(actor,'admin.access',NULL,claims->>'aal',checked_at,false)
        AND mmhr_private.r1_evaluate_permission(actor,'rfp.approve',requested_org,claims->>'aal',checked_at,false)))
    OR NOT EXISTS(SELECT 1 FROM public.orgs WHERE id=requested_org AND status='active' AND NOT migration_review_required)
    OR EXISTS(SELECT 1 FROM public.identities WHERE status='recovery_pending') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document reservation denied';
  END IF;
  receipt:=mmhr_private.r1_checked_receipt(actor,'r4.document.reserve',idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    IF (receipt->>'entity_id')::uuid<>requested_version OR NOT EXISTS(SELECT 1 FROM public.workflow_document_uploads u
      WHERE u.version_id=requested_version AND u.document_id=doc_id AND u.organization_id=requested_org
        AND u.uploaded_by_identity_id=actor AND u.source_kind='workspace') THEN
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
      IF NOT FOUND OR previous_upload.source_kind<>'workspace' OR previous_upload.state NOT IN ('approved','rejected') THEN
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
      VALUES(requested_version,requested_org,doc_id,requested_org,actor,'workspace',payload->>'fileName',correlation_id);
    INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,actor_identity_id,snapshot,correlation_id)
      VALUES(requested_org,requested_version,1,'reserve',actor,jsonb_build_object('state','received','version',new_version),correlation_id);
    PERFORM mmhr_private.r1_finish_security_command(actor,'r4.document.reserve','document.reserve','workflow_document_version',requested_version,requested_org,
      'Reserve private document upload',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),
      jsonb_build_object('status','completed'),checked_at);
  END IF;
  RETURN jsonb_build_object('organizationId',requested_org,'documentId',doc_id,'versionId',requested_version,'version',new_version,
    'state','received','revision',1,'correlationId',correlation_id,'outcomeCode',CASE WHEN receipt IS NULL THEN 'recorded' ELSE 'replayed' END);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_reserve_workspace_document(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_reserve_workspace_document(jsonb,uuid,uuid) TO authenticated;
