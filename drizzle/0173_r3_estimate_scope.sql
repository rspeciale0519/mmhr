-- Custom SQL migration file, put your code below! --
-- Compare a reviewed estimate with saved customer context without changing fit scoring.
CREATE OR REPLACE FUNCTION mmhr_private.r3_estimate_scope(
  company_context jsonb, estimate_employee_count jsonb, scope jsonb, requirements jsonb
)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  estimate_count numeric;
  customer_count numeric;
  count_value jsonb;
  scope_result text;
BEGIN
  IF jsonb_typeof(estimate_employee_count) IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Invalid estimate employee count' USING ERRCODE = '22023';
  END IF;
  estimate_count := (estimate_employee_count #>> '{}')::numeric;
  IF estimate_count <> trunc(estimate_count) OR estimate_count NOT BETWEEN 1 AND 10000000 THEN
    RAISE EXCEPTION 'Invalid estimate employee count' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(company_context) = 'object' THEN
    count_value := company_context->'estimateEmployeeCountV1';
  END IF;
  IF jsonb_typeof(count_value) = 'number' THEN
    customer_count := (count_value #>> '{}')::numeric;
    IF customer_count <> trunc(customer_count) OR customer_count NOT BETWEEN 1 AND 10000000 THEN
      customer_count := NULL;
    END IF;
  END IF;
  scope_result := mmhr_private.r3_fact_scope_result(scope, requirements);
  IF (customer_count IS NOT NULL AND customer_count <> estimate_count) OR scope_result = 'mismatch' THEN
    RETURN 'mismatch';
  END IF;
  IF customer_count IS NULL OR scope_result <> 'match' THEN RETURN 'unknown'; END IF;
  RETURN 'match';
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r3_estimate_scope(jsonb,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint

-- Details version 1 stays available for existing readers.
CREATE OR REPLACE FUNCTION mmhr_private.r3_masked_publication_details_v2(
  configuration jsonb, requirements jsonb, inputs jsonb, option_row jsonb, company_context jsonb
)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  details jsonb;
  scopes jsonb;
BEGIN
  details := mmhr_private.r3_masked_publication_details(configuration, requirements, inputs, option_row);
  scopes := mmhr_private.r3_publication_fact_scopes(inputs);
  IF details->'annualCost' IS DISTINCT FROM 'null'::jsonb
    AND mmhr_private.r3_estimate_scope(company_context, details->'annualCost'->'employeeCount',
      scopes->'comparison_annual_cost', requirements) <> 'match' THEN
    details := jsonb_set(details, '{annualCost}', 'null'::jsonb);
  END IF;
  IF details->'setup' IS DISTINCT FROM 'null'::jsonb
    AND mmhr_private.r3_fact_scope_result(scopes->'comparison_setup', requirements) <> 'match' THEN
    details := jsonb_set(details, '{setup}', 'null'::jsonb);
  END IF;
  RETURN details;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r3_masked_publication_details_v2(jsonb,jsonb,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint

-- Reuse the existing authorization, freshness, and pagination checks first.
CREATE OR REPLACE FUNCTION mmhr_private.r3_read_evaluation_publication_v2(
  payload jsonb, correlation_id uuid, internal_requested boolean
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  result jsonb;
  publication public.evaluation_publications%ROWTYPE;
  scoped_options jsonb;
BEGIN
  IF payload->'detailsVersion' IS DISTINCT FROM '2'::jsonb THEN
    RAISE EXCEPTION 'Unsupported publication details version' USING ERRCODE = '22023';
  END IF;
  result := mmhr_private.r3_read_evaluation_publication(
    jsonb_set(payload, '{detailsVersion}', '1'::jsonb), correlation_id, internal_requested
  );
  SELECT * INTO publication FROM public.evaluation_publications p
    WHERE p.id = (result->>'publicationId')::uuid
      AND p.organization_id = (result->>'organizationId')::uuid
      AND p.intake_id = (result->>'intakeId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Publication read denied' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(item || jsonb_build_object('details',
    mmhr_private.r3_masked_publication_details_v2(publication.configuration, publication.input_snapshot->'requirements',
      (SELECT product->'inputs' FROM jsonb_array_elements(publication.input_snapshot->'products') product
        JOIN public.evaluation_publication_options stored ON stored.product_id::text=product->>'productId'
        WHERE stored.id=(item->>'optionId')::uuid AND stored.organization_id=publication.organization_id
          AND stored.publication_id=publication.id), item, publication.input_snapshot #> '{intake,companyContext}')
    ) ORDER BY (item->>'ordinal')::integer), '[]'::jsonb) INTO scoped_options
  FROM jsonb_array_elements(result->'options') item;
  RETURN jsonb_set(result, '{options}', scoped_options);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r3_read_evaluation_publication_v2(jsonb,uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_get_evaluation_publication(payload jsonb, correlation_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$ SELECT CASE WHEN $1->'detailsVersion' = '2'::jsonb
  THEN mmhr_private.r3_read_evaluation_publication_v2($1,$2,false)
  ELSE mmhr_private.r3_read_evaluation_publication($1,$2,false) END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_get_current_evaluation_publication(payload jsonb, correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
#variable_conflict use_variable
DECLARE
  organization_id uuid;
  intake_id uuid;
  publication_id uuid;
  page_limit integer := 25;
  page_payload jsonb;
  publication jsonb;
BEGIN
  IF payload ? 'detailsVersion' AND payload->'detailsVersion' IS DISTINCT FROM '1'::jsonb
    AND payload->'detailsVersion' IS DISTINCT FROM '2'::jsonb THEN
    RAISE EXCEPTION 'Unsupported publication details version' USING ERRCODE = '22023';
  END IF;
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid current publication input';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(payload)) NOT BETWEEN 2 AND 4
    OR NOT (payload ?& ARRAY['organizationId','intakeId'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS key(name)
      WHERE key.name NOT IN ('organizationId','intakeId','limit','detailsVersion'))
    OR coalesce(payload->>'organizationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR coalesce(payload->>'intakeId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid current publication input';
  END IF;
  IF payload ? 'limit' THEN
    IF jsonb_typeof(payload->'limit') IS DISTINCT FROM 'number'
      OR coalesce(payload->>'limit','') !~ '^[1-9][0-9]{0,9}$' THEN
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
  IF NOT EXISTS (SELECT 1 FROM public.intakes AS intake
    WHERE intake.organization_id = organization_id AND intake.id = intake_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Current publication read denied';
  END IF;
  SELECT publication_row.id INTO publication_id
  FROM public.evaluation_publications AS publication_row
  WHERE publication_row.organization_id = organization_id AND publication_row.intake_id = intake_id
    AND mmhr_private.r3_publication_state(publication_row.id) = 'published'
    AND NOT EXISTS (SELECT 1 FROM public.evaluation_publication_decisions AS decision
      WHERE decision.publication_id = publication_row.id AND decision.decision = 'revoked')
  ORDER BY publication_row.sequence DESC LIMIT 1;
  IF publication_id IS NOT NULL THEN
    page_payload := jsonb_build_object('organizationId',organization_id,'intakeId',intake_id,
      'publicationId',publication_id,'afterOrdinal',0,'limit',page_limit)
      || CASE WHEN payload ? 'detailsVersion' THEN jsonb_build_object('detailsVersion',payload->'detailsVersion') ELSE '{}'::jsonb END;
    IF payload->'detailsVersion' = '2'::jsonb THEN
      publication := mmhr_private.r3_read_evaluation_publication_v2(page_payload,correlation_id,false);
    ELSE
      publication := mmhr_private.r3_read_evaluation_publication(page_payload,correlation_id,false);
    END IF;
  END IF;
  RETURN jsonb_build_object('organizationId',organization_id,'intakeId',intake_id,
    'publication',publication,'correlationId',correlation_id);
END $$;
