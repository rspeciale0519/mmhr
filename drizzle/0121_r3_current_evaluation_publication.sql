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
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid current publication input';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(payload)) NOT BETWEEN 2 AND 3
    OR NOT (payload ?& ARRAY['organizationId','intakeId'])
    OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(payload) AS key(name)
      WHERE key.name NOT IN ('organizationId','intakeId','limit')
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
      ), correlation_id, false
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
