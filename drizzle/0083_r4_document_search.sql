-- R4 authorized document search over metadata and approved extracted content.
ALTER TABLE public.workflow_document_versions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_extracted_content text;--> statement-breakpoint
ALTER TABLE public.workflow_document_versions
  ADD CONSTRAINT workflow_document_versions_metadata_ck CHECK (jsonb_typeof(metadata) = 'object'),
  ADD CONSTRAINT workflow_document_versions_extracted_content_ck CHECK (approved_extracted_content IS NULL OR length(approved_extracted_content) <= 1000000);--> statement-breakpoint
CREATE INDEX workflow_document_versions_search_idx ON public.workflow_document_versions (organization_id, state, scan_state, document_id);--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_set_workflow_document_search_content(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; row_item public.workflow_document_versions%ROWTYPE; v_org uuid; v_actor uuid; v_doc uuid; v_version_id uuid;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'documentId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'versionId','') !~ '^[0-9a-fA-F-]{36}$' OR jsonb_typeof(payload->'metadata') <> 'object' OR length(coalesce(payload->>'approvedExtractedContent','')) > 1000000 OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid document search content'; END IF;
  v_org := (payload->>'organizationId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_doc := (payload->>'documentId')::uuid; v_version_id := (payload->>'versionId')::uuid;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Set document search content', correlation_id, idempotency_key);
  IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.doc.search.content', idempotency_key, payload);
  IF receipt IS NOT NULL THEN RETURN jsonb_build_object('documentId', v_doc, 'versionId', v_version_id, 'organizationId', v_org, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  SELECT * INTO row_item FROM public.workflow_document_versions WHERE organization_id = v_org AND document_id = v_doc AND id = v_version_id AND state = 'approved' AND scan_state = 'clean' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Document search content denied'; END IF;
  UPDATE public.workflow_document_versions SET metadata = payload->'metadata', approved_extracted_content = NULLIF(payload->>'approvedExtractedContent','') WHERE organization_id = v_org AND id = v_version_id RETURNING * INTO row_item;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.doc.search.content', 'document.search.content', 'workflow_document_version', row_item.id, v_org, 'Set document search content', correlation_id, idempotency_key, payload, jsonb_build_object('state','approved'), jsonb_build_object('state','approved'), context.authorization_time);
  RETURN jsonb_build_object('documentId', row_item.document_id, 'versionId', row_item.id, 'organizationId', row_item.organization_id, 'outcomeCode', 'recorded', 'correlationId', correlation_id);
END; $$;--> statement-breakpoint

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
  FROM (SELECT d.id AS document_id, d.document_type, v.id AS version_id, v.version, v.metadata, v.approved_extracted_content, v.created_at FROM public.workflow_documents d JOIN public.workflow_document_versions v ON v.organization_id = d.organization_id AND v.document_id = d.id WHERE d.organization_id = v_org AND d.state = 'active' AND v.state = 'approved' AND v.scan_state = 'clean' AND (v_type IS NULL OR d.document_type = v_type) AND lower(coalesce(v.metadata::text,'') || ' ' || coalesce(v.approved_extracted_content,'')) LIKE '%' || lower(v_query) || '%' ORDER BY v.created_at DESC LIMIT v_limit) v;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.doc.search', 'document.search', 'workflow_document_search', correlation_id, v_org, 'Search workflow documents', correlation_id, idempotency_key, payload, NULL, jsonb_build_object('state','completed'), context.authorization_time);
  RETURN jsonb_build_object('organizationId', v_org, 'query', v_query, 'results', v_results, 'outcomeCode', 'recorded', 'correlationId', correlation_id);
END; $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_set_workflow_document_search_content(jsonb,uuid,uuid), public.mmhr_search_workflow_documents(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_set_workflow_document_search_content(jsonb,uuid,uuid), public.mmhr_search_workflow_documents(jsonb,uuid,uuid) TO authenticated;
