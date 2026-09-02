-- R3 candidate identity masking and approval-bound unmasking.

CREATE TABLE public.evaluation_candidate_masks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  masked_label text NOT NULL,
  state text NOT NULL DEFAULT 'masked',
  masked_at timestamptz NOT NULL DEFAULT now(),
  unmasked_at timestamptz,
  unmasked_by_identity_id uuid,
  unmask_reason text,
  approval_reference text,
  created_by_identity_id uuid,
  updated_by_identity_id uuid,
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evaluation_candidate_masks_candidate_uq UNIQUE (organization_id, candidate_id),
  CONSTRAINT evaluation_candidate_masks_candidate_fk FOREIGN KEY (organization_id, candidate_id)
    REFERENCES public.evaluation_candidates (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT evaluation_candidate_masks_state_ck CHECK (
    (state = 'masked' AND unmasked_at IS NULL AND unmasked_by_identity_id IS NULL AND unmask_reason IS NULL AND approval_reference IS NULL)
    OR (state = 'unmasked' AND unmasked_at IS NOT NULL AND unmasked_by_identity_id IS NOT NULL
      AND length(btrim(unmask_reason)) BETWEEN 1 AND 500 AND length(btrim(approval_reference)) BETWEEN 1 AND 300)
  ),
  CONSTRAINT evaluation_candidate_masks_label_ck CHECK (masked_label ~ '^Candidate-[A-Fa-f0-9]{8}$'),
  CONSTRAINT evaluation_candidate_masks_revision_ck CHECK (revision > 0)
);
CREATE INDEX evaluation_candidate_masks_organization_state_idx ON public.evaluation_candidate_masks (organization_id, state);
ALTER TABLE public.evaluation_candidate_masks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evaluation_candidate_masks FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r1_deny_anon_authenticated_evaluation_candidate_masks ON public.evaluation_candidate_masks
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.mmhr_mask_evaluation_candidate(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE context record; mask public.evaluation_candidate_masks%ROWTYPE; candidate_id uuid; organization_id uuid; actor_id uuid; receipt jsonb;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'candidateId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid candidate mask input'; END IF;
  candidate_id := (payload->>'candidateId')::uuid; organization_id := (payload->>'organizationId')::uuid; actor_id := (payload->>'actorIdentityId')::uuid;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', organization_id, 'Mask evaluation candidate', correlation_id, idempotency_key);
  IF actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.candidate.mask', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT m.* INTO mask FROM public.evaluation_candidate_masks AS m WHERE m.id = (receipt->>'entity_id')::uuid AND m.organization_id = organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('candidateId', mask.candidate_id, 'organizationId', mask.organization_id, 'maskedLabel', mask.masked_label, 'state', mask.state, 'outcomeCode', 'replayed', 'correlationId', correlation_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.evaluation_candidates AS ec WHERE ec.id = candidate_id AND ec.organization_id = organization_id) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Candidate scope denied'; END IF;
  SELECT m.* INTO mask FROM public.evaluation_candidate_masks AS m WHERE m.organization_id = organization_id AND m.candidate_id = candidate_id FOR UPDATE;
  IF FOUND THEN
    IF mask.state <> 'masked' THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Candidate mask denied'; END IF;
  ELSE
    INSERT INTO public.evaluation_candidate_masks (organization_id, candidate_id, masked_label, created_by_identity_id, updated_by_identity_id)
    VALUES (organization_id, candidate_id, 'Candidate-' || substr(md5(candidate_id::text), 1, 8), context.actor_identity_id, context.actor_identity_id)
    RETURNING * INTO mask;
    PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r3.candidate.mask', 'candidate.mask', 'evaluation_candidate_mask', mask.id, organization_id, 'Mask evaluation candidate', correlation_id, idempotency_key, payload, jsonb_build_object('version',1), jsonb_build_object('version',1), context.authorization_time);
  END IF;
  RETURN jsonb_build_object('candidateId', candidate_id, 'organizationId', organization_id, 'maskedLabel', mask.masked_label, 'state', mask.state, 'outcomeCode', 'masked', 'correlationId', correlation_id);
END
$$;

CREATE OR REPLACE FUNCTION public.mmhr_unmask_evaluation_candidate(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE context record; mask public.evaluation_candidate_masks%ROWTYPE; candidate_id uuid; organization_id uuid; actor_id uuid; reason text; approval_reference text; receipt jsonb;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'candidateId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR length(btrim(coalesce(payload->>'reason',''))) NOT BETWEEN 1 AND 500
    OR length(btrim(coalesce(payload->>'approvalReference',''))) NOT BETWEEN 1 AND 300
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid candidate unmask input'; END IF;
  candidate_id := (payload->>'candidateId')::uuid; organization_id := (payload->>'organizationId')::uuid; actor_id := (payload->>'actorIdentityId')::uuid;
  reason := btrim(payload->>'reason'); approval_reference := btrim(payload->>'approvalReference');
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', organization_id, 'Unmask evaluation candidate', correlation_id, idempotency_key);
  IF actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.candidate.unmask', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT m.* INTO mask FROM public.evaluation_candidate_masks AS m WHERE m.id = (receipt->>'entity_id')::uuid AND m.organization_id = organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('candidateId', mask.candidate_id, 'organizationId', mask.organization_id, 'maskedLabel', mask.masked_label, 'state', mask.state, 'outcomeCode', 'replayed', 'correlationId', correlation_id);
  END IF;
  SELECT m.* INTO mask FROM public.evaluation_candidate_masks AS m WHERE m.candidate_id = candidate_id AND m.organization_id = organization_id FOR UPDATE;
  IF NOT FOUND OR mask.state <> 'masked' THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Candidate unmask denied'; END IF;
  UPDATE public.evaluation_candidate_masks AS m SET state='unmasked', unmasked_at=clock_timestamp(), unmasked_by_identity_id=context.actor_identity_id,
    unmask_reason=reason, approval_reference=approval_reference, updated_by_identity_id=context.actor_identity_id, revision=m.revision+1, updated_at=clock_timestamp()
    WHERE m.id=mask.id RETURNING * INTO mask;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r3.candidate.unmask', 'candidate.unmask', 'evaluation_candidate_mask', mask.id, organization_id, 'Unmask evaluation candidate', correlation_id, idempotency_key, payload, jsonb_build_object('version',1), jsonb_build_object('version',1), context.authorization_time);
  RETURN jsonb_build_object('candidateId', mask.candidate_id, 'organizationId', mask.organization_id, 'maskedLabel', mask.masked_label, 'state', mask.state, 'outcomeCode', 'unmasked', 'correlationId', correlation_id);
END
$$;

REVOKE ALL ON FUNCTION public.mmhr_mask_evaluation_candidate(jsonb,uuid,uuid), public.mmhr_unmask_evaluation_candidate(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_mask_evaluation_candidate(jsonb,uuid,uuid), public.mmhr_unmask_evaluation_candidate(jsonb,uuid,uuid) TO authenticated;
