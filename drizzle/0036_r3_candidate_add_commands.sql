-- R3 candidate intake command. Initial evaluations are capped at five candidates.

CREATE OR REPLACE FUNCTION mmhr_private.r3_candidate_add_result(
  candidate_id uuid, organization_id uuid, intake_id uuid, product_id uuid,
  source text, state text, revision integer, outcome_code text, correlation_id uuid
)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT jsonb_build_object(
  'candidateId', $1, 'organizationId', $2, 'intakeId', $3, 'productId', $4,
  'source', $5, 'state', $6, 'revision', $7, 'outcomeCode', $8,
  'correlationId', $9) $$;

REVOKE ALL ON FUNCTION mmhr_private.r3_candidate_add_result(uuid,uuid,uuid,uuid,text,text,integer,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

CREATE OR REPLACE FUNCTION public.mmhr_add_evaluation_candidate(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  intake public.intakes%ROWTYPE;
  candidate public.evaluation_candidates%ROWTYPE;
  candidate_id uuid := gen_random_uuid();
  organization_id uuid;
  intake_id uuid;
  product_id uuid;
  actor_id uuid;
  source text;
  receipt jsonb;
  initial_count integer;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'productId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'source','') NOT IN ('initial','review_addition')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid candidate add input'; END IF;
  organization_id := (payload->>'organizationId')::uuid;
  intake_id := (payload->>'intakeId')::uuid;
  product_id := (payload->>'productId')::uuid;
  actor_id := (payload->>'actorIdentityId')::uuid;
  source := payload->>'source';

  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', organization_id, 'Add evaluation candidate', correlation_id, idempotency_key);
  IF actor_id <> context.actor_identity_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.candidate.add', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO candidate FROM public.evaluation_candidates AS ec
    WHERE ec.id = (receipt->>'entity_id')::uuid AND ec.organization_id = organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    RETURN mmhr_private.r3_candidate_add_result(candidate.id, candidate.organization_id, candidate.intake_id,
      candidate.product_id, candidate.source, candidate.state, candidate.revision, 'replayed', correlation_id);
  END IF;

  SELECT * INTO intake FROM public.intakes AS i
  WHERE i.id = intake_id AND i.organization_id = organization_id FOR UPDATE;
  IF NOT FOUND OR intake.status = 'archived' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Candidate scope denied';
  END IF;
  IF source = 'review_addition' AND intake.status NOT IN ('under_review', 'completed') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Candidate addition requires review';
  END IF;
  SELECT count(*)::integer INTO initial_count FROM public.evaluation_candidates AS ec
  WHERE ec.organization_id = organization_id AND ec.intake_id = intake_id AND ec.source = 'initial';
  IF source = 'initial' AND initial_count >= 5 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Initial candidate limit reached';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products AS p WHERE p.id = product_id AND p.organization_id = organization_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Candidate scope denied';
  END IF;
  INSERT INTO public.evaluation_candidates (
    id, organization_id, intake_id, product_id, source, created_by_identity_id, updated_by_identity_id
  ) VALUES (
    candidate_id, organization_id, intake_id, product_id, source,
    context.actor_identity_id, context.actor_identity_id
  ) RETURNING * INTO candidate;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'r3.candidate.add', 'candidate.add',
    'evaluation_candidate', candidate.id, organization_id, 'Add evaluation candidate',
    correlation_id, idempotency_key, payload, jsonb_build_object('version', 1),
    jsonb_build_object('version', 1), context.authorization_time);
  RETURN mmhr_private.r3_candidate_add_result(candidate.id, organization_id, intake_id, product_id,
    source, candidate.state, candidate.revision, 'created', correlation_id);
END
$$;

REVOKE ALL ON FUNCTION public.mmhr_add_evaluation_candidate(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_add_evaluation_candidate(jsonb,uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_add_evaluation_candidate(jsonb,uuid,uuid)
  IS 'R3 organization-scoped candidate creation with an initial five-candidate cap.';
