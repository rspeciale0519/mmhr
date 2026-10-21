-- R3 scorecard entry command. Raw scorecard tables remain closed; this
-- function owns scope, optimistic concurrency, history, audit, and replay.

CREATE OR REPLACE FUNCTION mmhr_private.r3_scorecard_entry_result(
  scorecard_id uuid, organization_id uuid, entry_id uuid, revision integer,
  outcome_code text, correlation_id uuid
)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT jsonb_build_object(
  'scorecardId', $1, 'organizationId', $2, 'entryId', $3,
  'revision', $4, 'outcomeCode', $5, 'correlationId', $6) $$;

REVOKE ALL ON FUNCTION mmhr_private.r3_scorecard_entry_result(uuid,uuid,uuid,integer,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

CREATE OR REPLACE FUNCTION public.mmhr_record_scorecard_entry(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  scorecard public.scorecards%ROWTYPE;
  current_entry public.scorecard_entries%ROWTYPE;
  entry_id uuid;
  scorecard_id uuid;
  organization_id uuid;
  scorer_id uuid;
  criterion_key text;
  value integer;
  comment text;
  evidence_references jsonb;
  entered_at timestamptz;
  expected_revision integer;
  receipt jsonb;
  outcome text;
  next_revision integer;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'scorecardId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'expectedRevision','') !~ '^[1-9][0-9]*$'
    OR jsonb_typeof(payload->'entry') <> 'object'
    OR coalesce(payload->'entry'->>'scoreId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->'entry'->>'criterionKey','') !~ '^[a-z][a-z0-9_]{0,99}$'
    OR coalesce(payload->'entry'->>'scorerIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->'entry'->>'value','') !~ '^(0|[1-9][0-9]?)$'
    OR coalesce(payload->'entry'->>'enteredAt','') = ''
    OR jsonb_typeof(payload->'entry'->'evidenceReferences') <> 'array'
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid scorecard entry input'; END IF;

  scorecard_id := (payload->>'scorecardId')::uuid;
  organization_id := (payload->>'organizationId')::uuid;
  scorer_id := (payload->'entry'->>'scorerIdentityId')::uuid;
  entry_id := (payload->'entry'->>'scoreId')::uuid;
  criterion_key := lower(btrim(payload->'entry'->>'criterionKey'));
  value := (payload->'entry'->>'value')::integer;
  expected_revision := (payload->>'expectedRevision')::integer;
  comment := CASE WHEN payload->'entry' ? 'comment' AND jsonb_typeof(payload->'entry'->'comment') <> 'null' THEN btrim(payload->'entry'->>'comment') ELSE NULL END;
  evidence_references := payload->'entry'->'evidenceReferences';
  entered_at := (payload->'entry'->>'enteredAt')::timestamptz;
  IF value > 100 OR comment IS NOT NULL AND length(comment) > 1000 OR entered_at IS NULL
    OR jsonb_array_length(evidence_references) > 50
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(evidence_references) AS item
      WHERE jsonb_typeof(item) <> 'string' OR length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 500)
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid scorecard entry input'; END IF;

  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', organization_id, 'Record scorecard entry', correlation_id, idempotency_key);
  IF scorer_id <> context.actor_identity_id OR (payload->>'actorIdentityId')::uuid <> context.actor_identity_id
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;

  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.scorecard.entry.record', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO current_entry FROM public.scorecard_entries AS se
    WHERE se.id = (receipt->>'entity_id')::uuid AND se.organization_id = organization_id;
    SELECT sc.revision INTO next_revision FROM public.scorecards AS sc
    WHERE sc.id = scorecard_id AND sc.organization_id = organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    RETURN mmhr_private.r3_scorecard_entry_result(scorecard_id, organization_id, current_entry.id,
      next_revision, 'replayed', correlation_id);
  END IF;

  SELECT * INTO scorecard FROM public.scorecards AS sc
  WHERE sc.id = scorecard_id AND sc.organization_id = organization_id FOR UPDATE;
  IF NOT FOUND OR scorecard.status = 'approved' OR scorecard.revision <> expected_revision
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Scorecard revision or scope denied'; END IF;
  IF entered_at < scorecard.created_at THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Score entry precedes scorecard creation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scorecard_criteria AS sc
    WHERE sc.organization_id = organization_id AND sc.scorecard_id = scorecard_id AND sc.criterion_key = criterion_key)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Scorecard criterion denied'; END IF;

  SELECT * INTO current_entry FROM public.scorecard_entries AS se
  WHERE se.organization_id = organization_id AND se.scorecard_id = scorecard_id
    AND se.criterion_key = criterion_key AND se.scorer_identity_id = scorer_id FOR UPDATE;
  IF FOUND THEN
    UPDATE public.scorecard_entries AS se SET value = value, comment = comment,
      evidence_references = evidence_references, entered_at = entered_at
    WHERE se.id = current_entry.id AND se.organization_id = organization_id;
    outcome := 'recorded';
  ELSE
    INSERT INTO public.scorecard_entries (id, organization_id, scorecard_id, criterion_key,
      scorer_identity_id, value, comment, evidence_references, entered_at)
    VALUES (entry_id, organization_id, scorecard_id, criterion_key, scorer_id, value,
      comment, evidence_references, entered_at);
    outcome := 'recorded';
  END IF;
  INSERT INTO public.scorecard_entry_history (organization_id, scorecard_id, criterion_key,
    scorer_identity_id, value, comment, evidence_references, entered_at, correlation_id)
  VALUES (organization_id, scorecard_id, criterion_key, scorer_id, value, comment,
    evidence_references, entered_at, correlation_id);
  UPDATE public.scorecards AS sc SET revision = sc.revision + 1,
    updated_at = GREATEST(sc.updated_at, entered_at)
  WHERE sc.id = scorecard_id AND sc.organization_id = organization_id
  RETURNING sc.revision INTO next_revision;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'r3.scorecard.entry.record', 'scorecard.entry.record',
    'scorecard_entry', entry_id, organization_id, 'Record scorecard entry', correlation_id,
    idempotency_key, payload, jsonb_build_object('version', 1), jsonb_build_object('version', 1),
    context.authorization_time);
  RETURN mmhr_private.r3_scorecard_entry_result(scorecard_id, organization_id,
    coalesce(current_entry.id, entry_id), next_revision, outcome, correlation_id);
END
$$;

REVOKE ALL ON FUNCTION public.mmhr_record_scorecard_entry(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_scorecard_entry(jsonb,uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_record_scorecard_entry(jsonb,uuid,uuid)
  IS 'R3 organization-scoped optimistic scorecard entry command with immutable history.';
