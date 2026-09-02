-- R3 candidate lifecycle command. Candidate state remains separate from deal state.

CREATE OR REPLACE FUNCTION mmhr_private.r3_candidate_transition_result(
  candidate_id uuid, organization_id uuid, state text, revision integer,
  outcome_code text, correlation_id uuid
)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT jsonb_build_object(
  'candidateId', $1, 'organizationId', $2, 'state', $3,
  'revision', $4, 'outcomeCode', $5, 'correlationId', $6) $$;

REVOKE ALL ON FUNCTION mmhr_private.r3_candidate_transition_result(uuid,uuid,text,integer,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

CREATE OR REPLACE FUNCTION public.mmhr_transition_evaluation_candidate(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  candidate public.evaluation_candidates%ROWTYPE;
  candidate_id uuid;
  organization_id uuid;
  actor_id uuid;
  from_state text;
  to_state text;
  approval_reference text;
  expected_revision integer;
  receipt jsonb;
  next_revision integer;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'candidateId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'expectedRevision','') !~ '^[1-9][0-9]*$'
    OR coalesce(payload->>'fromState','') NOT IN ('proposed','active','paused','eliminated','selected','archived')
    OR coalesce(payload->>'toState','') NOT IN ('proposed','active','paused','eliminated','selected','archived')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid candidate transition input'; END IF;
  candidate_id := (payload->>'candidateId')::uuid;
  organization_id := (payload->>'organizationId')::uuid;
  actor_id := (payload->>'actorIdentityId')::uuid;
  from_state := payload->>'fromState';
  to_state := payload->>'toState';
  expected_revision := (payload->>'expectedRevision')::integer;
  approval_reference := CASE WHEN payload ? 'approvalReference' AND jsonb_typeof(payload->'approvalReference') <> 'null' THEN btrim(payload->>'approvalReference') ELSE NULL END;
  IF from_state = to_state OR (approval_reference IS NOT NULL AND length(approval_reference) > 300)
    OR (to_state = 'active' AND from_state = 'eliminated' AND coalesce(approval_reference, '') = '')
    OR from_state IN ('selected','archived')
    OR (from_state = 'proposed' AND to_state NOT IN ('active','paused','eliminated'))
    OR (from_state = 'active' AND to_state NOT IN ('paused','eliminated','selected'))
    OR (from_state = 'paused' AND to_state NOT IN ('active','eliminated'))
    OR (from_state = 'eliminated' AND to_state <> 'active')
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Candidate transition denied'; END IF;

  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', organization_id, 'Transition evaluation candidate', correlation_id, idempotency_key);
  IF actor_id <> context.actor_identity_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.candidate.transition', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO candidate FROM public.evaluation_candidates AS ec
    WHERE ec.id = (receipt->>'entity_id')::uuid AND ec.organization_id = organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    RETURN mmhr_private.r3_candidate_transition_result(candidate.id, candidate.organization_id,
      candidate.state, candidate.revision, 'replayed', correlation_id);
  END IF;

  SELECT * INTO candidate FROM public.evaluation_candidates AS ec
  WHERE ec.id = candidate_id AND ec.organization_id = organization_id FOR UPDATE;
  IF NOT FOUND OR candidate.state <> from_state OR candidate.revision <> expected_revision
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Candidate revision or scope denied'; END IF;
  UPDATE public.evaluation_candidates AS ec SET state = to_state,
    revision = ec.revision + 1, updated_by_identity_id = context.actor_identity_id,
    updated_at = clock_timestamp()
  WHERE ec.id = candidate_id AND ec.organization_id = organization_id
  RETURNING ec.revision INTO next_revision;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'r3.candidate.transition', 'candidate.transition',
    'evaluation_candidate', candidate_id, organization_id, 'Transition evaluation candidate',
    correlation_id, idempotency_key, payload, jsonb_build_object('version', 1),
    jsonb_build_object('version', 1), context.authorization_time);
  RETURN mmhr_private.r3_candidate_transition_result(candidate_id, organization_id,
    to_state, next_revision, 'transitioned', correlation_id);
END
$$;

REVOKE ALL ON FUNCTION public.mmhr_transition_evaluation_candidate(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_transition_evaluation_candidate(jsonb,uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_transition_evaluation_candidate(jsonb,uuid,uuid)
  IS 'R3 organization-scoped candidate state transition with approval-bound reactivation.';
