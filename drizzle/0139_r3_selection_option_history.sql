-- Optional masked option mapping. Legacy reads and all selection records stay unchanged.
-- Recovery: keep on application rollback; correct forward if needed.
CREATE OR REPLACE FUNCTION public.mmhr_get_initial_evaluation_selections(payload jsonb, correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE organization_id uuid; intake_id uuid; initial_candidate_count integer; selection_publication_id uuid; selected_option_ids jsonb; result jsonb;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid initial selection read input';
  END IF;
  IF correlation_id IS NULL
    OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> (CASE WHEN payload ? 'selectionPublicationId' THEN 3 ELSE 2 END)
    OR NOT (payload ?& ARRAY['organizationId','intakeId'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS k(key) WHERE k.key NOT IN ('organizationId','intakeId','selectionPublicationId'))
    OR coalesce(payload->>'organizationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR coalesce(payload->>'intakeId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid initial selection read input'; END IF;
  IF payload ? 'selectionPublicationId' AND coalesce(payload->>'selectionPublicationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid selection publication';
  END IF;
  selection_publication_id := (payload->>'selectionPublicationId')::uuid;
  organization_id := (payload->>'organizationId')::uuid; intake_id := (payload->>'intakeId')::uuid;
  PERFORM mmhr_private.r1_lock_security();
  IF NOT mmhr_private.r1_request_has_permission('portal.customer.access', organization_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Initial selection read denied';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.intakes AS i
    WHERE i.id = intake_id AND i.organization_id = organization_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Initial selection read denied';
  END IF;
  SELECT count(*)::integer INTO initial_candidate_count FROM public.evaluation_candidates AS c
  WHERE c.organization_id = organization_id AND c.intake_id = intake_id AND c.source = 'initial';
  IF initial_candidate_count > 5 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Initial candidate history denied';
  END IF;
  result := jsonb_build_object(
    'organizationId', organization_id, 'intakeId', intake_id,
    'initialCandidateCount', initial_candidate_count, 'remainingInitialChoices', 5 - initial_candidate_count,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'selectionId', i.selection_id, 'publicationId', i.publication_id,
        'publicationSequence', p.sequence, 'optionId', i.option_id, 'candidateId', i.candidate_id,
        'ordinal', o.ordinal, 'maskedLabel', 'Option ' || o.ordinal::text, 'state', c.state, 'selectedAt', s.created_at
      ) ORDER BY s.created_at, i.position)
      FROM public.evaluation_initial_selection_items AS i
      JOIN public.evaluation_initial_selections AS s
        ON s.organization_id = i.organization_id AND s.id = i.selection_id
       AND s.intake_id = i.intake_id AND s.publication_id = i.publication_id
      JOIN public.evaluation_publications AS p
        ON p.organization_id = i.organization_id AND p.intake_id = i.intake_id AND p.id = i.publication_id
      JOIN public.evaluation_publication_options AS o
        ON o.organization_id = i.organization_id AND o.publication_id = i.publication_id AND o.id = i.option_id
      JOIN public.evaluation_candidates AS c
        ON c.organization_id = i.organization_id AND c.intake_id = i.intake_id AND c.id = i.candidate_id
      JOIN public.evaluation_candidate_masks AS m
        ON m.organization_id = i.organization_id AND m.candidate_id = i.candidate_id
      WHERE i.organization_id = organization_id AND i.intake_id = intake_id
    ), '[]'::jsonb), 'correlationId', correlation_id
  );
  IF selection_publication_id IS NOT NULL THEN
    -- Reuse the scoped read to reject stale, unpublished, and foreign publications.
    PERFORM mmhr_private.r3_read_evaluation_publication(
      jsonb_build_object('organizationId', organization_id, 'intakeId', intake_id,
        'publicationId', selection_publication_id, 'afterOrdinal', 0, 'limit', 1), correlation_id, false);
    SELECT coalesce(jsonb_agg(o.id ORDER BY o.ordinal), '[]'::jsonb) INTO selected_option_ids
    FROM public.evaluation_publication_options o
    WHERE o.organization_id = organization_id AND o.publication_id = selection_publication_id
      AND EXISTS (SELECT 1 FROM public.evaluation_candidates c
        WHERE c.organization_id = organization_id AND c.intake_id = intake_id AND c.product_id = o.product_id);
    result := result || jsonb_build_object('selectionPublicationId', selection_publication_id,
      'selectedOptionIds', selected_option_ids);
  END IF;
  RETURN result;
END
$$;
