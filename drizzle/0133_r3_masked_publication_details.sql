-- Opt-in masked details from the existing immutable publication snapshot.
-- No table, score, permission, approval, or publication record changes.

CREATE OR REPLACE FUNCTION mmhr_private.r3_detail_enum_array(value jsonb, allowed text[], minimum_count integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN jsonb_typeof(value) IS DISTINCT FROM 'array' THEN false ELSE
    jsonb_array_length(value) BETWEEN minimum_count AND cardinality(allowed)
    AND (SELECT count(DISTINCT item) FROM jsonb_array_elements(value) item) = jsonb_array_length(value)
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(value) item
      WHERE jsonb_typeof(item) IS DISTINCT FROM 'string' OR NOT ((item #>> '{}') = ANY(allowed))) END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r3_detail_range(value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(value)) <> 2
    OR jsonb_typeof(value->'minimum') IS DISTINCT FROM 'number'
    OR jsonb_typeof(value->'maximum') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  RETURN (value->>'minimum')::numeric >= 0
    AND (value->>'maximum')::numeric <= 1000000000
    AND (value->>'minimum')::numeric <= (value->>'maximum')::numeric;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r3_masked_detail_evidence(input_row jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN input_row IS NULL THEN NULL ELSE jsonb_build_object(
    'basis', input_row->'provenance', 'capturedAt', input_row->'captured_at',
    'reviewedAt', input_row->'approved_at', 'validUntil', input_row->'valid_until',
    'version', input_row->'evidence_version') END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r3_masked_estimate(input_row jsonb, estimate_kind text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE estimate jsonb;
BEGIN
  IF input_row IS NULL THEN RETURN NULL; END IF;
  BEGIN
    estimate := (input_row->>'value')::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Approved comparison estimate is invalid' USING ERRCODE = '22023';
  END;
  IF jsonb_typeof(estimate) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Approved comparison estimate is invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT mmhr_private.r3_detail_enum_array(estimate->'includedModules',
      ARRAY['hr','payroll','time','benefits','recruiting','performance','learning','expenses','compensation','analytics'], 1)
    OR NOT mmhr_private.r3_detail_enum_array(estimate->'assumptions',
      ARRAY['standard_configuration','customer_data_ready','single_entity','multiple_entities','annual_billing','monthly_billing','remote_training','standard_integrations','custom_integration_required'], 1)
  THEN RAISE EXCEPTION 'Approved comparison estimate scope is invalid' USING ERRCODE = '22023'; END IF;

  IF estimate_kind = 'annual_cost' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(estimate)) <> 7
      OR NOT (estimate ?& ARRAY['recurring','currency','employeeCount','includedModules','assumptions','exclusions','oneTime'])
      OR NOT mmhr_private.r3_detail_range(estimate->'recurring')
      OR jsonb_typeof(estimate->'currency') IS DISTINCT FROM 'string'
      OR coalesce(estimate->>'currency','') NOT IN ('USD','CAD','GBP','EUR','AUD')
      OR jsonb_typeof(estimate->'employeeCount') IS DISTINCT FROM 'number'
      OR coalesce(estimate->>'employeeCount','') !~ '^[1-9][0-9]*$'
      OR NOT mmhr_private.r3_detail_enum_array(estimate->'exclusions',
        ARRAY['taxes','implementation','migration','training','third_party_fees','optional_modules'], 0)
      OR (estimate->'oneTime' IS DISTINCT FROM 'null'::jsonb AND NOT mmhr_private.r3_detail_range(estimate->'oneTime'))
    THEN RAISE EXCEPTION 'Approved annual cost is invalid' USING ERRCODE = '22023'; END IF;
    IF (estimate->>'employeeCount')::numeric > 10000000 THEN
      RAISE EXCEPTION 'Approved annual cost scope is invalid' USING ERRCODE = '22023';
    END IF;
  ELSIF estimate_kind = 'setup' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(estimate)) <> 5
      OR NOT (estimate ?& ARRAY['duration','unit','scope','includedModules','assumptions'])
      OR NOT mmhr_private.r3_detail_range(estimate->'duration')
      OR jsonb_typeof(estimate->'unit') IS DISTINCT FROM 'string'
      OR coalesce(estimate->>'unit','') NOT IN ('days','weeks','months')
      OR jsonb_typeof(estimate->'scope') IS DISTINCT FROM 'string'
      OR coalesce(estimate->>'scope','') NOT IN ('initial_implementation','payroll_migration','module_addition')
    THEN RAISE EXCEPTION 'Approved setup estimate is invalid' USING ERRCODE = '22023'; END IF;
  ELSE RAISE EXCEPTION 'Comparison estimate kind is invalid' USING ERRCODE = '22023'; END IF;
  RETURN estimate || jsonb_build_object('evidence', mmhr_private.r3_masked_detail_evidence(input_row));
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r3_masked_publication_details(configuration jsonb, requirements jsonb, inputs jsonb, option_row jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE criterion jsonb; input_row jsonb; features jsonb := '[]'::jsonb;
  annual_input jsonb; setup_input jsonb; matched boolean; coverage_input jsonb; coverage_map jsonb := '{}'::jsonb;
BEGIN
  PERFORM mmhr_private.r3_validate_publication_inputs(inputs);
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
    -- Legacy scalar facts establish outcomes, but do not establish package delivery type.
    SELECT i INTO input_row FROM jsonb_array_elements(inputs) i
      WHERE i->>'field_key'=criterion->>'factKey'
        AND (NOT matched OR mmhr_private.r3_publication_scalar_matches(i->>'value',
          mmhr_private.r3_publication_response_at_path((SELECT r->'response' FROM jsonb_array_elements(requirements) r
            WHERE r->>'key'=criterion->>'requirementKey'), criterion->'responsePath')))
      ORDER BY (i->>'captured_at')::timestamptz, i->>'fact_id' LIMIT 1;
    IF matched AND input_row IS NULL THEN
      RAISE EXCEPTION 'Published feature evidence is inconsistent' USING ERRCODE = '22023';
    END IF;
    features := features || jsonb_build_array(jsonb_build_object(
      'requirementKey', criterion->>'requirementKey',
      'outcome', CASE WHEN matched THEN 'match' WHEN input_row IS NOT NULL THEN 'mismatch' ELSE 'unknown' END,
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

REVOKE ALL ON FUNCTION mmhr_private.r3_detail_enum_array(jsonb,text[],integer),
  mmhr_private.r3_detail_range(jsonb), mmhr_private.r3_masked_detail_evidence(jsonb),
  mmhr_private.r3_masked_estimate(jsonb,text), mmhr_private.r3_masked_publication_details(jsonb,jsonb,jsonb,jsonb)
FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mmhr_private.r3_read_evaluation_publication(payload jsonb, correlation_id uuid, internal_requested boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE checked_at timestamptz; publication public.evaluation_publications%ROWTYPE; state text; v_org uuid; v_intake uuid; v_id uuid; after_ordinal integer:=0; page_limit integer:=25; internal_read boolean; current_sequence integer; options jsonb; next_ordinal integer;
BEGIN
  IF payload ? 'detailsVersion' AND payload->'detailsVersion' IS DISTINCT FROM '1'::jsonb THEN
    RAISE EXCEPTION 'Unsupported publication details version' USING ERRCODE = '22023';
  END IF;
  IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR correlation_id IS NULL OR NOT (payload ?& ARRAY['organizationId','intakeId','publicationId'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS k(key) WHERE k.key NOT IN ('organizationId','intakeId','publicationId','afterOrdinal','limit','detailsVersion'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' OR coalesce(payload->>'publicationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication read input'; END IF;
  IF payload ? 'afterOrdinal' THEN IF jsonb_typeof(payload->'afterOrdinal')<>'number' OR coalesce(payload->>'afterOrdinal','') !~ '^[0-9]{1,10}$' OR (payload->>'afterOrdinal')::numeric > 2147483647 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication read input'; END IF; after_ordinal:=(payload->>'afterOrdinal')::integer; END IF;
  IF payload ? 'limit' THEN IF jsonb_typeof(payload->'limit')<>'number' OR coalesce(payload->>'limit','') !~ '^[1-9][0-9]{0,9}$' OR (payload->>'limit')::numeric > 50 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication read input'; END IF; page_limit:=(payload->>'limit')::integer; END IF;
  IF after_ordinal<0 OR page_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication read input'; END IF;
  v_org:=(payload->>'organizationId')::uuid; v_intake:=(payload->>'intakeId')::uuid; v_id:=(payload->>'publicationId')::uuid; checked_at:=mmhr_private.r1_lock_security();
  internal_read:=internal_requested AND mmhr_private.r1_request_has_permission('evaluation.publish',v_org) AND mmhr_private.r1_request_has_permission('admin.access',NULL::uuid);
  IF internal_requested AND NOT internal_read THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication review denied';
  END IF;
  IF NOT internal_read AND NOT mmhr_private.r1_request_has_permission('portal.customer.access',v_org) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication read denied'; END IF;
  SELECT * INTO publication FROM public.evaluation_publications p WHERE p.id=v_id AND p.organization_id=v_org AND p.intake_id=v_intake FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication read denied'; END IF;
  state:=mmhr_private.r3_publication_state(publication.id);
  IF internal_read THEN
    IF state NOT IN ('prepared','published') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication read denied'; END IF;
  ELSE
    SELECT max(p.sequence) INTO current_sequence
      FROM public.evaluation_publications p
      WHERE p.organization_id=v_org AND p.intake_id=v_intake
        AND mmhr_private.r3_publication_state(p.id)='published'
        AND NOT EXISTS (SELECT 1 FROM public.evaluation_publication_decisions d WHERE d.publication_id=p.id AND d.decision='revoked');
    IF state<>'published' OR publication.sequence IS DISTINCT FROM current_sequence THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication read denied'; END IF;
    IF encode(sha256(convert_to(mmhr_private.r3_publication_snapshot(publication.organization_id,publication.intake_id,publication.configuration,clock_timestamp())::text,'UTF8')),'hex') <> publication.input_digest THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication is stale';
    END IF;
  END IF;
  WITH page AS (SELECT o.id,o.ordinal,o.masked_label,o.eligibility,o.deterministic_score,o.confidence_basis_points,o.fit_reasons,o.limitations,o.evidence_fresh_at,o.valid_until,row_number() OVER (ORDER BY o.ordinal) AS rn FROM public.evaluation_publication_options o WHERE o.organization_id=v_org AND o.publication_id=v_id AND o.ordinal>after_ordinal)
  SELECT coalesce(jsonb_agg(jsonb_build_object('optionId',id,'ordinal',ordinal,'maskedLabel',masked_label,'eligibility',eligibility,'deterministicScore',deterministic_score,'confidenceBasisPoints',confidence_basis_points,'fitReasons',fit_reasons,'limitations',limitations,'evidenceFreshAt',evidence_fresh_at,'validUntil',valid_until) ORDER BY ordinal) FILTER (WHERE rn<=page_limit),'[]'::jsonb),min(ordinal) FILTER (WHERE rn=page_limit+1) INTO options,next_ordinal FROM page;
  IF next_ordinal IS NOT NULL THEN next_ordinal:=next_ordinal-1; END IF;
  IF payload ? 'detailsVersion' THEN
    SELECT coalesce(jsonb_agg(item || jsonb_build_object('details',
      mmhr_private.r3_masked_publication_details(publication.configuration, publication.input_snapshot->'requirements',
        (SELECT product->'inputs' FROM jsonb_array_elements(publication.input_snapshot->'products') product
          JOIN public.evaluation_publication_options stored ON stored.product_id::text=product->>'productId'
          WHERE stored.id=(item->>'optionId')::uuid AND stored.organization_id=v_org AND stored.publication_id=v_id), item)
      ) ORDER BY (item->>'ordinal')::integer), '[]'::jsonb) INTO options
    FROM jsonb_array_elements(options) item;
  END IF;
  RETURN jsonb_build_object('publicationId',publication.id,'organizationId',publication.organization_id,'intakeId',publication.intake_id,'sequence',publication.sequence,'configurationVersion',publication.sequence,'state',state,'inputDigest',publication.input_digest,'optionCount',publication.option_count,'options',options,'nextOrdinal',next_ordinal,'correlationId',correlation_id);
END
$$;
--> statement-breakpoint

-- First-page discovery for the current customer publication.
-- Existing publication reads remain responsible for cursor pages.
CREATE OR REPLACE FUNCTION public.mmhr_get_current_evaluation_publication(
  payload jsonb, correlation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
#variable_conflict use_variable
DECLARE
  organization_id uuid;
  intake_id uuid;
  publication_id uuid;
  page_limit integer := 25;
  publication jsonb;
BEGIN
  IF payload ? 'detailsVersion' AND payload->'detailsVersion' IS DISTINCT FROM '1'::jsonb THEN
    RAISE EXCEPTION 'Unsupported publication details version' USING ERRCODE = '22023';
  END IF;
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid current publication input';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(payload)) NOT BETWEEN 2 AND 4
    OR NOT (payload ?& ARRAY['organizationId','intakeId'])
    OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(payload) AS key(name)
      WHERE key.name NOT IN ('organizationId','intakeId','limit','detailsVersion')
    )
    OR coalesce(payload->>'organizationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR coalesce(payload->>'intakeId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid current publication input';
  END IF;
  IF payload ? 'limit' THEN
    IF jsonb_typeof(payload->'limit') IS DISTINCT FROM 'number'
      OR coalesce(payload->>'limit','') !~ '^[1-9][0-9]{0,9}$'
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid current publication input';
    END IF;
    IF (payload->>'limit')::numeric NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid current publication input';
    END IF;
    page_limit := (payload->>'limit')::integer;
  END IF;
  organization_id := (payload->>'organizationId')::uuid;
  intake_id := (payload->>'intakeId')::uuid;

  PERFORM mmhr_private.r1_lock_security();
  IF NOT mmhr_private.r1_request_has_permission('portal.customer.access', organization_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Current publication read denied';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.intakes AS intake
    WHERE intake.organization_id = organization_id AND intake.id = intake_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Current publication read denied';
  END IF;

  SELECT publication_row.id INTO publication_id
  FROM public.evaluation_publications AS publication_row
  WHERE publication_row.organization_id = organization_id
    AND publication_row.intake_id = intake_id
    AND mmhr_private.r3_publication_state(publication_row.id) = 'published'
    AND NOT EXISTS (
      SELECT 1 FROM public.evaluation_publication_decisions AS decision
      WHERE decision.publication_id = publication_row.id AND decision.decision = 'revoked'
    )
  ORDER BY publication_row.sequence DESC
  LIMIT 1;

  IF publication_id IS NOT NULL THEN
    publication := mmhr_private.r3_read_evaluation_publication(
      jsonb_build_object(
        'organizationId', organization_id,
        'intakeId', intake_id,
        'publicationId', publication_id,
        'afterOrdinal', 0,
        'limit', page_limit
      ) || CASE WHEN payload ? 'detailsVersion' THEN jsonb_build_object('detailsVersion',1) ELSE '{}'::jsonb END, correlation_id, false
    );
  END IF;

  RETURN jsonb_build_object(
    'organizationId', organization_id,
    'intakeId', intake_id,
    'publication', publication,
    'correlationId', correlation_id
  );
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.mmhr_get_current_evaluation_publication(jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_current_evaluation_publication(jsonb, uuid) TO authenticated;

