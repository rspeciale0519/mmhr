-- R4 immutable document metadata, quarantine, scanning, and approval controls.

ALTER TABLE public.workflow_document_versions
  ADD COLUMN content_type text NOT NULL DEFAULT 'text/plain',
  ADD COLUMN byte_size integer NOT NULL DEFAULT 1,
  ADD COLUMN scan_state text NOT NULL DEFAULT 'pending';
ALTER TABLE public.workflow_document_versions
  ADD CONSTRAINT workflow_document_versions_content_type_ck CHECK (content_type IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/plain')),
  ADD CONSTRAINT workflow_document_versions_size_ck CHECK (byte_size BETWEEN 1 AND 26214400),
  ADD CONSTRAINT workflow_document_versions_scan_ck CHECK (scan_state IN ('pending', 'clean', 'quarantined', 'failed'));

CREATE OR REPLACE FUNCTION public.mmhr_record_workflow_document(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; receipt jsonb; doc public.workflow_documents%ROWTYPE; version_row public.workflow_document_versions%ROWTYPE; v_action text; v_doc uuid; v_version_id uuid; v_org uuid; v_actor uuid; v_type text; v_version integer; v_hash text; v_storage text; v_content_type text; v_size integer; v_scan text; v_state text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR coalesce(payload->>'action','') NOT IN ('upload','scan','approve','archive') OR correlation_id IS NULL OR idempotency_key IS NULL OR coalesce(payload->>'documentId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid document input'; END IF;
  v_action := payload->>'action'; v_doc := (payload->>'documentId')::uuid; v_org := (payload->>'organizationId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_version_id := nullif(payload->>'versionId','')::uuid; v_version := nullif(payload->>'version','')::integer; v_hash := payload->>'sha256'; v_storage := payload->>'storageReference'; v_content_type := payload->>'contentType'; v_size := nullif(payload->>'byteSize','')::integer; v_scan := coalesce(payload->>'scanState','pending');
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Record workflow document', correlation_id, idempotency_key); IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.doc.control', idempotency_key, payload); IF receipt IS NOT NULL THEN SELECT * INTO doc FROM public.workflow_documents d WHERE d.id = (receipt->>'entity_id')::uuid AND d.organization_id = v_org; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('documentId', doc.id, 'organizationId', doc.organization_id, 'currentVersion', doc.current_version, 'state', doc.state, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  IF v_action = 'upload' THEN
    IF v_version IS NULL OR v_version < 1 OR coalesce(v_hash,'') !~ '^[0-9a-fA-F]{64}$' OR coalesce(v_storage,'') !~ '^quarantine://[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$' OR v_content_type NOT IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/plain') OR v_size IS NULL OR v_size NOT BETWEEN 1 AND 26214400 OR coalesce(payload->>'documentType','') NOT IN ('rfp','response','proposal','contract','attachment','other') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid document upload'; END IF;
    INSERT INTO public.workflow_documents(id, organization_id, document_type, current_version, state, created_by_identity_id) VALUES (v_doc, v_org, payload->>'documentType', v_version, 'active', v_actor) ON CONFLICT (id) DO UPDATE SET current_version = GREATEST(public.workflow_documents.current_version, EXCLUDED.current_version), updated_at = clock_timestamp() WHERE public.workflow_documents.organization_id = v_org RETURNING * INTO doc;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Document association denied'; END IF;
    INSERT INTO public.workflow_document_versions(id, organization_id, document_id, version, state, sha256, storage_reference, content_type, byte_size, scan_state, created_by_identity_id) VALUES (coalesce(v_version_id, gen_random_uuid()), v_org, v_doc, v_version, 'ready', lower(v_hash), v_storage, v_content_type, v_size, 'pending', v_actor) RETURNING * INTO version_row;
  ELSIF v_action = 'scan' THEN
    IF v_version_id IS NULL OR v_scan NOT IN ('clean','quarantined','failed') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid document scan'; END IF;
    UPDATE public.workflow_document_versions SET scan_state = v_scan WHERE id = v_version_id AND organization_id = v_org AND document_id = v_doc RETURNING * INTO version_row; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Document version association denied'; END IF;
    SELECT * INTO doc FROM public.workflow_documents WHERE id = v_doc AND organization_id = v_org;
  ELSIF v_action = 'approve' THEN
    IF v_version_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid document approval'; END IF;
    UPDATE public.workflow_document_versions SET state = 'approved' WHERE id = v_version_id AND organization_id = v_org AND document_id = v_doc AND scan_state = 'clean' RETURNING * INTO version_row; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Document approval denied'; END IF;
    SELECT * INTO doc FROM public.workflow_documents WHERE id = v_doc AND organization_id = v_org;
  ELSE
    UPDATE public.workflow_documents SET state = 'archived', updated_at = clock_timestamp() WHERE id = v_doc AND organization_id = v_org RETURNING * INTO doc; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Document archive denied'; END IF;
  END IF;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.doc.control', 'document.' || v_action, 'workflow_document', doc.id, v_org, 'Record workflow document', correlation_id, idempotency_key, payload, jsonb_build_object('status','completed'), jsonb_build_object('status','completed'), context.authorization_time);
  RETURN jsonb_build_object('documentId', doc.id, 'organizationId', doc.organization_id, 'currentVersion', doc.current_version, 'state', doc.state, 'versionId', coalesce(version_row.id, null), 'versionState', coalesce(version_row.state, null), 'scanState', coalesce(version_row.scan_state, null), 'outcomeCode', 'recorded', 'correlationId', correlation_id);
END;
$$;
REVOKE ALL ON FUNCTION public.mmhr_record_workflow_document(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_workflow_document(jsonb, uuid, uuid) TO authenticated;
