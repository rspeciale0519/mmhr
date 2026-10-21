-- Add reviewed scope checks to format2. Format1 and stored publications remain unchanged.
CREATE OR REPLACE FUNCTION mmhr_private.r3_fact_scope_result(scope jsonb, requirements jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE rule jsonb; allowed jsonb; answer jsonb; unknown_found boolean := false;
  mismatch_found boolean := false;
BEGIN
  IF scope IS NULL OR scope = 'null'::jsonb THEN RETURN 'unknown'; END IF;
  IF jsonb_typeof(scope) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid fact scope' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(scope)) <> 2
    OR scope->'version' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(scope->'conditions') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid fact scope' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(scope->'conditions') > 50 THEN
    RAISE EXCEPTION 'Invalid fact scope' USING ERRCODE='22023';
  END IF;
  FOR rule IN SELECT value FROM jsonb_array_elements(scope->'conditions') LOOP
    IF jsonb_typeof(rule) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid fact scope condition' USING ERRCODE='22023';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(rule)) <> 4
      OR NOT (rule ?& ARRAY['kind','requirementKey','responsePath','allowedValues'])
      OR jsonb_typeof(rule->'kind') IS DISTINCT FROM 'string'
      OR (rule->>'kind') NOT IN ('plan','module','country','state','worker','delivery','restriction')
      OR jsonb_typeof(rule->'requirementKey') IS DISTINCT FROM 'string'
      OR (rule->>'requirementKey') !~ '^[a-z][a-z0-9_]{0,99}$'
      OR (rule->>'requirementKey') ~ '^(commission|payout|referral|payment_status|commercial|sponsorship|advertising|paid_placement|partner_status)'
      OR jsonb_typeof(rule->'responsePath') IS DISTINCT FROM 'array'
      OR jsonb_typeof(rule->'allowedValues') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid fact scope condition' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(rule->'responsePath') > 5
      OR jsonb_array_length(rule->'allowedValues') NOT BETWEEN 1 AND 50
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(rule->'responsePath') p
        WHERE jsonb_typeof(p) <> 'string' OR length(p #>> '{}') NOT BETWEEN 1 AND 100) THEN
      RAISE EXCEPTION 'Invalid fact scope condition' USING ERRCODE='22023';
    END IF;
    FOR allowed IN SELECT value FROM jsonb_array_elements(rule->'allowedValues') LOOP
      IF jsonb_typeof(allowed) NOT IN ('string','number','boolean')
        OR (jsonb_typeof(allowed) = 'string' AND length(allowed #>> '{}') NOT BETWEEN 1 AND 2000)
        OR (jsonb_typeof(allowed) = 'number' AND NOT mmhr_private.r3_publication_number_is_js_representable(allowed)) THEN
        RAISE EXCEPTION 'Invalid fact scope value' USING ERRCODE='22023';
      END IF;
    END LOOP;
    SELECT mmhr_private.r3_publication_response_at_path(r->'response',rule->'responsePath') INTO answer
      FROM jsonb_array_elements(requirements) r WHERE r->>'key'=rule->>'requirementKey';
    IF answer IS NULL OR jsonb_typeof(answer) NOT IN ('string','number','boolean')
      OR (jsonb_typeof(answer) = 'string' AND btrim(answer #>> '{}',
        chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)
        ||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)
        ||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)
        ||chr(8287)||chr(12288)||chr(65279)) = '') THEN
      unknown_found := true;
    ELSIF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(rule->'allowedValues') v WHERE v=answer) THEN
      mismatch_found := true;
    END IF;
  END LOOP;
  RETURN CASE WHEN mismatch_found THEN 'mismatch' WHEN unknown_found THEN 'unknown' ELSE 'match' END;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mmhr_private.r3_publication_fact_scopes(inputs jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE scope_map jsonb; entry record;
BEGIN
  IF (SELECT count(*) FROM jsonb_array_elements(inputs) i WHERE i->>'field_key'='comparison_fact_scopes') > 1 THEN
    RAISE EXCEPTION 'Duplicate approved fact scopes' USING ERRCODE='22023';
  END IF;
  BEGIN
    SELECT (i->>'value')::jsonb INTO scope_map FROM jsonb_array_elements(inputs) i
      WHERE i->>'field_key'='comparison_fact_scopes';
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid approved fact scopes' USING ERRCODE='22023';
  END;
  IF scope_map IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF jsonb_typeof(scope_map) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid approved fact scopes' USING ERRCODE='22023';
  END IF;
  FOR entry IN SELECT * FROM jsonb_each(scope_map) LOOP
    IF entry.key !~ '^[a-z][a-z0-9_]{0,99}$' OR entry.value='null'::jsonb THEN
      RAISE EXCEPTION 'Invalid approved fact scopes' USING ERRCODE='22023';
    END IF;
    PERFORM mmhr_private.r3_fact_scope_result(entry.value,'[]'::jsonb);
  END LOOP;
  RETURN scope_map;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r3_fact_scope_result(jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
REVOKE ALL ON FUNCTION mmhr_private.r3_publication_fact_scopes(jsonb) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
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
  scopes jsonb := '{}'::jsonb;
  scope_result text;
  known_keys text[] := ARRAY[]::text[];
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
  IF normalized_configuration->'version' = '2'::jsonb THEN
    scopes := mmhr_private.r3_publication_fact_scopes(validated_inputs);
  END IF;
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
  ) OR (normalized_configuration->'version'='2'::jsonb AND input_row->>'field_key'='comparison_fact_scopes');

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
    scope_result := CASE WHEN normalized_configuration->'version'='1'::jsonb THEN 'match'
      ELSE mmhr_private.r3_fact_scope_result(scopes->(criterion->>'factKey'),requirements) END;
    IF matching_count > 0 AND scope_result <> 'unknown' THEN
      known_keys := array_append(known_keys, requirement_key);
      covered_weight := covered_weight + (requirement->>'weight')::integer;
    END IF;
    IF scope_result = 'match' AND EXISTS (
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
  IF normalized_configuration->'version'='2'::jsonb THEN
    relevant_count := cardinality(known_keys);
  END IF;
  RETURN jsonb_build_object(
    'eligibility', CASE WHEN relevant_count = 0 THEN 'unknown'
    WHEN normalized_configuration->'version' = '2'::jsonb THEN CASE
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(requirements) item
        WHERE item->>'importance' = 'must' AND NOT fit_reasons ? lower(btrim(item->>'key'))
          AND lower(btrim(item->>'key')) = ANY(known_keys)
      ) THEN 'ineligible'
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(requirements) item
        WHERE item->>'importance' = 'must' AND NOT fit_reasons ? lower(btrim(item->>'key'))
      ) THEN 'unknown' ELSE 'eligible' END
    WHEN EXISTS (
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


CREATE OR REPLACE FUNCTION mmhr_private.r3_masked_publication_details(configuration jsonb, requirements jsonb, inputs jsonb, option_row jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE criterion jsonb; input_row jsonb; features jsonb := '[]'::jsonb;
  scopes jsonb := '{}'::jsonb; scope_result text;
  annual_input jsonb; setup_input jsonb; matched boolean; coverage_input jsonb; coverage_map jsonb := '{}'::jsonb;
BEGIN
  PERFORM mmhr_private.r3_validate_publication_inputs(inputs);
  IF configuration->'version'='2'::jsonb THEN
    scopes := mmhr_private.r3_publication_fact_scopes(inputs);
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(inputs) i WHERE i->>'field_key'='comparison_annual_cost') > 1
    OR (SELECT count(*) FROM jsonb_array_elements(inputs) i WHERE i->>'field_key'='comparison_setup') > 1
    OR (SELECT count(*) FROM jsonb_array_elements(inputs) i WHERE i->>'field_key'='comparison_feature_coverage') > 1 THEN
    RAISE EXCEPTION 'Approved comparison estimates conflict' USING ERRCODE = '22023';
  END IF;
  SELECT i INTO annual_input FROM jsonb_array_elements(inputs) i WHERE i->>'field_key'='comparison_annual_cost';
  SELECT i INTO setup_input FROM jsonb_array_elements(inputs) i WHERE i->>'field_key'='comparison_setup';
  SELECT i INTO coverage_input FROM jsonb_array_elements(inputs) i WHERE i->>'field_key'='comparison_feature_coverage';
  IF coverage_input IS NOT NULL THEN
    BEGIN
      coverage_map := (coverage_input->>'value')::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Approved feature coverage is invalid' USING ERRCODE = '22023';
    END;
    IF jsonb_typeof(coverage_map) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Approved feature coverage is invalid' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(coverage_map) entry
      WHERE entry.key !~ '^[a-z][a-z0-9_]{0,99}$' OR entry.key ~ '^(commission|payout|referral|payment_status)'
        OR jsonb_typeof(entry.value) IS DISTINCT FROM 'string'
        OR (entry.value #>> '{}') NOT IN ('native','add_on','partner','limited','not_supported','unknown')) THEN
      RAISE EXCEPTION 'Approved feature coverage values are invalid' USING ERRCODE = '22023';
    END IF;
  END IF;
  FOR criterion IN SELECT c FROM jsonb_array_elements(configuration->'criteria') c ORDER BY (c->>'requirementKey') COLLATE "C"
  LOOP
    matched := (option_row->'fitReasons') ? (criterion->>'requirementKey');
    scope_result := CASE WHEN configuration->'version'='1'::jsonb THEN 'match'
      ELSE mmhr_private.r3_fact_scope_result(scopes->(criterion->>'factKey'),requirements) END;
    -- Legacy scalar facts establish outcomes, but do not establish package delivery type.
    SELECT i INTO input_row FROM jsonb_array_elements(inputs) i
      WHERE i->>'field_key'=criterion->>'factKey'
        AND (NOT matched OR mmhr_private.r3_publication_scalar_matches(i->>'value',
          mmhr_private.r3_publication_response_at_path((SELECT r->'response' FROM jsonb_array_elements(requirements) r
            WHERE r->>'key'=criterion->>'requirementKey'), criterion->'responsePath')))
      ORDER BY (i->>'captured_at')::timestamptz, i->>'fact_id' LIMIT 1;
    IF matched AND (input_row IS NULL OR scope_result <> 'match') THEN
      RAISE EXCEPTION 'Published feature evidence is inconsistent' USING ERRCODE = '22023';
    END IF;
    features := features || jsonb_build_array(jsonb_build_object(
      'requirementKey', criterion->>'requirementKey',
      'outcome', CASE WHEN matched THEN 'match' WHEN input_row IS NOT NULL AND scope_result <> 'unknown' THEN 'mismatch' ELSE 'unknown' END,
      'coverage', coalesce(coverage_map->> (criterion->>'factKey'), 'unknown'),
      'evidence', mmhr_private.r3_masked_detail_evidence(input_row),
      'coverageEvidence', CASE WHEN coverage_map ? (criterion->>'factKey')
        THEN mmhr_private.r3_masked_detail_evidence(coverage_input) ELSE NULL END));
  END LOOP;
  RETURN jsonb_build_object('version',1,'features',features,
    'annualCost',mmhr_private.r3_masked_estimate(annual_input,'annual_cost'),
    'setup',mmhr_private.r3_masked_estimate(setup_input,'setup'));
END $$;
--> statement-breakpoint
