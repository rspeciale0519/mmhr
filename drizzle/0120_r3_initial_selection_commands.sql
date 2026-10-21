-- R3 initial customer selection commands. Tables and immutable policies are
-- created by 0119; this migration adds only the command and read boundary.

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
    'correlationId', correlation_id, 'outcomeCode', outcome_code
  )
  FROM public.evaluation_initial_selections AS s
  WHERE s.id = selection_id AND s.organization_id = $2
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_select_initial_evaluation_options(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  intake public.intakes%ROWTYPE;
  publication public.evaluation_publications%ROWTYPE;
  option_row public.evaluation_publication_options%ROWTYPE;
  receipt jsonb;
  replay_selection_id uuid;
  selection_id uuid := gen_random_uuid();
  organization_id uuid;
  intake_id uuid;
  publication_id uuid;
  expected_digest text;
  selected_option_ids uuid[] := ARRAY[]::uuid[];
  option_text text;
  selected_count integer;
  initial_candidate_count integer;
  position integer := 0;
  candidate_id uuid;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid initial selection input';
  END IF;
  IF correlation_id IS NULL OR idempotency_key IS NULL
    OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> 5
    OR NOT (payload ?& ARRAY['organizationId','intakeId','publicationId','expectedDigest','optionIds'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS k(key)
      WHERE k.key NOT IN ('organizationId','intakeId','publicationId','expectedDigest','optionIds'))
    OR coalesce(payload->>'organizationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR coalesce(payload->>'intakeId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR coalesce(payload->>'publicationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR coalesce(payload->>'expectedDigest','') !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid initial selection input';
  END IF;
  IF jsonb_typeof(payload->'optionIds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid initial selection input';
  END IF;
  IF jsonb_array_length(payload->'optionIds') NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid initial selection input';
  END IF;
  FOR option_text IN SELECT value FROM jsonb_array_elements_text(payload->'optionIds') LOOP
    IF option_text IS NULL OR option_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid initial selection option';
    END IF;
    IF (option_text::uuid) = ANY(selected_option_ids) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Duplicate initial selection option';
    END IF;
    selected_option_ids := array_append(selected_option_ids, option_text::uuid);
  END LOOP;
  organization_id := (payload->>'organizationId')::uuid;
  intake_id := (payload->>'intakeId')::uuid;
  publication_id := (payload->>'publicationId')::uuid;
  expected_digest := payload->>'expectedDigest';

  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'evaluation.select', organization_id, 'Select initial evaluation options', correlation_id, idempotency_key);
  IF NOT mmhr_private.r1_request_has_permission('portal.customer.access', organization_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Initial selection authority denied';
  END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.evaluation.initial_selection.select', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    replay_selection_id := (receipt->>'entity_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.evaluation_initial_selections AS s
      WHERE s.id = replay_selection_id AND s.organization_id = organization_id
        AND s.intake_id = intake_id AND s.publication_id = publication_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Initial selection authority denied';
    END IF;
    RETURN mmhr_private.r3_initial_selection_result(replay_selection_id, organization_id, correlation_id, 'replayed');
  END IF;

  SELECT * INTO intake FROM public.intakes AS i
  WHERE i.id = intake_id AND i.organization_id = organization_id FOR UPDATE;
  IF NOT FOUND OR intake.status <> 'submitted' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Initial selection intake denied';
  END IF;
  PERFORM mmhr_private.r3_read_evaluation_publication(
    jsonb_build_object('organizationId', organization_id, 'intakeId', intake_id,
      'publicationId', publication_id, 'afterOrdinal', 0, 'limit', 1), correlation_id, false);
  SELECT * INTO publication FROM public.evaluation_publications AS p
  WHERE p.id = publication_id AND p.organization_id = organization_id AND p.intake_id = intake_id FOR SHARE;
  IF NOT FOUND OR publication.input_digest <> expected_digest THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Initial selection publication denied';
  END IF;
  SELECT count(*)::integer INTO selected_count
  FROM public.evaluation_publication_options AS o
  WHERE o.organization_id = organization_id AND o.publication_id = publication_id AND o.id = ANY(selected_option_ids);
  IF selected_count <> cardinality(selected_option_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Initial selection option denied';
  END IF;
  SELECT count(*)::integer INTO initial_candidate_count
  FROM public.evaluation_candidates AS c
  WHERE c.organization_id = organization_id AND c.intake_id = intake_id AND c.source = 'initial';
  IF initial_candidate_count + selected_count > 5 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Initial candidate limit reached';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.evaluation_candidates AS c
    JOIN public.evaluation_publication_options AS o
      ON o.organization_id = organization_id AND o.publication_id = publication_id
     AND o.id = ANY(selected_option_ids) AND o.product_id = c.product_id
    WHERE c.organization_id = organization_id AND c.intake_id = intake_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Initial candidate already exists';
  END IF;

  INSERT INTO public.evaluation_initial_selections (
    id, organization_id, intake_id, publication_id, input_digest, selected_count,
    initial_candidate_count, created_by_identity_id, correlation_id
  ) VALUES (
    selection_id, organization_id, intake_id, publication_id, publication.input_digest,
    selected_count, initial_candidate_count + selected_count, context.actor_identity_id, correlation_id
  );
  FOR option_row IN
    SELECT o.* FROM public.evaluation_publication_options AS o
    WHERE o.organization_id = organization_id AND o.publication_id = publication_id AND o.id = ANY(selected_option_ids)
    ORDER BY array_position(selected_option_ids, o.id)
  LOOP
    position := position + 1;
    candidate_id := gen_random_uuid();
    INSERT INTO public.evaluation_candidates (
      id, organization_id, intake_id, product_id, vendor_organization_id, source, state,
      eligibility, deterministic_score, scoring_configuration_version, fit_reasons, limitations,
      evidence_fresh_at, created_by_identity_id, updated_by_identity_id, revision, correlation_id
    ) VALUES (
      candidate_id, organization_id, intake_id, option_row.product_id, option_row.vendor_organization_id,
      'initial', 'proposed', option_row.eligibility, option_row.deterministic_score, publication.sequence,
      option_row.fit_reasons, option_row.limitations, option_row.evidence_fresh_at,
      context.actor_identity_id, context.actor_identity_id, 1, correlation_id
    );
    INSERT INTO public.evaluation_candidate_masks (
      organization_id, candidate_id, masked_label, state, created_by_identity_id,
      updated_by_identity_id, revision, correlation_id
    ) VALUES (
      organization_id, candidate_id, 'Candidate-' || upper(substr(candidate_id::text, 1, 8)),
      'masked', context.actor_identity_id, context.actor_identity_id, 1, correlation_id
    );
    INSERT INTO public.evaluation_initial_selection_items (
      organization_id, intake_id, publication_id, selection_id, option_id, candidate_id, position
    ) VALUES (organization_id, intake_id, publication_id, selection_id, option_row.id, candidate_id, position);
  END LOOP;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'r3.evaluation.initial_selection.select', 'evaluation.initial_selection.select',
    'evaluation_initial_selection', selection_id, organization_id, 'Select initial evaluation options',
    correlation_id, idempotency_key, payload, jsonb_build_object('version', 1),
    jsonb_build_object('version', 1), context.authorization_time);
  RETURN mmhr_private.r3_initial_selection_result(selection_id, organization_id, correlation_id, 'created');
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_get_initial_evaluation_selections(payload jsonb, correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE organization_id uuid; intake_id uuid; initial_candidate_count integer;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid initial selection read input';
  END IF;
  IF correlation_id IS NULL
    OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> 2
    OR NOT (payload ?& ARRAY['organizationId','intakeId'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS k(key) WHERE k.key NOT IN ('organizationId','intakeId'))
    OR coalesce(payload->>'organizationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR coalesce(payload->>'intakeId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid initial selection read input'; END IF;
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
  RETURN jsonb_build_object(
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
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION mmhr_private.r3_initial_selection_result(uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
REVOKE ALL ON FUNCTION public.mmhr_select_initial_evaluation_options(jsonb,uuid,uuid), public.mmhr_get_initial_evaluation_selections(jsonb,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_select_initial_evaluation_options(jsonb,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mmhr_get_initial_evaluation_selections(jsonb,uuid) TO authenticated;
