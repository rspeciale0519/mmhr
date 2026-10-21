-- New source records retain their owner and configured review schedule.
-- Legacy writes default to manual/30 days; legacy reads keep their response shape.
-- Existing sources, evidence, permissions, and publications are unchanged.
-- Optional renewal appends evidence without changing the fact or existing publications.
CREATE OR REPLACE FUNCTION public.mmhr_record_vendor_evidence(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  receipt jsonb;
  source jsonb;
  fact jsonb;
  evidence jsonb;
  organization_id uuid;
  source_id uuid;
  fact_id uuid;
  evidence_id uuid;
  expected_version integer;
  latest_version integer;
  latest_capture timestamptz;
  existing_fact public.vendor_facts%ROWTYPE;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR jsonb_typeof(payload->'source') <> 'object'
    OR jsonb_typeof(payload->'fact') <> 'object'
    OR jsonb_typeof(payload->'evidence') <> 'object'
    OR coalesce(payload->'source'->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->'fact'->>'organizationId','') <> payload->'source'->>'organizationId'
    OR coalesce(payload->'evidence'->>'organizationId','') <> payload->'source'->>'organizationId'
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid vendor evidence input'; END IF;
  source := payload->'source'; fact := payload->'fact'; evidence := payload->'evidence';
  organization_id := (source->>'organizationId')::uuid;
  source_id := (source->>'sourceId')::uuid; fact_id := (fact->>'factId')::uuid; evidence_id := (evidence->>'evidenceId')::uuid;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', organization_id, 'Record vendor evidence', correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'crm.vendor.evidence.record', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    RETURN mmhr_private.r2b_vendor_evidence_result(source_id, fact_id, evidence_id, NULL, organization_id, 'replayed', correlation_id);
  END IF;
  IF source->>'sourceType' NOT IN ('vendor_owned','licensed','manual')
    OR source->>'uri' !~ '^https://'
    OR source->>'active' <> 'true'
    OR fact->>'status' <> 'draft'
    OR evidence->>'contentHash' !~ '^[a-f0-9A-F]{64}$'
    OR (evidence->>'version')::integer < 1
    OR evidence->>'capturedAt' IS NULL OR evidence->>'freshUntil' IS NULL
    OR (evidence->>'freshUntil')::timestamptz < (evidence->>'capturedAt')::timestamptz
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid vendor evidence input'; END IF;
  IF source ? 'captureMethod' AND (jsonb_typeof(source->'captureMethod') IS DISTINCT FROM 'string'
    OR source->>'captureMethod' NOT IN ('api','web','document','email','manual','other')) THEN
    RAISE EXCEPTION 'Invalid source capture method' USING ERRCODE='22023';
  END IF;
  IF source ? 'cadenceDays' THEN
    IF jsonb_typeof(source->'cadenceDays') IS DISTINCT FROM 'number'
      OR coalesce(source->>'cadenceDays','') !~ '^[0-9]{1,4}$' THEN
      RAISE EXCEPTION 'Invalid source review cadence' USING ERRCODE='22023';
    END IF;
    IF (source->>'cadenceDays')::integer NOT BETWEEN 1 AND 3650 THEN
      RAISE EXCEPTION 'Invalid source review cadence' USING ERRCODE='22023';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendor_profiles v WHERE v.organization_id = organization_id AND v.id = (source->>'vendorProfileId')::uuid)
    OR NOT EXISTS (SELECT 1 FROM public.vendor_profiles v WHERE v.organization_id = organization_id AND v.id = (fact->>'vendorProfileId')::uuid)
    OR (fact->>'vendorProfileId') <> (source->>'vendorProfileId')
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  IF (fact->>'productId') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.organization_id = organization_id
      AND p.vendor_profile_id = (fact->>'vendorProfileId')::uuid AND p.id = (fact->>'productId')::uuid)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  IF payload ? 'expectedEvidenceVersion' THEN
    IF jsonb_typeof(payload->'expectedEvidenceVersion') IS DISTINCT FROM 'number'
      OR coalesce(payload->>'expectedEvidenceVersion','') !~ '^[1-9][0-9]{0,9}$' THEN
      RAISE EXCEPTION 'Invalid evidence renewal version' USING ERRCODE='22023';
    END IF;
    IF (payload->>'expectedEvidenceVersion')::numeric > 2147483646 THEN
      RAISE EXCEPTION 'Invalid evidence renewal version' USING ERRCODE='22023';
    END IF;
    expected_version := (payload->>'expectedEvidenceVersion')::integer;
    SELECT * INTO existing_fact FROM public.vendor_facts vf
      WHERE vf.organization_id=organization_id AND vf.id=fact_id FOR UPDATE;
    IF NOT FOUND OR existing_fact.status NOT IN ('draft','published')
      OR existing_fact.vendor_profile_id IS DISTINCT FROM (fact->>'vendorProfileId')::uuid
      OR existing_fact.product_id IS DISTINCT FROM NULLIF(fact->>'productId','')::uuid
      OR existing_fact.field_key IS DISTINCT FROM fact->>'fieldKey'
      OR existing_fact.value IS DISTINCT FROM fact->>'value' THEN
      RAISE EXCEPTION 'Evidence renewal fact changed' USING ERRCODE='42501';
    END IF;
    SELECT ev.version,ev.captured_at INTO latest_version,latest_capture
      FROM public.vendor_evidence_versions ev WHERE ev.organization_id=organization_id AND ev.fact_id=fact_id
      ORDER BY ev.version DESC LIMIT 1;
    IF latest_version IS DISTINCT FROM expected_version OR (evidence->>'version')::integer <> expected_version+1
      OR (evidence->>'capturedAt')::timestamptz < latest_capture
      OR (source->>'capturedAt')::timestamptz IS DISTINCT FROM (evidence->>'capturedAt')::timestamptz THEN
      RAISE EXCEPTION 'Evidence renewal is stale or invalid' USING ERRCODE='22023';
    END IF;
  END IF;
  INSERT INTO public.vendor_sources (id, organization_id, vendor_profile_id, uri, source_type, license_note, captured_at, active, created_by_identity_id, owner_identity_id, capture_method, cadence_days, review_required)
    VALUES (source_id, organization_id, (source->>'vendorProfileId')::uuid, source->>'uri', source->>'sourceType', source->>'licenseNote',
      (source->>'capturedAt')::timestamptz, true, context.actor_identity_id, context.actor_identity_id,
      coalesce(source->>'captureMethod','manual'), coalesce((source->>'cadenceDays')::integer,30), true);
  IF expected_version IS NULL THEN
  INSERT INTO public.vendor_facts (id, organization_id, vendor_profile_id, product_id, field_key, value, observed_at, status, created_by_identity_id)
    VALUES (fact_id, organization_id, (fact->>'vendorProfileId')::uuid, NULLIF(fact->>'productId','')::uuid,
      fact->>'fieldKey', fact->>'value', (fact->>'observedAt')::timestamptz, 'draft', context.actor_identity_id);
  END IF;
  INSERT INTO public.vendor_evidence_versions (id, organization_id, fact_id, source_id, version, content_hash, captured_at, fresh_until, citation)
    VALUES (evidence_id, organization_id, fact_id, source_id, (evidence->>'version')::integer,
      lower(evidence->>'contentHash'), (evidence->>'capturedAt')::timestamptz, (evidence->>'freshUntil')::timestamptz, evidence->>'citation');
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'crm.vendor.evidence.record', 'crm.vendor.evidence.record', 'vendor_evidence_bundle',
    evidence_id, organization_id, 'Record vendor evidence', correlation_id, idempotency_key, payload, NULL,
    jsonb_build_object('state','completed','version',1), context.authorization_time);
  RETURN mmhr_private.r2b_vendor_evidence_result(source_id, fact_id, evidence_id, NULL, organization_id, 'recorded', correlation_id);
END
$$;--> statement-breakpoint


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
    OR payload - ARRAY['organizationId','afterId','limit','registryVersion'] <> '{}'::jsonb
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR (payload ? 'afterId' AND coalesce(payload->>'afterId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    OR (payload ? 'limit' AND (jsonb_typeof(payload->'limit') <> 'number' OR coalesce(payload->>'limit','') !~ '^[0-9]{1,2}$'))
    OR (payload ? 'registryVersion' AND payload->'registryVersion' IS DISTINCT FROM '1'::jsonb)
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
  ) || CASE WHEN payload->'registryVersion'='1'::jsonb THEN jsonb_build_object('registry',
    jsonb_build_object('ownerIdentityId',s.owner_identity_id,'captureMethod',s.capture_method,
      'cadenceDays',s.cadence_days,'reviewRequired',s.review_required)) ELSE '{}'::jsonb END
    ORDER BY e.id),'[]'::jsonb),
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
