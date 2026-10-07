-- Custom SQL migration file, put your code below! --
-- Additive metadata filter. This never searches unapproved extracted content.
CREATE OR REPLACE FUNCTION public.mmhr_get_workspace_documents(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE requested_org uuid; after_id uuid; search_query text; rows jsonb; next_id uuid; actor uuid;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ? 'organizationId') OR correlation_id IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE field NOT IN ('organizationId','afterId','searchQuery'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR (payload ? 'afterId' AND coalesce(payload->>'afterId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
    OR (payload ? 'searchQuery' AND (jsonb_typeof(payload->'searchQuery') IS DISTINCT FROM 'string'
      OR char_length(btrim(payload->>'searchQuery')) NOT BETWEEN 1 AND 120
      OR payload->>'searchQuery' ~ '[[:cntrl:]]')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document read'; END IF;
  requested_org:=(payload->>'organizationId')::uuid; after_id:=(payload->>'afterId')::uuid;
  search_query:=CASE WHEN payload ? 'searchQuery' THEN lower(btrim(payload->>'searchQuery')) ELSE NULL END;
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r4_workspace_document_reader(requested_org);
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document read denied'; END IF;
  WITH candidates AS (
    SELECT d.id,mmhr_private.r4_workspace_document_metadata(u,v,d.current_version) AS item
    FROM public.workflow_documents d JOIN public.workflow_document_versions v ON v.document_id=d.id AND v.organization_id=d.organization_id AND v.version=d.current_version
      JOIN public.workflow_document_uploads u ON u.version_id=v.id AND u.document_id=d.id AND u.organization_id=d.organization_id
    WHERE d.organization_id=requested_org AND d.state='active' AND d.document_type='attachment'
      AND u.source_kind='workspace' AND u.upload_organization_id=requested_org AND (after_id IS NULL OR d.id>after_id)
      AND (search_query IS NULL OR strpos(lower(u.file_name),search_query)>0)
    ORDER BY d.id LIMIT 26
  ), numbered AS (SELECT *,row_number() OVER(ORDER BY id) AS ordinal FROM candidates)
  SELECT coalesce(jsonb_agg(item ORDER BY id) FILTER(WHERE ordinal<=25),'[]'::jsonb),
    CASE WHEN count(*)=26 THEN (array_agg(id ORDER BY id))[25] ELSE NULL END INTO rows,next_id FROM numbered;
  RETURN jsonb_build_object('organizationId',requested_org,'correlationId',correlation_id,
    'canUpload',mmhr_private.r4_document_writer(requested_org) IS NOT NULL,'items',rows,'nextCursor',next_id);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_workspace_documents(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_workspace_documents(jsonb,uuid) TO authenticated;
