-- R3 private, source-backed vendor input resolver for customer option publication.
-- This helper returns only approved, currently usable values. It does not publish
-- data, change matching results, or expose provider identifiers through a grant.
CREATE OR REPLACE FUNCTION mmhr_private.r3_approved_vendor_inputs(
  vendor_org uuid,
  product_id uuid,
  as_of timestamptz
)
RETURNS TABLE (
  fact_id uuid,
  field_key text,
  value text,
  provenance text,
  evidence_id uuid,
  source_id uuid,
  review_id uuid,
  evidence_version integer,
  content_hash text,
  observed_at timestamptz,
  captured_at timestamptz,
  valid_until timestamptz,
  override_id uuid,
  approved_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH product_scope AS (
    SELECT p.id, p.organization_id, p.vendor_profile_id
    FROM public.products AS p
    JOIN public.vendor_profiles AS vp
      ON vp.organization_id = p.organization_id
     AND vp.id = p.vendor_profile_id
    JOIN public.orgs AS o ON o.id = p.organization_id
    WHERE p.organization_id = $1
      AND p.id = $2
      AND o.status = 'active'
      AND o.activated_at IS NOT NULL
      AND o.activated_at <= $3
      AND vp.status = 'active'
      AND vp.approved_at IS NOT NULL
      AND vp.approved_by_identity_id IS NOT NULL
      AND vp.approved_at <= $3
      AND p.status = 'active'
  ),
  facts AS (
    SELECT f.id, f.organization_id, f.vendor_profile_id, f.field_key,
      f.value, f.observed_at, f.status
    FROM public.vendor_facts AS f
    JOIN product_scope AS p
      ON p.organization_id = f.organization_id
     AND p.vendor_profile_id = f.vendor_profile_id
     AND p.id = f.product_id
    WHERE f.status <> 'archived'
      AND f.observed_at <= $3
  ),
  latest_overrides AS (
    SELECT DISTINCT ON (f.id)
      f.id AS fact_id,
      f.field_key,
      f.value AS fact_value,
      f.observed_at,
      f.status AS fact_status,
      o.id AS override_id,
      o.value AS override_value,
      o.source_id,
      o.approved_at,
      o.expires_at,
      s.active AS source_active,
      s.vendor_profile_id AS source_vendor_profile_id,
      s.captured_at AS source_captured_at
    FROM facts AS f
    JOIN public.vendor_fact_overrides AS o
      ON o.organization_id = f.organization_id
     AND o.fact_id = f.id
    LEFT JOIN public.vendor_sources AS s
      ON s.organization_id = o.organization_id
     AND s.id = o.source_id
    ORDER BY f.id, o.approved_at DESC, o.id DESC
  ),
  valid_overrides AS (
    SELECT *
    FROM latest_overrides
    WHERE fact_status IN ('draft', 'published')
      AND source_active
      AND source_vendor_profile_id = (SELECT vendor_profile_id FROM product_scope)
      AND source_captured_at <= $3
      AND approved_at <= $3
      AND expires_at > $3
  ),
  latest_evidence AS (
    SELECT DISTINCT ON (f.id)
      f.id AS fact_id,
      f.field_key,
      f.value,
      f.observed_at,
      f.status AS fact_status,
      e.id AS evidence_id,
      e.source_id,
      e.version AS evidence_version,
      e.content_hash,
      e.captured_at,
      e.fresh_until,
      r.id AS review_id,
      r.decided_at AS approved_at,
      s.active AS source_active,
      s.vendor_profile_id AS source_vendor_profile_id,
      s.captured_at AS source_captured_at,
      r.decision AS review_decision
    FROM facts AS f
    JOIN public.vendor_evidence_versions AS e
      ON e.organization_id = f.organization_id
     AND e.fact_id = f.id
    LEFT JOIN public.vendor_sources AS s
      ON s.organization_id = e.organization_id
     AND s.id = e.source_id
    LEFT JOIN public.vendor_fact_reviews AS r
      ON r.organization_id = e.organization_id
     AND r.evidence_id = e.id
    ORDER BY f.id, e.version DESC, e.id DESC
  )
  SELECT vo.fact_id, vo.field_key, vo.override_value, 'override'::text,
    NULL::uuid, vo.source_id, NULL::uuid, NULL::integer, NULL::text,
    vo.observed_at, vo.source_captured_at, vo.expires_at, vo.override_id,
    vo.approved_at
  FROM valid_overrides AS vo
  UNION ALL
  SELECT le.fact_id, le.field_key, le.value, 'evidence'::text,
    le.evidence_id, le.source_id, le.review_id, le.evidence_version,
    le.content_hash, le.observed_at, le.captured_at, le.fresh_until,
    NULL::uuid, le.approved_at
  FROM latest_evidence AS le
  WHERE le.fact_status = 'published'
    AND le.source_active
    AND le.source_vendor_profile_id = (SELECT vendor_profile_id FROM product_scope)
    AND le.source_captured_at <= $3
    AND le.review_decision = 'approved'
    AND le.approved_at <= $3
    AND le.captured_at <= $3
    AND le.fresh_until > $3
    AND NOT EXISTS (
      SELECT 1 FROM valid_overrides AS vo WHERE vo.fact_id = le.fact_id
    )
  ORDER BY fact_id;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION mmhr_private.r3_approved_vendor_inputs(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint

COMMENT ON FUNCTION mmhr_private.r3_approved_vendor_inputs(uuid, uuid, timestamptz)
  IS 'R3 private source-backed approved vendor inputs for immutable masked option publication.';
