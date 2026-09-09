-- R3 private, immutable publication input capture and evaluation helpers.
-- These functions only read approved data. Public commands own authorization,
-- persistence, audit records, and the publication digest.

CREATE OR REPLACE FUNCTION mmhr_private.r3_publication_response_at_path(
  response jsonb,
  response_path jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
SET timezone = 'UTC'
AS $$
DECLARE
  current_value jsonb := response;
  segment text;
BEGIN
  IF jsonb_typeof(response_path) IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;
  FOR segment IN SELECT value FROM jsonb_array_elements_text(response_path)
  LOOP
    IF jsonb_typeof(current_value) <> 'object' OR NOT current_value ? segment THEN
      RETURN NULL;
    END IF;
    current_value := current_value -> segment;
  END LOOP;
  RETURN current_value;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r3_publication_scalar_matches(
  input_value text,
  response_value jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
SET timezone = 'UTC'
AS $$
BEGIN
  IF response_value IS NULL THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(response_value) = 'number' THEN
    RETURN btrim(input_value) = trim_scale((response_value #>> '{}')::numeric)::text;
  END IF;
  -- Keep format 1 independent from operating-system locale and ICU versions.
  RETURN translate(btrim(input_value), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')
    = translate(btrim(response_value #>> '{}'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz');
END;
$$;
--> statement-breakpoint

-- JSON numbers arrive in the TypeScript oracle as IEEE-754 doubles. Reject
-- legacy numeric responses that would change when PostgreSQL numeric is
-- converted to that representation and back. Decimal values remain allowed.
CREATE OR REPLACE FUNCTION mmhr_private.r3_publication_number_is_js_representable(
  response_value jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
SET timezone = 'UTC'
SET extra_float_digits = 3
AS $$
DECLARE exact_value numeric; round_trip numeric;
BEGIN
  IF jsonb_typeof(response_value) IS DISTINCT FROM 'number' THEN
    RETURN true;
  END IF;
  BEGIN
    exact_value := (response_value #>> '{}')::numeric;
    -- Use the shortest round-trip float text, not the precision-losing numeric cast.
    round_trip := ((exact_value::double precision)::text)::numeric;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range OR floating_point_exception THEN
      RETURN false;
  END;
  RETURN exact_value = round_trip;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r3_validate_publication_configuration(
  configuration jsonb,
  requirements jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
SET timezone = 'UTC'
AS $$
DECLARE
  criterion jsonb;
  requirement jsonb;
  response_value jsonb;
  normalized_criteria jsonb := '[]'::jsonb;
  normalized_key text;
  fact_key text;
  path jsonb;
  required_count integer;
  criteria_count integer;
  seen_keys text[] := ARRAY[]::text[];
BEGIN
  IF jsonb_typeof(configuration) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(CASE WHEN jsonb_typeof(configuration) = 'object' THEN configuration ELSE '{}'::jsonb END)) <> 2
    OR NOT (configuration ?& ARRAY['version', 'criteria'])
    OR configuration->'version' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(configuration->'criteria') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'Publication configuration is invalid' USING ERRCODE = '22023';
  END IF;
  criteria_count := jsonb_array_length(configuration->'criteria');
  IF criteria_count < 1 OR criteria_count > 2000 THEN
    RAISE EXCEPTION 'Publication criteria count is invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(requirements) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Publication requirements are invalid' USING ERRCODE = '22023';
  END IF;
  required_count := jsonb_array_length(requirements);
  IF required_count < 1 OR required_count > 2000 THEN
    RAISE EXCEPTION 'Publication requirements count is invalid' USING ERRCODE = '22023';
  END IF;

  FOR criterion IN SELECT value FROM jsonb_array_elements(configuration->'criteria')
  LOOP
    IF jsonb_typeof(criterion) IS DISTINCT FROM 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(CASE WHEN jsonb_typeof(criterion) = 'object' THEN criterion ELSE '{}'::jsonb END)) <> 3
      OR NOT (criterion ?& ARRAY['requirementKey', 'factKey', 'responsePath'])
      OR jsonb_typeof(criterion->'requirementKey') IS DISTINCT FROM 'string'
      OR jsonb_typeof(criterion->'factKey') IS DISTINCT FROM 'string'
      OR jsonb_typeof(criterion->'responsePath') IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION 'Publication criterion is invalid' USING ERRCODE = '22023';
    END IF;
    normalized_key := lower(btrim(criterion->>'requirementKey'));
    fact_key := lower(btrim(criterion->>'factKey'));
    path := criterion->'responsePath';
    IF normalized_key !~ '^[a-z][a-z0-9_]{0,99}$'
      OR fact_key !~ '^[a-z][a-z0-9_]{0,99}$'
      OR fact_key ~ '^(commission|payout|referral|payment_status)'
      OR jsonb_array_length(path) > 5
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(path) AS part
        WHERE jsonb_typeof(part) IS DISTINCT FROM 'string' OR length(part #>> '{}') < 1 OR length(part #>> '{}') > 100
      )
      OR normalized_key = ANY(seen_keys)
    THEN
      RAISE EXCEPTION 'Publication criterion values are invalid' USING ERRCODE = '22023';
    END IF;
    seen_keys := array_append(seen_keys, normalized_key);
    normalized_criteria := normalized_criteria || jsonb_build_array(jsonb_build_object(
      'requirementKey', normalized_key,
      'factKey', fact_key,
      'responsePath', path
    ));
  END LOOP;

  IF criteria_count <> required_count
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(requirements) AS item
      WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
        OR (SELECT count(*) FROM jsonb_object_keys(CASE WHEN jsonb_typeof(item) = 'object' THEN item ELSE '{}'::jsonb END)) <> 7
        OR NOT (item ?& ARRAY['requirementId', 'revision', 'key', 'label', 'importance', 'weight', 'response'])
        OR jsonb_typeof(item->'requirementId') IS DISTINCT FROM 'string'
        OR (item->>'requirementId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR jsonb_typeof(item->'revision') IS DISTINCT FROM 'number'
        OR (item->>'revision') !~ '^[1-9][0-9]*$'
        OR jsonb_typeof(item->'key') IS DISTINCT FROM 'string'
        OR lower(btrim(item->>'key')) !~ '^[a-z][a-z0-9_]{0,99}$'
        OR jsonb_typeof(item->'label') IS DISTINCT FROM 'string'
        OR length(btrim(item->>'label')) NOT BETWEEN 1 AND 200
        OR jsonb_typeof(item->'importance') IS DISTINCT FROM 'string'
        OR coalesce(item->>'importance', '') NOT IN ('must', 'nice')
        OR jsonb_typeof(item->'weight') IS DISTINCT FROM 'number'
        OR (item->>'weight') !~ '^[1-9][0-9]?$|^100$'
        OR octet_length((item->'response')::text) > 8000
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(requirements) AS item
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(normalized_criteria) AS c
        WHERE c->>'requirementKey' = lower(btrim(item->>'key'))
      )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(normalized_criteria) AS c
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(requirements) AS item
        WHERE lower(btrim(item->>'key')) = c->>'requirementKey'
      )
    )
  THEN
    RAISE EXCEPTION 'Publication configuration criteria must exactly match requirements' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(DISTINCT lower(btrim(item->>'key'))) FROM jsonb_array_elements(requirements) AS item) <> required_count
  THEN
    RAISE EXCEPTION 'Publication requirement keys must be unique' USING ERRCODE = '22023';
  END IF;

  FOR requirement IN SELECT value FROM jsonb_array_elements(requirements)
  LOOP
    SELECT c->'responsePath' INTO path
    FROM jsonb_array_elements(normalized_criteria) AS c
    WHERE c->>'requirementKey' = lower(btrim(requirement->>'key'));
    response_value := mmhr_private.r3_publication_response_at_path(requirement->'response', path);
    IF response_value IS NULL OR jsonb_typeof(response_value) NOT IN ('string', 'boolean', 'number')
    THEN
      RAISE EXCEPTION 'Publication response path must resolve to a scalar' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(response_value) = 'number'
      AND NOT mmhr_private.r3_publication_number_is_js_representable(response_value)
    THEN
      RAISE EXCEPTION 'Publication numeric response is not safely representable' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN jsonb_build_object('version', 1, 'criteria', normalized_criteria);
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r3_validate_publication_inputs(inputs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
SET timezone = 'UTC'
AS $$
DECLARE
  input_row jsonb;
BEGIN
  IF jsonb_typeof(inputs) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Approved publication inputs are invalid' USING ERRCODE = '22023';
  END IF;
  FOR input_row IN SELECT value FROM jsonb_array_elements(inputs)
  LOOP
    IF jsonb_typeof(input_row) IS DISTINCT FROM 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(CASE WHEN jsonb_typeof(input_row) = 'object' THEN input_row ELSE '{}'::jsonb END)) <> 14
      OR NOT (input_row ?& ARRAY['fact_id', 'field_key', 'value', 'provenance', 'evidence_id', 'source_id', 'review_id', 'evidence_version', 'content_hash', 'observed_at', 'captured_at', 'valid_until', 'override_id', 'approved_at'])
    THEN
      RAISE EXCEPTION 'Approved publication input row is invalid' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(input_row->'fact_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(input_row->'field_key') IS DISTINCT FROM 'string'
      OR jsonb_typeof(input_row->'value') IS DISTINCT FROM 'string'
      OR jsonb_typeof(input_row->'provenance') IS DISTINCT FROM 'string'
      OR jsonb_typeof(input_row->'observed_at') IS DISTINCT FROM 'string'
      OR jsonb_typeof(input_row->'captured_at') IS DISTINCT FROM 'string'
      OR jsonb_typeof(input_row->'valid_until') IS DISTINCT FROM 'string'
      OR jsonb_typeof(input_row->'approved_at') IS DISTINCT FROM 'string'
      OR (input_row->>'observed_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
      OR (input_row->>'captured_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
      OR (input_row->>'valid_until') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
      OR (input_row->>'approved_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
      OR (input_row->>'field_key') !~ '^[a-z][a-z0-9_]{0,99}$'
      OR length(input_row->>'value') NOT BETWEEN 1 AND 2000
      OR input_row->>'provenance' NOT IN ('evidence', 'override')
      OR (input_row->>'fact_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR (input_row->>'evidence_id' IS NOT NULL AND (jsonb_typeof(input_row->'evidence_id') IS DISTINCT FROM 'null' AND (jsonb_typeof(input_row->'evidence_id') IS DISTINCT FROM 'string' OR (input_row->>'evidence_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')))
      OR (input_row->>'source_id' IS NOT NULL AND (jsonb_typeof(input_row->'source_id') IS DISTINCT FROM 'null' AND (jsonb_typeof(input_row->'source_id') IS DISTINCT FROM 'string' OR (input_row->>'source_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')))
      OR (input_row->>'review_id' IS NOT NULL AND (jsonb_typeof(input_row->'review_id') IS DISTINCT FROM 'null' AND (jsonb_typeof(input_row->'review_id') IS DISTINCT FROM 'string' OR (input_row->>'review_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')))
      OR (input_row->>'override_id' IS NOT NULL AND (jsonb_typeof(input_row->'override_id') IS DISTINCT FROM 'null' AND (jsonb_typeof(input_row->'override_id') IS DISTINCT FROM 'string' OR (input_row->>'override_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')))
      OR (input_row->>'evidence_version' IS NOT NULL AND (input_row->>'evidence_version') !~ '^[1-9][0-9]*$')
      OR (input_row->>'content_hash' IS NOT NULL AND (input_row->>'content_hash') !~ '^[a-f0-9]{64}$')
      OR (jsonb_typeof(input_row->'evidence_version') IS DISTINCT FROM 'null' AND jsonb_typeof(input_row->'evidence_version') IS DISTINCT FROM 'number')
      OR (jsonb_typeof(input_row->'content_hash') IS DISTINCT FROM 'null' AND jsonb_typeof(input_row->'content_hash') IS DISTINCT FROM 'string')
    THEN
      RAISE EXCEPTION 'Approved publication input row values are invalid' USING ERRCODE = '22023';
    END IF;
    PERFORM (input_row->>'observed_at')::timestamptz;
    PERFORM (input_row->>'captured_at')::timestamptz;
    PERFORM (input_row->>'valid_until')::timestamptz;
    PERFORM (input_row->>'approved_at')::timestamptz;
  END LOOP;
  RETURN inputs;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r3_collect_publication_inputs(
  organization uuid,
  intake uuid,
  configuration jsonb,
  as_of timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
SET timezone = 'UTC'
AS $$
DECLARE
  intake_row record;
  requirements jsonb;
  snapshot jsonb;
  normalized_configuration jsonb;
  active_answered_count integer;
BEGIN
  IF organization IS NULL OR intake IS NULL OR as_of IS NULL THEN
    RAISE EXCEPTION 'Publication input scope is required' USING ERRCODE = '22023';
  END IF;
  SELECT i.id, i.revision, i.status, i.submitted_at,
    i.company_context, i.current_systems, i.compliance_needs, i.budget,
    i.timeline, i.stakeholders, i.decision_process
  INTO intake_row
  FROM public.intakes AS i
  WHERE i.organization_id = $1 AND i.id = $2;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publication intake was not found' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO active_answered_count
  FROM public.intake_requirements AS r
  WHERE r.organization_id = $1
    AND r.intake_id = $2
    AND r.status = 'active'
    AND r.importance IN ('must', 'nice')
    AND r.response IS NOT NULL;
  IF active_answered_count < 1 OR active_answered_count > 2000 THEN
    RAISE EXCEPTION 'Publication requires answered active requirements' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
      'requirementId', r.id,
      'revision', r.revision,
      'key', lower(btrim(r.stable_key)),
      'label', btrim(r.label),
      'importance', r.importance,
      'weight', r.weight,
      'response', r.response
    ) ORDER BY r.stable_key COLLATE "C")
  INTO requirements
  FROM public.intake_requirements AS r
  WHERE r.organization_id = $1
    AND r.intake_id = $2
    AND r.status = 'active'
    AND r.importance IN ('must', 'nice')
    AND r.response IS NOT NULL;
  normalized_configuration := mmhr_private.r3_validate_publication_configuration(configuration, requirements);

  WITH product_inputs AS (
    SELECT p.id AS product_id,
      p.organization_id AS vendor_organization_id,
      p.revision AS product_revision,
      vp.revision AS profile_revision,
      inputs.rows
    FROM public.products AS p
    JOIN public.vendor_profiles AS vp
      ON vp.organization_id = p.organization_id
     AND vp.id = p.vendor_profile_id
    CROSS JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(input_row) ORDER BY input_row.fact_id, input_row.field_key COLLATE "C") AS rows
      FROM mmhr_private.r3_approved_vendor_inputs(p.organization_id, p.id, as_of) AS input_row
    ) AS inputs
    WHERE p.status = 'active'
      AND vp.status = 'active'
      AND vp.approved_at IS NOT NULL
      AND vp.approved_by_identity_id IS NOT NULL
      AND inputs.rows IS NOT NULL
      AND jsonb_array_length(inputs.rows) > 0
  ),
  product_snapshot AS (
    SELECT jsonb_agg(jsonb_build_object(
      'productId', product_id,
      'vendorOrganizationId', vendor_organization_id,
      'productRevision', product_revision,
      'profileRevision', profile_revision,
      'inputs', rows
    ) ORDER BY product_id) AS rows
    FROM product_inputs
  )
  SELECT jsonb_build_object(
    'intake', jsonb_build_object(
      'id', intake_row.id,
      'revision', intake_row.revision,
      'status', intake_row.status,
      'submittedAt', intake_row.submitted_at,
      'companyContext', intake_row.company_context,
      'currentSystems', intake_row.current_systems,
      'complianceNeeds', intake_row.compliance_needs,
      'budget', intake_row.budget,
      'timeline', intake_row.timeline,
      'stakeholders', intake_row.stakeholders,
      'decisionProcess', intake_row.decision_process
    ),
    'requirements', requirements,
    'products', coalesce(product_snapshot.rows, '[]'::jsonb)
  )
  INTO snapshot
  FROM product_snapshot;
  IF octet_length(snapshot::text) > 20000000 THEN
    RAISE EXCEPTION 'Publication input snapshot exceeds 20 MB' USING ERRCODE = '22023';
  END IF;
  RETURN snapshot;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r3_evaluate_publication_option(
  configuration jsonb,
  requirements jsonb,
  inputs jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
SET timezone = 'UTC'
AS $$
DECLARE
  normalized_configuration jsonb;
  validated_inputs jsonb;
  requirement jsonb;
  criterion jsonb;
  response_value jsonb;
  requirement_key text;
  matching_count integer;
  relevant_count integer := 0;
  total_weight integer := 0;
  covered_weight integer := 0;
  satisfied_weight integer := 0;
  fit_reasons jsonb := '[]'::jsonb;
  limitations jsonb := '[]'::jsonb;
  oldest_captured timestamptz;
  oldest_valid timestamptz;
BEGIN
  normalized_configuration := mmhr_private.r3_validate_publication_configuration(configuration, requirements);
  validated_inputs := mmhr_private.r3_validate_publication_inputs(inputs);
  SELECT coalesce(sum((item->>'weight')::integer), 0)
  INTO total_weight
  FROM jsonb_array_elements(requirements) AS item;
  SELECT count(*) INTO relevant_count
  FROM jsonb_array_elements(validated_inputs) AS input_row
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(normalized_configuration->'criteria') AS c
    WHERE c->>'factKey' = input_row->>'field_key'
  );
  SELECT min((input_row->>'captured_at')::timestamptz), min((input_row->>'valid_until')::timestamptz)
  INTO oldest_captured, oldest_valid
  FROM jsonb_array_elements(validated_inputs) AS input_row
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(normalized_configuration->'criteria') AS c
    WHERE c->>'factKey' = input_row->>'field_key'
  );

  FOR requirement IN SELECT value FROM jsonb_array_elements(requirements) ORDER BY (value->>'key') COLLATE "C"
  LOOP
    requirement_key := lower(btrim(requirement->>'key'));
    SELECT c INTO criterion
    FROM jsonb_array_elements(normalized_configuration->'criteria') AS c
    WHERE c->>'requirementKey' = requirement_key;
    response_value := mmhr_private.r3_publication_response_at_path(requirement->'response', criterion->'responsePath');
    SELECT count(*) INTO matching_count
    FROM jsonb_array_elements(validated_inputs) AS input_row
    WHERE input_row->>'field_key' = criterion->>'factKey';
    IF matching_count > 0 THEN
      covered_weight := covered_weight + (requirement->>'weight')::integer;
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(validated_inputs) AS input_row
      WHERE input_row->>'field_key' = criterion->>'factKey'
        AND mmhr_private.r3_publication_scalar_matches(input_row->>'value', response_value)
    ) THEN
      satisfied_weight := satisfied_weight + (requirement->>'weight')::integer;
      fit_reasons := fit_reasons || jsonb_build_array(requirement_key);
    ELSE
      limitations := limitations || jsonb_build_array(requirement_key);
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'eligibility', CASE WHEN relevant_count = 0 THEN 'unknown' WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(requirements) AS item
      WHERE item->>'importance' = 'must'
        AND NOT fit_reasons ? (item->>'key')
    ) THEN 'ineligible' ELSE 'eligible' END,
    'deterministicScore', round((satisfied_weight::numeric / total_weight) * 10000)::integer,
    'confidenceBasisPoints', round((covered_weight::numeric / total_weight) * 10000)::integer,
    'fitReasons', fit_reasons,
    'limitations', limitations,
    'evidenceFreshAt', oldest_captured,
    'validUntil', oldest_valid
  );
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION mmhr_private.r3_publication_response_at_path(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
REVOKE ALL ON FUNCTION mmhr_private.r3_publication_number_is_js_representable(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
REVOKE ALL ON FUNCTION mmhr_private.r3_publication_scalar_matches(text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
REVOKE ALL ON FUNCTION mmhr_private.r3_validate_publication_configuration(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
REVOKE ALL ON FUNCTION mmhr_private.r3_validate_publication_inputs(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
REVOKE ALL ON FUNCTION mmhr_private.r3_collect_publication_inputs(uuid, uuid, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
REVOKE ALL ON FUNCTION mmhr_private.r3_evaluate_publication_option(jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

COMMENT ON FUNCTION mmhr_private.r3_collect_publication_inputs(uuid, uuid, jsonb, timestamptz)
  IS 'Private immutable publication input snapshot from a scoped intake and approved vendor inputs.';
COMMENT ON FUNCTION mmhr_private.r3_evaluate_publication_option(jsonb, jsonb, jsonb)
  IS 'Private deterministic publication option evaluation over an immutable snapshot.';
