-- R3 duplicate-product review. A confirmed duplicate archives only the
-- duplicate candidate and preserves the review evidence.

CREATE TABLE public.evaluation_product_duplicate_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  intake_id uuid NOT NULL,
  left_candidate_id uuid NOT NULL,
  right_candidate_id uuid NOT NULL,
  decision text NOT NULL,
  reason text NOT NULL,
  material_distinction text,
  reviewed_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  correlation_id uuid NOT NULL,
  CONSTRAINT evaluation_product_duplicate_reviews_intake_scope_fk FOREIGN KEY (organization_id, intake_id)
    REFERENCES public.intakes (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT evaluation_product_duplicate_reviews_left_scope_fk FOREIGN KEY (organization_id, left_candidate_id)
    REFERENCES public.evaluation_candidates (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT evaluation_product_duplicate_reviews_right_scope_fk FOREIGN KEY (organization_id, right_candidate_id)
    REFERENCES public.evaluation_candidates (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT evaluation_product_duplicate_reviews_distinct_ck CHECK (left_candidate_id <> right_candidate_id),
  CONSTRAINT evaluation_product_duplicate_reviews_decision_ck CHECK (decision IN ('duplicate', 'distinct')),
  CONSTRAINT evaluation_product_duplicate_reviews_reason_ck CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  CONSTRAINT evaluation_product_duplicate_reviews_distinction_ck CHECK (decision <> 'distinct' OR length(btrim(coalesce(material_distinction, ''))) BETWEEN 1 AND 500),
  CONSTRAINT evaluation_product_duplicate_reviews_pair_uq UNIQUE (organization_id, intake_id, left_candidate_id, right_candidate_id)
);
CREATE INDEX evaluation_product_duplicate_reviews_intake_idx ON public.evaluation_product_duplicate_reviews (organization_id, intake_id, reviewed_at DESC);
ALTER TABLE public.evaluation_product_duplicate_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evaluation_product_duplicate_reviews FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r1_deny_anon_authenticated_evaluation_product_duplicate_reviews ON public.evaluation_product_duplicate_reviews
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.mmhr_review_evaluation_product_duplicate(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; review_row public.evaluation_product_duplicate_reviews%ROWTYPE; left_candidate public.evaluation_candidates%ROWTYPE; right_candidate public.evaluation_candidates%ROWTYPE; receipt jsonb; v_organization_id uuid; v_intake_id uuid; v_left_candidate_id uuid; v_right_candidate_id uuid; v_actor_id uuid; v_decision text; v_reason text; v_material_distinction text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'leftCandidateId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'rightCandidateId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'decision','') NOT IN ('duplicate','distinct') OR coalesce(payload->>'reason','') = '' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid duplicate review input'; END IF;
  v_organization_id := (payload->>'organizationId')::uuid; v_intake_id := (payload->>'intakeId')::uuid; v_left_candidate_id := (payload->>'leftCandidateId')::uuid; v_right_candidate_id := (payload->>'rightCandidateId')::uuid; v_actor_id := (payload->>'actorIdentityId')::uuid; v_decision := payload->>'decision'; v_reason := btrim(payload->>'reason'); v_material_distinction := CASE WHEN payload ? 'materialDistinction' AND jsonb_typeof(payload->'materialDistinction') <> 'null' THEN btrim(payload->>'materialDistinction') ELSE NULL END;
  IF v_left_candidate_id = v_right_candidate_id OR length(v_reason) > 500 OR (v_material_distinction IS NOT NULL AND length(v_material_distinction) > 500) OR v_decision='distinct' AND v_material_distinction IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid duplicate review input'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Review product duplicate', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.matching.duplicate.review', idempotency_key, payload);
  IF receipt IS NOT NULL THEN SELECT * INTO review_row FROM public.evaluation_product_duplicate_reviews AS r WHERE r.id=(receipt->>'entity_id')::uuid AND r.organization_id=v_organization_id; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('reviewId',review_row.id,'organizationId',review_row.organization_id,'intakeId',review_row.intake_id,'leftCandidateId',review_row.left_candidate_id,'rightCandidateId',review_row.right_candidate_id,'decision',review_row.decision,'outcomeCode','replayed','correlationId',correlation_id); END IF;
  SELECT * INTO left_candidate FROM public.evaluation_candidates AS c WHERE c.id=v_left_candidate_id AND c.organization_id=v_organization_id AND c.intake_id=v_intake_id FOR UPDATE;
  SELECT * INTO right_candidate FROM public.evaluation_candidates AS c WHERE c.id=v_right_candidate_id AND c.organization_id=v_organization_id AND c.intake_id=v_intake_id FOR UPDATE;
  IF NOT FOUND OR left_candidate.state='archived' OR right_candidate.state='archived' THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Duplicate review scope denied'; END IF;
  INSERT INTO public.evaluation_product_duplicate_reviews (organization_id, intake_id, left_candidate_id, right_candidate_id, decision, reason, material_distinction, reviewed_by_identity_id, correlation_id) VALUES (v_organization_id, v_intake_id, v_left_candidate_id, v_right_candidate_id, v_decision, v_reason, v_material_distinction, context.actor_identity_id, correlation_id) RETURNING * INTO review_row;
  IF v_decision='duplicate' THEN UPDATE public.evaluation_candidates AS c SET state='archived', revision=c.revision+1, updated_by_identity_id=context.actor_identity_id, updated_at=clock_timestamp() WHERE c.id=v_right_candidate_id AND c.organization_id=v_organization_id; END IF;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r3.matching.duplicate.review', 'matching.duplicate.review', 'duplicate_review', review_row.id, v_organization_id, 'Review product duplicate', correlation_id, idempotency_key, payload, NULL, jsonb_build_object('version',1,'state','completed'), context.authorization_time);
  RETURN jsonb_build_object('reviewId',review_row.id,'organizationId',review_row.organization_id,'intakeId',review_row.intake_id,'leftCandidateId',review_row.left_candidate_id,'rightCandidateId',review_row.right_candidate_id,'decision',review_row.decision,'outcomeCode','recorded','correlationId',correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_review_evaluation_product_duplicate(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_review_evaluation_product_duplicate(jsonb,uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_review_evaluation_product_duplicate(jsonb,uuid,uuid) IS 'R3 duplicate-product review that archives confirmed duplicate candidates without deleting evidence.';
