-- R2B vendor evidence command surface. Raw tables remain closed; only these
-- organization-scoped, audited functions can create or approve evidence.

CREATE UNIQUE INDEX vendor_fact_reviews_organization_evidence_uq
  ON public.vendor_fact_reviews (organization_id, evidence_id);--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r2b_vendor_evidence_result(
  source_id uuid, fact_id uuid, evidence_id uuid, approval_id uuid,
  organization_id uuid, outcome_code text, correlation_id uuid
)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT jsonb_build_object(
  'sourceId', $1, 'factId', $2, 'evidenceId', $3, 'approvalId', $4,
  'organizationId', $5, 'outcomeCode', $6, 'correlationId', $7) $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r2b_vendor_evidence_result(uuid,uuid,uuid,uuid,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint

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
  INSERT INTO public.vendor_sources (id, organization_id, vendor_profile_id, uri, source_type, license_note, captured_at, active, created_by_identity_id)
    VALUES (source_id, organization_id, (source->>'vendorProfileId')::uuid, source->>'uri', source->>'sourceType', source->>'licenseNote',
      (source->>'capturedAt')::timestamptz, true, context.actor_identity_id);
  INSERT INTO public.vendor_facts (id, organization_id, vendor_profile_id, product_id, field_key, value, observed_at, status, created_by_identity_id)
    VALUES (fact_id, organization_id, (fact->>'vendorProfileId')::uuid, NULLIF(fact->>'productId','')::uuid,
      fact->>'fieldKey', fact->>'value', (fact->>'observedAt')::timestamptz, 'draft', context.actor_identity_id);
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

CREATE OR REPLACE FUNCTION public.mmhr_approve_vendor_evidence(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  receipt jsonb;
  organization_id uuid;
  evidence_id uuid;
  fact_id uuid;
  approval_id uuid;
  decision text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'evidenceId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'approvalId','') !~ '^[0-9a-fA-F-]{36}$'
    OR payload->>'decision' NOT IN ('approved','rejected')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid vendor evidence approval'; END IF;
  organization_id := (payload->>'organizationId')::uuid; evidence_id := (payload->>'evidenceId')::uuid;
  approval_id := (payload->>'approvalId')::uuid; decision := payload->>'decision';
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'audit.export', organization_id, 'Approve vendor evidence', correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'crm.vendor.evidence.approve', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT e.fact_id INTO fact_id FROM public.vendor_evidence_versions e WHERE e.organization_id = organization_id AND e.id = evidence_id;
    RETURN mmhr_private.r2b_vendor_evidence_result(NULL, fact_id, evidence_id, approval_id, organization_id, 'replayed', correlation_id);
  END IF;
  SELECT e.fact_id INTO fact_id FROM public.vendor_evidence_versions e WHERE e.organization_id = organization_id AND e.id = evidence_id;
  IF fact_id IS NULL OR EXISTS (SELECT 1 FROM public.vendor_fact_reviews r WHERE r.organization_id = organization_id AND r.evidence_id = evidence_id)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  INSERT INTO public.vendor_fact_reviews (id, organization_id, evidence_id, reviewer_identity_id, decision, decided_at, reason)
    VALUES (approval_id, organization_id, evidence_id, context.actor_identity_id, decision,
      (payload->>'decidedAt')::timestamptz, NULLIF(payload->>'reason',''));
  IF decision = 'approved' THEN
    UPDATE public.vendor_facts AS vf SET status = 'published' WHERE vf.organization_id = organization_id AND vf.id = fact_id AND vf.status = 'draft';
  END IF;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'crm.vendor.evidence.approve', 'crm.vendor.evidence.approve', 'vendor_evidence_approval',
    approval_id, organization_id, 'Approve vendor evidence', correlation_id, idempotency_key, payload, NULL,
    jsonb_build_object('state',decision,'version',1), context.authorization_time);
  RETURN mmhr_private.r2b_vendor_evidence_result(NULL, fact_id, evidence_id, approval_id, organization_id, 'decided', correlation_id);
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.mmhr_record_vendor_evidence(jsonb,uuid,uuid), public.mmhr_approve_vendor_evidence(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_record_vendor_evidence(jsonb,uuid,uuid), public.mmhr_approve_vendor_evidence(jsonb,uuid,uuid) TO authenticated;
