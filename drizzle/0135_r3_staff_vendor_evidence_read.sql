-- Staff-only evidence review. Raw tables and existing write paths stay unchanged.
CREATE OR REPLACE FUNCTION public.mmhr_get_vendor_evidence(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_after uuid;
  v_limit integer;
  v_items jsonb;
  v_next uuid;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object'
    OR payload - ARRAY['organizationId','afterId','limit'] <> '{}'::jsonb
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR (payload ? 'afterId' AND coalesce(payload->>'afterId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    OR (payload ? 'limit' AND (jsonb_typeof(payload->'limit') <> 'number' OR coalesce(payload->>'limit','') !~ '^[0-9]{1,2}$'))
  THEN RAISE EXCEPTION 'Invalid evidence read input' USING ERRCODE='22023'; END IF;
  v_org := (payload->>'organizationId')::uuid;
  v_after := (payload->>'afterId')::uuid;
  v_limit := coalesce((payload->>'limit')::integer,25);
  IF v_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid evidence read input' USING ERRCODE='22023'; END IF;
  IF NOT mmhr_private.r1_request_has_permission('workspace.access',v_org)
    OR NOT mmhr_private.r1_request_has_permission('admin.access',NULL::uuid)
  THEN RAISE EXCEPTION 'Evidence access denied' USING ERRCODE='42501'; END IF;

  WITH evidence_page AS (
    SELECT e.* FROM public.vendor_evidence_versions e
    WHERE e.organization_id=v_org AND (v_after IS NULL OR e.id>v_after)
    ORDER BY e.id LIMIT v_limit+1
  ), visible AS (
    SELECT * FROM evidence_page ORDER BY id LIMIT v_limit
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'productName',p.name,
    'source',jsonb_build_object('sourceId',s.id,'organizationId',s.organization_id,'vendorProfileId',s.vendor_profile_id,
      'uri',s.uri,'sourceType',s.source_type,'licenseNote',s.license_note,'capturedAt',s.captured_at,'active',s.active),
    'fact',jsonb_build_object('factId',f.id,'organizationId',f.organization_id,'vendorProfileId',f.vendor_profile_id,
      'productId',f.product_id,'fieldKey',f.field_key,'value',f.value,'observedAt',f.observed_at,'status',f.status),
    'evidence',jsonb_build_object('evidenceId',e.id,'organizationId',e.organization_id,'factId',e.fact_id,'sourceId',e.source_id,
      'version',e.version,'contentHash',e.content_hash,'capturedAt',e.captured_at,'freshUntil',e.fresh_until,'citation',e.citation),
    'review',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('approvalId',r.id,'organizationId',r.organization_id,
      'evidenceId',r.evidence_id,'reviewerIdentityId',r.reviewer_identity_id,'decision',r.decision,'decidedAt',r.decided_at,'reason',r.reason) END
  ) ORDER BY e.id),'[]'::jsonb),
  CASE WHEN (SELECT count(*) FROM evidence_page)>v_limit THEN (SELECT id FROM visible ORDER BY id DESC LIMIT 1) END
  INTO v_items,v_next
  FROM visible e
  JOIN public.vendor_facts f ON f.organization_id=v_org AND f.id=e.fact_id
  JOIN public.vendor_sources s ON s.organization_id=v_org AND s.id=e.source_id
  LEFT JOIN public.products p ON p.organization_id=v_org AND p.id=f.product_id AND p.vendor_profile_id=f.vendor_profile_id
  LEFT JOIN LATERAL (
    SELECT review.* FROM public.vendor_fact_reviews review
    WHERE review.organization_id=v_org AND review.evidence_id=e.id
    ORDER BY review.decided_at DESC,review.id DESC LIMIT 1
  ) r ON true;
  RETURN jsonb_build_object('organizationId',v_org,'readAt',statement_timestamp(),'items',v_items,'nextCursor',v_next);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_vendor_evidence(jsonb) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_get_vendor_evidence(jsonb) TO authenticated;
