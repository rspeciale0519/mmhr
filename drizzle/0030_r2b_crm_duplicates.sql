-- R2B duplicate review candidates. Candidates are review-only records; this
-- migration never merges, rewrites, or deletes CRM records.

CREATE TABLE public.crm_duplicate_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  candidate_key text NOT NULL,
  resource text NOT NULL,
  left_record_id uuid NOT NULL,
  right_record_id uuid NOT NULL,
  signal text NOT NULL,
  state text NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT now(),
  detected_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL,
  CONSTRAINT crm_duplicate_candidates_candidate_key_ck CHECK (candidate_key ~ '^[a-z][a-z0-9_.:-]{1,255}$'),
  CONSTRAINT crm_duplicate_candidates_resource_ck CHECK (resource IN ('customer','vendor','product','contact','deal')),
  CONSTRAINT crm_duplicate_candidates_distinct_ck CHECK (left_record_id <> right_record_id),
  CONSTRAINT crm_duplicate_candidates_signal_ck CHECK (signal = 'normalized_key'),
  CONSTRAINT crm_duplicate_candidates_state_ck CHECK (state = 'open'),
  CONSTRAINT crm_duplicate_candidates_scope_uq UNIQUE (organization_id, candidate_key)
);--> statement-breakpoint

CREATE INDEX crm_duplicate_candidates_review_idx
  ON public.crm_duplicate_candidates (organization_id, resource, state, detected_at);--> statement-breakpoint
ALTER TABLE public.crm_duplicate_candidates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY crm_duplicate_candidates_deny_all ON public.crm_duplicate_candidates
  AS RESTRICTIVE FOR ALL TO anon, authenticated, service_role, mmhr_worker USING (false) WITH CHECK (false);--> statement-breakpoint
REVOKE ALL ON TABLE public.crm_duplicate_candidates
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r2b_duplicate_result(
  batch_id uuid, organization_id uuid, inserted_count integer,
  outcome_code text, correlation_id uuid
)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT jsonb_build_object(
  'batchId', $1, 'organizationId', $2, 'insertedCount', $3,
  'outcomeCode', $4, 'correlationId', $5) $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r2b_duplicate_result(uuid,uuid,integer,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_record_crm_duplicate_candidates(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  receipt jsonb;
  batch_id uuid;
  organization_id uuid;
  candidate jsonb;
  candidate_key text;
  resource text;
  left_record_id uuid;
  right_record_id uuid;
  inserted_count integer := 0;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'batchId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR jsonb_typeof(payload->'candidates') <> 'array'
    OR jsonb_array_length(payload->'candidates') > 500
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM duplicate input'; END IF;
  batch_id := (payload->>'batchId')::uuid;
  organization_id := (payload->>'organizationId')::uuid;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', organization_id, 'Record CRM duplicate candidates', correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'crm.duplicate.detect', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    RETURN mmhr_private.r2b_duplicate_result(batch_id, organization_id, 0, 'replayed', correlation_id);
  END IF;
  FOR candidate IN SELECT value FROM jsonb_array_elements(payload->'candidates')
  LOOP
    IF jsonb_typeof(candidate) <> 'object'
      OR coalesce(candidate->>'candidateKey','') !~ '^[a-z][a-z0-9_.:-]{1,255}$'
      OR coalesce(candidate->>'resource','') NOT IN ('customer','vendor','product','contact','deal')
      OR coalesce(candidate->>'leftRecordId','') !~ '^[0-9a-fA-F-]{36}$'
      OR coalesce(candidate->>'rightRecordId','') !~ '^[0-9a-fA-F-]{36}$'
      OR candidate->>'signal' <> 'normalized_key' OR candidate->>'state' <> 'open'
    THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM duplicate input'; END IF;
    candidate_key := candidate->>'candidateKey'; resource := candidate->>'resource';
    left_record_id := (candidate->>'leftRecordId')::uuid; right_record_id := (candidate->>'rightRecordId')::uuid;
    IF left_record_id = right_record_id THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM duplicate input';
    END IF;
    IF resource = 'contact' AND (SELECT count(*) FROM public.contacts c WHERE c.organization_id = organization_id AND c.id IN (left_record_id, right_record_id)) <> 2 THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
    ELSIF resource = 'product' AND (SELECT count(*) FROM public.products p WHERE p.organization_id = organization_id AND p.id IN (left_record_id, right_record_id)) <> 2 THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
    ELSIF resource = 'customer' AND (SELECT count(*) FROM public.customer_profiles p WHERE p.organization_id = organization_id AND p.id IN (left_record_id, right_record_id)) <> 2 THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
    ELSIF resource = 'vendor' AND (SELECT count(*) FROM public.vendor_profiles p WHERE p.organization_id = organization_id AND p.id IN (left_record_id, right_record_id)) <> 2 THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
    ELSIF resource = 'deal' AND (SELECT count(*) FROM public.deals p WHERE p.organization_id = organization_id AND p.id IN (left_record_id, right_record_id)) <> 2 THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
    END IF;
    INSERT INTO public.crm_duplicate_candidates (
      organization_id, candidate_key, resource, left_record_id, right_record_id,
      signal, detected_by_identity_id, correlation_id
    ) VALUES (
      organization_id, candidate_key, resource, left_record_id, right_record_id,
      'normalized_key', context.actor_identity_id, correlation_id
    ) ON CONFLICT DO NOTHING;
    IF FOUND THEN inserted_count := inserted_count + 1; END IF;
  END LOOP;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'crm.duplicate.detect', 'crm.duplicate.detect', 'crm_duplicate_batch',
    batch_id, organization_id, 'Record CRM duplicate candidates', correlation_id, idempotency_key,
    payload, NULL, jsonb_build_object('state', 'completed', 'version', 1), context.authorization_time);
  RETURN mmhr_private.r2b_duplicate_result(batch_id, organization_id, inserted_count, 'recorded', correlation_id);
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.mmhr_record_crm_duplicate_candidates(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_record_crm_duplicate_candidates(jsonb,uuid,uuid) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.mmhr_record_crm_duplicate_candidates(jsonb,uuid,uuid)
  IS 'R2B organization-scoped duplicate review candidate command; never merges records.';
