-- Forward correction: preserve the staff helper, data, and receipts.
-- Containment: revoke this RPC; recover with a reviewed forward correction.
CREATE OR REPLACE FUNCTION public.mmhr_select_initial_evaluation_options(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  claims jsonb := auth.jwt();
  checked_at timestamptz;
  request_session uuid;
  provider auth.users%ROWTYPE;
  actor public.identities%ROWTYPE;
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

  checked_at := mmhr_private.r1_lock_security();
  IF auth.uid() IS NULL
    OR claims->>'role' IS DISTINCT FROM 'authenticated'
    OR coalesce(claims->>'aal','') NOT IN ('aal1','aal2')
    OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims->>'iat','') !~ '^[0-9]{1,12}$'
    OR lower(coalesce(claims->>'sub','')) IS DISTINCT FROM lower(auth.uid()::text)
    OR coalesce(claims->>'session_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
  THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Initial selection authority denied';
  END IF;
  request_session := (claims->>'session_id')::uuid;
  IF (claims->>'exp')::numeric <= extract(epoch FROM checked_at)
    OR (claims->>'iat')::numeric > floor(extract(epoch FROM checked_at))
    OR (claims->>'iat')::numeric >= (claims->>'exp')::numeric
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=request_session
      AND s.user_id=auth.uid() AND (s.not_after IS NULL OR s.not_after>checked_at))
    OR (claims->>'aal'='aal2' AND NOT mmhr_private.r1_session_is_aal2(auth.uid(),request_session,checked_at))
  THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Initial selection authority denied';
  END IF;
  SELECT * INTO provider FROM auth.users u
  WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL
    AND nullif(lower(btrim(u.email)),'') IS NOT NULL AND u.deleted_at IS NULL
    AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<=checked_at)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Initial selection authority denied';
  END IF;
  SELECT * INTO actor FROM public.identities i WHERE i.auth_user_id=provider.id FOR UPDATE;
  IF NOT FOUND OR NOT mmhr_private.r1_verified_identity(actor.id,false)
    OR mmhr_private.r1_request_identity_id() IS DISTINCT FROM actor.id
    OR actor.status <> 'active' OR actor.migration_review_required
    OR EXISTS (SELECT 1 FROM public.identities i WHERE i.status = 'recovery_pending') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Initial selection authority denied';
  END IF;
  IF NOT mmhr_private.r1_evaluate_permission(actor.id,'evaluation.select',organization_id,
      claims->>'aal',checked_at,false)
    OR NOT mmhr_private.r1_evaluate_permission(actor.id,'portal.customer.access',organization_id,
      claims->>'aal',checked_at,false) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Initial selection authority denied';
  END IF;

  receipt := mmhr_private.r1_checked_receipt(actor.id, 'r3.evaluation.initial_selection.select', idempotency_key, payload);
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
    selected_count, initial_candidate_count + selected_count, actor.id, correlation_id
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
      actor.id, actor.id, 1, correlation_id
    );
    INSERT INTO public.evaluation_candidate_masks (
      organization_id, candidate_id, masked_label, state, created_by_identity_id,
      updated_by_identity_id, revision, correlation_id
    ) VALUES (
      organization_id, candidate_id, 'Candidate-' || upper(substr(candidate_id::text, 1, 8)),
      'masked', actor.id, actor.id, 1, correlation_id
    );
    INSERT INTO public.evaluation_initial_selection_items (
      organization_id, intake_id, publication_id, selection_id, option_id, candidate_id, position
    ) VALUES (organization_id, intake_id, publication_id, selection_id, option_row.id, candidate_id, position);
  END LOOP;
  PERFORM mmhr_private.r1_finish_security_command(
    actor.id, 'r3.evaluation.initial_selection.select', 'evaluation.initial_selection.select',
    'evaluation_initial_selection', selection_id, organization_id, 'Select initial evaluation options',
    correlation_id, idempotency_key, payload, jsonb_build_object('version', 1),
    jsonb_build_object('version', 1), checked_at);
  RETURN mmhr_private.r3_initial_selection_result(selection_id, organization_id, correlation_id, 'created');
END
$$;
