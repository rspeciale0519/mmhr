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
  INSERT INTO public.vendor_sources (id, organization_id, vendor_profile_id, uri, source_type, license_note, captured_at, active, created_by_identity_id)
    VALUES (source_id, organization_id, (source->>'vendorProfileId')::uuid, source->>'uri', source->>'sourceType', source->>'licenseNote',
      (source->>'capturedAt')::timestamptz, true, context.actor_identity_id);
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

