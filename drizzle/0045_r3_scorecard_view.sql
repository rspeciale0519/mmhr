-- R3 aggregate and individual scorecard read boundary.

CREATE OR REPLACE FUNCTION public.mmhr_get_scorecard_view(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; v_scorecard public.scorecards%ROWTYPE; v_organization_id uuid; v_scorecard_id uuid; v_actor_id uuid;
  v_criteria jsonb; v_aggregate numeric;
BEGIN
  IF jsonb_typeof(payload) <> 'object'
    OR coalesce(payload->>'scorecardId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'correlationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'idempotencyKey','') !~ '^[0-9a-fA-F-]{36}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid scorecard view input'; END IF;
  v_scorecard_id := (payload->>'scorecardId')::uuid; v_organization_id := (payload->>'organizationId')::uuid; v_actor_id := (payload->>'actorIdentityId')::uuid;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Read scorecard view', (payload->>'correlationId')::uuid, (payload->>'idempotencyKey')::uuid);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  SELECT * INTO v_scorecard FROM public.scorecards AS s WHERE s.id=v_scorecard_id AND s.organization_id=v_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Scorecard view denied'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('criterionKey', c.criterion_key, 'weight', c.weight, 'entries', coalesce(entries.items,'[]'::jsonb), 'aggregateScore', entries.average) ORDER BY c.criterion_key), '[]'::jsonb), coalesce(round(sum(coalesce(entries.average,0) * c.weight) / nullif(sum(c.weight),0), 2), 0)
    INTO v_criteria, v_aggregate
    FROM public.scorecard_criteria AS c
    LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('scorerIdentityId', e.scorer_identity_id, 'value', e.value, 'comment', e.comment, 'evidenceReferences', e.evidence_references, 'enteredAt', e.entered_at) ORDER BY e.scorer_identity_id) AS items, avg(e.value)::numeric AS average FROM public.scorecard_entries AS e WHERE e.organization_id=v_organization_id AND e.scorecard_id=v_scorecard_id AND e.criterion_key=c.criterion_key) AS entries ON true
    WHERE c.organization_id=v_organization_id AND c.scorecard_id=v_scorecard_id;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r3.scorecard.view', 'scorecard.view', 'scorecard', v_scorecard_id, v_organization_id, 'Read scorecard view', (payload->>'correlationId')::uuid, (payload->>'idempotencyKey')::uuid, payload, jsonb_build_object('version',v_scorecard.configuration_version), jsonb_build_object('version',v_scorecard.configuration_version,'state',v_scorecard.status), context.authorization_time);
  RETURN jsonb_build_object('scorecardId',v_scorecard.id,'organizationId',v_scorecard.organization_id,'status',v_scorecard.status,'revision',v_scorecard.revision,'configurationVersion',v_scorecard.configuration_version,'criteria',v_criteria,'aggregateScore',v_aggregate,'correlationId',(payload->>'correlationId')::uuid);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_get_scorecard_view(jsonb) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_scorecard_view(jsonb) TO authenticated;
COMMENT ON FUNCTION public.mmhr_get_scorecard_view(jsonb) IS 'R3 organization-scoped aggregate and individual scorecard view.';
