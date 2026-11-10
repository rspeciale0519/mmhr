-- Forward correction: exact calculation and complete creation retry receipts.
-- Match the existing TypeScript half-up rule without rewriting stored events.
-- Recovery preserves prior events and uses a reviewed forward correction.
DO $$
DECLARE definition text;
  original_expression constant text := 'floor(v_value * structure.rate_basis_points / 10000.0)';
  corrected_expression constant text := 'floor((v_value::numeric * structure.rate_basis_points + 5000) / 10000)';
  original_replay constant text := $replay$RETURN jsonb_build_object('entityId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id);$replay$;
  corrected_replay constant text := $replay$RETURN jsonb_build_object('entityId',receipt->>'entity_id','organizationId',v_org,'status',CASE WHEN v_action='create_structure' THEN 'active' ELSE 'pending_review' END,'outcomeCode','replayed','correlationId',correlation_id);$replay$;
BEGIN
  SELECT pg_get_functiondef('public.mmhr_record_commission(jsonb,uuid,uuid)'::regprocedure) INTO definition;
  IF (length(definition) - length(replace(definition,original_expression,''))) / length(original_expression) <> 1 THEN
    RAISE EXCEPTION 'Commission calculation baseline requires review';
  END IF;
  IF (length(definition) - length(replace(definition,original_replay,''))) / length(original_replay) <> 1 THEN
    RAISE EXCEPTION 'Commission receipt baseline requires review';
  END IF;
  EXECUTE replace(replace(definition,original_expression,corrected_expression),original_replay,corrected_replay);
END $$;

