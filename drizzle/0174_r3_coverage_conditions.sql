-- Backward-compatible format 3 scoring expansion. Legacy formats remain unchanged.
-- Apply before enabling format 3 in staff preparation controls.
CREATE OR REPLACE FUNCTION mmhr_private.r3_evaluate_publication_option_v3(
  configuration jsonb, requirements jsonb, inputs jsonb
)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  base_configuration jsonb; criterion jsonb; raw_criterion jsonb; requirement jsonb;
  normalized_criteria jsonb := '[]'::jsonb; checked_inputs jsonb; scopes jsonb;
  coverage jsonb := '{}'::jsonb; inclusions jsonb := '{}'::jsonb; limit_reviews jsonb := '{}'::jsonb;
  evidence_row jsonb; entry record; map_value jsonb; map_name text; map_count integer;
  scope_result text; delivery text; answer jsonb; response_value jsonb; acceptance jsonb;
  matching_count integer; total_weight integer := 0; covered_weight integer := 0; satisfied_weight integer := 0;
  known_keys text[] := ARRAY[]::text[]; fit_reasons jsonb := '[]'::jsonb; limitations jsonb := '[]'::jsonb;
  oldest_captured timestamptz; oldest_valid timestamptz;
BEGIN
  IF jsonb_typeof(configuration) IS DISTINCT FROM 'object'
    OR configuration->'version' IS DISTINCT FROM '3'::jsonb
    OR (SELECT count(*) FROM jsonb_object_keys(configuration)) <> 2
    OR NOT (configuration ?& ARRAY['version','criteria'])
    OR jsonb_typeof(configuration->'criteria') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid format 3 configuration' USING ERRCODE='22023';
  END IF;
  FOR criterion IN SELECT value FROM jsonb_array_elements(configuration->'criteria') LOOP
    IF jsonb_typeof(criterion) IS DISTINCT FROM 'object'
      OR NOT (criterion ?& ARRAY['requirementKey','factKey','responsePath'])
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(criterion) k
        WHERE k NOT IN ('requirementKey','factKey','responsePath','partnerAcceptance','capabilityMeaning'))
      OR (criterion ? 'capabilityMeaning' AND criterion->'capabilityMeaning' IS DISTINCT FROM '"presence"'::jsonb)
    THEN RAISE EXCEPTION 'Invalid format 3 criterion' USING ERRCODE='22023'; END IF;
    acceptance := criterion->'partnerAcceptance';
    IF acceptance IS NOT NULL AND (jsonb_typeof(acceptance) IS DISTINCT FROM 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(acceptance)) <> 2
      OR NOT (acceptance ?& ARRAY['requirementKey','responsePath'])
      OR jsonb_typeof(acceptance->'requirementKey') IS DISTINCT FROM 'string'
      OR lower(btrim(acceptance->>'requirementKey')) !~ '^[a-z][a-z0-9_]{0,99}$'
      OR lower(btrim(acceptance->>'requirementKey')) ~ '^(commission|payout|referral|payment_status|commercial|sponsorship|advertising|paid_placement|partner_status)'
      OR jsonb_typeof(acceptance->'responsePath') IS DISTINCT FROM 'array'
      OR jsonb_array_length(acceptance->'responsePath') > 5
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(acceptance->'responsePath') part
        WHERE jsonb_typeof(part) IS DISTINCT FROM 'string' OR length(part #>> '{}') NOT BETWEEN 1 AND 100))
    THEN RAISE EXCEPTION 'Invalid partner acceptance mapping' USING ERRCODE='22023'; END IF;
    normalized_criteria := normalized_criteria || jsonb_build_array(jsonb_build_object(
      'requirementKey',criterion->'requirementKey','factKey',criterion->'factKey','responsePath',criterion->'responsePath'));
  END LOOP;
  base_configuration := mmhr_private.r3_validate_publication_configuration(
    jsonb_build_object('version',2,'criteria',normalized_criteria), requirements);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(requirements) r
    WHERE r->>'key' !~ '^[a-z][a-z0-9_]{0,99}$') THEN
    RAISE EXCEPTION 'Format 3 requirement keys must be canonical' USING ERRCODE='22023';
  END IF;
  checked_inputs := mmhr_private.r3_validate_publication_inputs(inputs);
  scopes := mmhr_private.r3_publication_fact_scopes(checked_inputs);
  FOREACH map_name IN ARRAY ARRAY['comparison_feature_coverage','comparison_addon_inclusions','comparison_limitation_reviews'] LOOP
    SELECT count(*) INTO map_count FROM jsonb_array_elements(checked_inputs) i WHERE i->>'field_key'=map_name;
    IF map_count > 1 THEN RAISE EXCEPTION 'Duplicate delivery evidence' USING ERRCODE='22023'; END IF;
    SELECT i INTO evidence_row FROM jsonb_array_elements(checked_inputs) i WHERE i->>'field_key'=map_name;
    IF evidence_row IS NULL THEN CONTINUE; END IF;
    BEGIN map_value := (evidence_row->>'value')::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid delivery evidence' USING ERRCODE='22023'; END;
    IF jsonb_typeof(map_value) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid delivery evidence' USING ERRCODE='22023';
    END IF;
    FOR entry IN SELECT * FROM jsonb_each(map_value) LOOP
      IF entry.key !~ '^[a-z][a-z0-9_]{0,99}$'
        OR entry.key ~ '^(commission|payout|referral|payment_status|commercial|sponsorship|advertising|paid_placement|partner_status)'
        OR (map_name='comparison_feature_coverage' AND (jsonb_typeof(entry.value) IS DISTINCT FROM 'string'
          OR entry.value #>> '{}' NOT IN ('native','add_on','partner','limited','not_supported','unknown')))
        OR (map_name <> 'comparison_feature_coverage' AND jsonb_typeof(entry.value) IS DISTINCT FROM 'boolean')
      THEN RAISE EXCEPTION 'Invalid delivery evidence' USING ERRCODE='22023'; END IF;
    END LOOP;
    IF map_name='comparison_feature_coverage' THEN coverage := map_value;
    ELSIF map_name='comparison_addon_inclusions' THEN inclusions := map_value;
    ELSE limit_reviews := map_value; END IF;
  END LOOP;
  SELECT coalesce(sum((r->>'weight')::integer),0) INTO total_weight FROM jsonb_array_elements(requirements) r;
  SELECT min((i->>'captured_at')::timestamptz),min((i->>'valid_until')::timestamptz) INTO oldest_captured,oldest_valid
    FROM jsonb_array_elements(checked_inputs) i WHERE i->>'field_key'='comparison_fact_scopes'
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(base_configuration->'criteria') c WHERE c->>'factKey'=i->>'field_key')
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(base_configuration->'criteria') c
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(checked_inputs) source WHERE source->>'field_key'=c->>'factKey')
          AND ((i->>'field_key'='comparison_feature_coverage' AND coverage ? (c->>'factKey'))
            OR (i->>'field_key'='comparison_addon_inclusions' AND coverage->>(c->>'factKey')='add_on' AND inclusions ? (c->>'factKey'))
            OR (i->>'field_key'='comparison_limitation_reviews' AND coverage->>(c->>'factKey')='limited' AND limit_reviews ? (c->>'factKey'))));
  FOR requirement IN SELECT value FROM jsonb_array_elements(requirements) ORDER BY (value->>'key') COLLATE "C" LOOP
    SELECT c INTO criterion FROM jsonb_array_elements(base_configuration->'criteria') c WHERE c->>'requirementKey'=requirement->>'key';
    SELECT c INTO raw_criterion FROM jsonb_array_elements(configuration->'criteria') c
      WHERE lower(btrim(c->>'requirementKey'))=criterion->>'requirementKey';
    response_value := mmhr_private.r3_publication_response_at_path(requirement->'response',criterion->'responsePath');
    SELECT count(*) INTO matching_count FROM jsonb_array_elements(checked_inputs) i WHERE i->>'field_key'=criterion->>'factKey';
    scope_result := mmhr_private.r3_fact_scope_result(scopes->(criterion->>'factKey'),requirements);
    IF scope_result='match' THEN
      delivery := coverage->>(criterion->>'factKey');
      IF delivery='add_on' THEN
        IF inclusions->(criterion->>'factKey') IS DISTINCT FROM 'true'::jsonb THEN scope_result := 'unknown'; END IF;
      ELSIF delivery='partner' THEN
        acceptance := raw_criterion->'partnerAcceptance';
        SELECT mmhr_private.r3_publication_response_at_path(r->'response',acceptance->'responsePath') INTO answer
          FROM jsonb_array_elements(requirements) r WHERE r->>'key'=lower(btrim(acceptance->>'requirementKey'));
        scope_result := CASE WHEN answer='true'::jsonb THEN 'match' WHEN answer='false'::jsonb THEN 'mismatch' ELSE 'unknown' END;
      ELSIF delivery='limited' THEN
        IF limit_reviews->(criterion->>'factKey') IS DISTINCT FROM 'true'::jsonb OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(scopes->(criterion->>'factKey')->'conditions') item WHERE item->>'kind'='restriction'
        ) THEN scope_result := 'unknown'; END IF;
      ELSIF delivery='not_supported' THEN
        IF raw_criterion->'capabilityMeaning' IS DISTINCT FROM '"presence"'::jsonb
          OR jsonb_typeof(response_value) IS DISTINCT FROM 'boolean' OR matching_count=0
          OR EXISTS (SELECT 1 FROM jsonb_array_elements(checked_inputs) i WHERE i->>'field_key'=criterion->>'factKey'
            AND NOT mmhr_private.r3_publication_scalar_matches(i->>'value','false'::jsonb))
        THEN scope_result := 'unknown'; END IF;
      ELSIF delivery IS DISTINCT FROM 'native' THEN scope_result := 'unknown'; END IF;
    END IF;
    IF matching_count>0 AND scope_result<>'unknown' THEN
      known_keys := array_append(known_keys,requirement->>'key'); covered_weight := covered_weight+(requirement->>'weight')::integer;
    END IF;
    IF scope_result='match' AND EXISTS (SELECT 1 FROM jsonb_array_elements(checked_inputs) i
      WHERE i->>'field_key'=criterion->>'factKey' AND mmhr_private.r3_publication_scalar_matches(i->>'value',response_value)) THEN
      satisfied_weight := satisfied_weight+(requirement->>'weight')::integer; fit_reasons := fit_reasons||jsonb_build_array(requirement->>'key');
    ELSE limitations := limitations||jsonb_build_array(requirement->>'key'); END IF;
  END LOOP;
  RETURN jsonb_build_object('eligibility',CASE WHEN cardinality(known_keys)=0 THEN 'unknown'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(requirements) r WHERE r->>'importance'='must'
      AND NOT fit_reasons ? (r->>'key') AND r->>'key'=ANY(known_keys)) THEN 'ineligible'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(requirements) r WHERE r->>'importance'='must'
      AND NOT fit_reasons ? (r->>'key')) THEN 'unknown' ELSE 'eligible' END,
    'deterministicScore',round((satisfied_weight::numeric/total_weight)*10000)::integer,
    'confidenceBasisPoints',round((covered_weight::numeric/total_weight)*10000)::integer,
    'fitReasons',fit_reasons,'limitations',limitations,'knownKeys',to_jsonb(known_keys),'evidenceFreshAt',oldest_captured,'validUntil',oldest_valid);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r3_evaluate_publication_option_v3(jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mmhr_private.r3_validate_publication_configuration_v3(configuration jsonb, requirements jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE normalized jsonb;
BEGIN
  -- The draft evaluator validates the complete format and the saved answers.
  PERFORM mmhr_private.r3_evaluate_publication_option_v3(configuration,requirements,'[]'::jsonb);
  SELECT jsonb_agg(
    jsonb_build_object('requirementKey',lower(btrim(c.value->>'requirementKey')),
      'factKey',lower(btrim(c.value->>'factKey')),'responsePath',c.value->'responsePath')
    || CASE WHEN c.value ? 'capabilityMeaning' THEN jsonb_build_object('capabilityMeaning',c.value->'capabilityMeaning') ELSE '{}'::jsonb END
    || CASE WHEN c.value ? 'partnerAcceptance' THEN jsonb_build_object('partnerAcceptance',jsonb_build_object(
      'requirementKey',lower(btrim(c.value->'partnerAcceptance'->>'requirementKey')),
      'responsePath',c.value->'partnerAcceptance'->'responsePath')) ELSE '{}'::jsonb END
    ORDER BY c.ordinality) INTO normalized
  FROM jsonb_array_elements(configuration->'criteria') WITH ORDINALITY AS c(value,ordinality);
  RETURN jsonb_build_object('version',3,'criteria',normalized);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r3_validate_publication_configuration_v3(jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

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
  IF configuration->'version' = '3'::jsonb THEN
    RETURN mmhr_private.r3_validate_publication_configuration_v3(configuration, requirements);
  END IF;
  IF jsonb_typeof(configuration) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(CASE WHEN jsonb_typeof(configuration) = 'object' THEN configuration ELSE '{}'::jsonb END)) <> 2
    OR NOT (configuration ?& ARRAY['version', 'criteria'])
    OR (configuration->'version' IS DISTINCT FROM '1'::jsonb AND configuration->'version' IS DISTINCT FROM '2'::jsonb)
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
      OR (configuration->'version' = '2'::jsonb AND fact_key ~ '^(commercial|sponsorship|advertising|paid_placement|partner_status)')
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
  RETURN jsonb_build_object('version', configuration->'version', 'criteria', normalized_criteria);
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
  IF configuration->'version' = '3'::jsonb THEN
    RETURN mmhr_private.r3_evaluate_publication_option_v3(configuration, requirements, inputs) - 'knownKeys';
  END IF;
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
CREATE OR REPLACE FUNCTION mmhr_private.r3_masked_publication_details_v3(
  configuration jsonb, requirements jsonb, inputs jsonb, option_row jsonb
)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE evaluated jsonb; normalized_configuration jsonb; base_configuration jsonb; base_criteria jsonb; details jsonb; features jsonb;
BEGIN
  evaluated := mmhr_private.r3_evaluate_publication_option_v3(configuration,requirements,inputs);
  IF option_row->'fitReasons' IS DISTINCT FROM evaluated->'fitReasons'
    OR option_row->'limitations' IS DISTINCT FROM evaluated->'limitations'
    OR option_row->'eligibility' IS DISTINCT FROM evaluated->'eligibility'
    OR option_row->'deterministicScore' IS DISTINCT FROM evaluated->'deterministicScore'
    OR option_row->'confidenceBasisPoints' IS DISTINCT FROM evaluated->'confidenceBasisPoints'
  THEN RAISE EXCEPTION 'Published option is inconsistent' USING ERRCODE='22023'; END IF;
  normalized_configuration := mmhr_private.r3_validate_publication_configuration_v3(configuration,requirements);
  SELECT jsonb_agg(jsonb_build_object('requirementKey',c.value->'requirementKey',
    'factKey',c.value->'factKey','responsePath',c.value->'responsePath') ORDER BY c.ordinality)
    INTO base_criteria FROM jsonb_array_elements(normalized_configuration->'criteria') WITH ORDINALITY c(value,ordinality);
  base_configuration := jsonb_build_object('version',2,'criteria',base_criteria);
  details := mmhr_private.r3_masked_publication_details(base_configuration,requirements,inputs,option_row);
  SELECT coalesce(jsonb_agg(feature.value || jsonb_build_object('outcome',
    CASE WHEN evaluated->'fitReasons' ? (feature.value->>'requirementKey') THEN 'match'
      WHEN evaluated->'knownKeys' ? (feature.value->>'requirementKey') THEN 'mismatch'
      ELSE 'unknown' END) ORDER BY feature.ordinality),'[]'::jsonb) INTO features
  FROM jsonb_array_elements(details->'features') WITH ORDINALITY feature(value,ordinality);
  RETURN jsonb_set(details,'{features}',features);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r3_masked_publication_details_v3(jsonb,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION mmhr_private.r3_masked_publication_details(configuration jsonb, requirements jsonb, inputs jsonb, option_row jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE criterion jsonb; input_row jsonb; features jsonb := '[]'::jsonb;
  scopes jsonb := '{}'::jsonb; scope_result text;
  annual_input jsonb; setup_input jsonb; matched boolean; coverage_input jsonb; coverage_map jsonb := '{}'::jsonb;
BEGIN
  IF configuration->'version' = '3'::jsonb THEN
    RETURN mmhr_private.r3_masked_publication_details_v3(configuration, requirements, inputs, option_row);
  END IF;
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
CREATE OR REPLACE FUNCTION public.mmhr_prepare_evaluation_publication(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; intake public.intakes%ROWTYPE; receipt jsonb;
  publication_id uuid := gen_random_uuid(); configuration jsonb; snapshot jsonb;
  product jsonb; evaluation jsonb; evaluated jsonb := '[]'::jsonb;
  v_organization_id uuid; v_intake_id uuid; expected_revision integer;
  option_count integer; sequence_number integer; input_digest text; state text; ordinal integer := 0;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR NOT (payload ?& ARRAY['organizationId','intakeId','expectedRevision','configuration'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS k(key) WHERE k.key NOT IN ('organizationId','intakeId','expectedRevision','configuration'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR jsonb_typeof(payload->'expectedRevision') <> 'number'
    OR coalesce(payload->>'expectedRevision','') !~ '^[1-9][0-9]{0,9}$'
    OR jsonb_typeof(payload->'configuration') <> 'object'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication preparation input'; END IF;
  v_organization_id := (payload->>'organizationId')::uuid; v_intake_id := (payload->>'intakeId')::uuid;
  IF (payload->>'expectedRevision')::numeric NOT BETWEEN 1 AND 2147483647 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication preparation input'; END IF;
  expected_revision := (payload->>'expectedRevision')::integer; configuration := payload->'configuration';
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('evaluation.publish',v_organization_id,'Prepare masked evaluation publication',correlation_id,idempotency_key);
  IF mmhr_private.r1_security_actor('admin.access',NULL::uuid,context.authorization_time) IS DISTINCT FROM context.actor_identity_id
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication authority denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'r3.evaluation.publication.prepare',idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    SELECT p.id,p.sequence,p.input_digest,p.option_count INTO publication_id,sequence_number,input_digest,option_count FROM public.evaluation_publications p
      WHERE p.id=(receipt->>'entity_id')::uuid AND p.organization_id=v_organization_id AND p.intake_id=v_intake_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication authority denied'; END IF;
    state := mmhr_private.r3_publication_state(publication_id);
    RETURN jsonb_build_object('publicationId',publication_id,'organizationId',v_organization_id,'intakeId',v_intake_id,'sequence',sequence_number,
      'configurationVersion',sequence_number,'state',state,'inputDigest',input_digest,'optionCount',option_count,'correlationId',correlation_id,'outcomeCode','replayed');
  END IF;
  SELECT * INTO intake FROM public.intakes i WHERE i.id=v_intake_id AND i.organization_id=v_organization_id FOR UPDATE;
  IF NOT FOUND OR intake.revision<>expected_revision OR intake.status NOT IN ('submitted','under_review','completed')
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication intake revision denied'; END IF;
  snapshot := mmhr_private.r3_publication_snapshot(v_organization_id,v_intake_id,configuration,clock_timestamp());
  -- Reject newly prepared commercial criteria in either format while leaving
  -- the format 1 snapshot reader and historical calculations unchanged.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot->'configuration'->'criteria') criterion
    WHERE criterion->>'factKey' ~ '^(commercial|sponsorship|advertising|paid_placement|partner_status)') THEN
    RAISE EXCEPTION 'Commercial fields cannot affect new publications' USING ERRCODE = '22023';
  END IF;
  IF (snapshot->'intake'->>'id')::uuid IS DISTINCT FROM v_intake_id
    OR (snapshot->'intake'->>'revision')::integer IS DISTINCT FROM intake.revision
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication inputs'; END IF;
  input_digest := encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'); option_count := jsonb_array_length(snapshot->'products');
  SELECT coalesce(max(p.sequence),0)+1 INTO sequence_number FROM public.evaluation_publications p WHERE p.organization_id=v_organization_id AND p.intake_id=v_intake_id;
  INSERT INTO public.evaluation_publications(id,organization_id,intake_id,sequence,intake_revision,configuration,input_snapshot,input_digest,option_count,created_by_identity_id,correlation_id)
    VALUES(publication_id,v_organization_id,v_intake_id,sequence_number,intake.revision,snapshot->'configuration',snapshot,input_digest,option_count,context.actor_identity_id,correlation_id);
  FOR product IN SELECT value FROM jsonb_array_elements(snapshot->'products') LOOP
    evaluation := mmhr_private.r3_evaluate_publication_option(configuration,snapshot->'requirements',product->'inputs');
    IF jsonb_typeof(evaluation)<>'object' OR evaluation ?| ARRAY['optionId','ordinal','maskedLabel','productId','vendorOrganizationId']
      OR coalesce(evaluation->>'eligibility','') NOT IN ('eligible','ineligible','unknown')
      OR coalesce(evaluation->>'deterministicScore','') !~ '^[0-9]+$'
      OR coalesce(evaluation->>'confidenceBasisPoints','') !~ '^[0-9]+$'
      OR jsonb_typeof(evaluation->'fitReasons')<>'array' OR jsonb_typeof(evaluation->'limitations')<>'array'
    THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication option'; END IF;
    evaluated := evaluated || jsonb_build_array(jsonb_build_object('product',product,'evaluation',evaluation));
  END LOOP;
  FOR product IN SELECT value FROM jsonb_array_elements(evaluated)
    ORDER BY CASE WHEN snapshot->'configuration'->'version' IN ('2'::jsonb, '3'::jsonb) THEN 0 ELSE (value->'evaluation'->>'deterministicScore')::integer END DESC,(value->'product'->>'productId')::uuid LOOP
    ordinal := ordinal+1;
    INSERT INTO public.evaluation_publication_options(organization_id,publication_id,vendor_organization_id,product_id,ordinal,masked_label,eligibility,deterministic_score,confidence_basis_points,fit_reasons,limitations,evidence_fresh_at,valid_until)
      VALUES(v_organization_id,publication_id,(product->'product'->>'vendorOrganizationId')::uuid,(product->'product'->>'productId')::uuid,ordinal,'Option '||ordinal::text,
        product->'evaluation'->>'eligibility',(product->'evaluation'->>'deterministicScore')::integer,(product->'evaluation'->>'confidenceBasisPoints')::integer,
        product->'evaluation'->'fitReasons',product->'evaluation'->'limitations',(product->'evaluation'->>'evidenceFreshAt')::timestamptz,(product->'evaluation'->>'validUntil')::timestamptz);
  END LOOP;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r3.evaluation.publication.prepare','evaluation.publication.prepare','evaluation_publication',publication_id,v_organization_id,'Prepare masked evaluation publication',correlation_id,idempotency_key,payload,jsonb_build_object('version',1),jsonb_build_object('version',1),context.authorization_time);
  RETURN jsonb_build_object('publicationId',publication_id,'organizationId',v_organization_id,'intakeId',v_intake_id,'sequence',sequence_number,'configurationVersion',sequence_number,'state','prepared','inputDigest',input_digest,'optionCount',option_count,'correlationId',correlation_id,'outcomeCode','prepared');
END
$$;

