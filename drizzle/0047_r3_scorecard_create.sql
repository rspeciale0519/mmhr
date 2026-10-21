-- R3 scorecard creation command. Criteria remain organization-scoped and bounded.

CREATE OR REPLACE FUNCTION public.mmhr_create_scorecard(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; receipt jsonb; v_scorecard_id uuid; v_organization_id uuid; v_intake_id uuid; v_candidate_id uuid; v_configuration_id uuid; v_actor_id uuid; v_configuration_version integer; v_criteria jsonb; v_count integer;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL OR coalesce(payload->>'scorecardId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'candidateId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'configurationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'configurationVersion','') !~ '^[1-9][0-9]*$' OR jsonb_typeof(payload->'criteria') <> 'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid scorecard input'; END IF;
  v_scorecard_id := (payload->>'scorecardId')::uuid; v_organization_id := (payload->>'organizationId')::uuid; v_intake_id := (payload->>'intakeId')::uuid; v_candidate_id := (payload->>'candidateId')::uuid; v_configuration_id := (payload->>'configurationId')::uuid; v_actor_id := (payload->>'actorIdentityId')::uuid; v_configuration_version := (payload->>'configurationVersion')::integer; v_criteria := payload->'criteria'; v_count := jsonb_array_length(v_criteria);
  IF v_count NOT BETWEEN 1 AND 50 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_criteria) AS item WHERE jsonb_typeof(item) <> 'object' OR coalesce(item->>'criterionKey','') !~ '^[a-z][a-z0-9_]{0,99}$' OR coalesce(item->>'weight','') !~ '^[1-9][0-9]?$' OR (item->>'weight')::integer > 100) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid scorecard criteria'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Create scorecard', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.scorecard.create', idempotency_key, payload);
  IF receipt IS NOT NULL THEN RETURN jsonb_build_object('scorecardId',(receipt->>'entity_id')::uuid,'organizationId',v_organization_id,'intakeId',v_intake_id,'candidateId',v_candidate_id,'status','draft','revision',1,'outcomeCode','replayed','correlationId',correlation_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.evaluation_candidates AS ec WHERE ec.organization_id=v_organization_id AND ec.intake_id=v_intake_id AND ec.id=v_candidate_id AND ec.state <> 'archived') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Scorecard candidate denied'; END IF;
  INSERT INTO public.scorecards (id,organization_id,intake_id,candidate_id,configuration_id,configuration_version) VALUES (v_scorecard_id,v_organization_id,v_intake_id,v_candidate_id,v_configuration_id,v_configuration_version);
  INSERT INTO public.scorecard_criteria (organization_id,scorecard_id,criterion_key,weight) SELECT v_organization_id,v_scorecard_id,lower(btrim(item->>'criterionKey')),(item->>'weight')::integer FROM jsonb_array_elements(v_criteria) AS item;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r3.scorecard.create','scorecard.create','scorecard',v_scorecard_id,v_organization_id,'Create scorecard',correlation_id,idempotency_key,payload,jsonb_build_object('version',v_configuration_version),jsonb_build_object('version',v_configuration_version,'state','draft'),context.authorization_time);
  RETURN jsonb_build_object('scorecardId',v_scorecard_id,'organizationId',v_organization_id,'intakeId',v_intake_id,'candidateId',v_candidate_id,'status','draft','revision',1,'outcomeCode','created','correlationId',correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_create_scorecard(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_create_scorecard(jsonb,uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_create_scorecard(jsonb,uuid,uuid) IS 'R3 bounded organization-scoped scorecard and weighted criteria creation command.';
