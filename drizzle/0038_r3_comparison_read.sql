-- R3 redacted comparison read boundary. It never returns vendor identity fields.
CREATE OR REPLACE FUNCTION public.mmhr_get_evaluation_comparison(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_organization_id uuid; v_intake_id uuid; result jsonb;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F-]{36}$'
    OR (payload ? 'candidateIds' AND (jsonb_typeof(payload->'candidateIds') <> 'array' OR jsonb_array_length(payload->'candidateIds') > 20))
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid comparison input'; END IF;
  v_organization_id := (payload->>'organizationId')::uuid; v_intake_id := (payload->>'intakeId')::uuid;
  IF NOT mmhr_private.r1_request_has_permission('workspace.access', v_organization_id) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'candidateId', ec.id, 'organizationId', ec.organization_id,
    'maskedLabel', coalesce(cm.masked_label, 'Candidate-' || substr(md5(ec.id::text), 1, 8)),
    'state', ec.state, 'deterministicScore', ec.deterministic_score,
    'scorecardStatus', sc.status, 'score', CASE WHEN sc.status = 'approved' THEN (
      SELECT round(sum(se.value * cr.weight)::numeric / nullif(sum(cr.weight), 0), 2)
      FROM public.scorecard_entries se JOIN public.scorecard_criteria cr
        ON cr.organization_id = se.organization_id AND cr.scorecard_id = se.scorecard_id AND cr.criterion_key = se.criterion_key
      WHERE se.organization_id = ec.organization_id AND se.scorecard_id = sc.id
    ) ELSE NULL END
  ) ORDER BY ec.id), '[]'::jsonb) INTO result
  FROM public.evaluation_candidates ec
  LEFT JOIN public.evaluation_candidate_masks cm ON cm.organization_id = ec.organization_id AND cm.candidate_id = ec.id
  LEFT JOIN public.scorecards sc ON sc.organization_id = ec.organization_id AND sc.intake_id = ec.intake_id AND sc.candidate_id = ec.id
  WHERE ec.organization_id = v_organization_id AND ec.intake_id = v_intake_id
    AND (NOT payload ? 'candidateIds' OR ec.id = ANY(ARRAY(SELECT jsonb_array_elements_text(payload->'candidateIds'))::uuid[]));
  RETURN result;
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_get_evaluation_comparison(jsonb) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_evaluation_comparison(jsonb) TO authenticated;
COMMENT ON FUNCTION public.mmhr_get_evaluation_comparison(jsonb) IS 'R3 organization-scoped masked comparison read boundary.';
