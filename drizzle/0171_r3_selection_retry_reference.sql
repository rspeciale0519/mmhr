-- Preserve the result signature and grants. A replay uses its current request
-- reference rather than the reference saved on the original selection.
-- Recovery: retain this migration on application rollback; correct forward if needed.
CREATE OR REPLACE FUNCTION mmhr_private.r3_initial_selection_result(
  selection_id uuid, organization_id uuid, correlation_id uuid, outcome_code text
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'selectionId', s.id, 'organizationId', s.organization_id, 'intakeId', s.intake_id,
    'publicationId', s.publication_id, 'inputDigest', s.input_digest,
    'selectedCount', s.selected_count, 'initialCandidateCount', s.initial_candidate_count,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'optionId', i.option_id, 'candidateId', i.candidate_id,
        'ordinal', o.ordinal, 'maskedLabel', 'Option ' || o.ordinal::text
      ) ORDER BY i.position)
      FROM public.evaluation_initial_selection_items AS i
      JOIN public.evaluation_publication_options AS o
        ON o.organization_id = i.organization_id AND o.publication_id = i.publication_id AND o.id = i.option_id
      JOIN public.evaluation_candidate_masks AS m
        ON m.organization_id = i.organization_id AND m.candidate_id = i.candidate_id
      WHERE i.organization_id = s.organization_id AND i.intake_id = s.intake_id
        AND i.publication_id = s.publication_id AND i.selection_id = s.id
    ), '[]'::jsonb),
    'correlationId', $3, 'outcomeCode', outcome_code
  )
  FROM public.evaluation_initial_selections AS s
  WHERE s.id = selection_id AND s.organization_id = $2
$$;
