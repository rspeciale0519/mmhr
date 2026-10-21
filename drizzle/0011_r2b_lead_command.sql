-- R2B lead command substrate. All additions are nullable for legacy rows.
ALTER TABLE public.leads ADD COLUMN organization_id uuid;
ALTER TABLE public.leads ADD COLUMN routing_owner_identity_id uuid;
ALTER TABLE public.leads ADD COLUMN normalized_source text;
ALTER TABLE public.leads ADD COLUMN idempotency_key uuid;
ALTER TABLE public.leads ADD COLUMN request_digest text;
ALTER TABLE public.leads ADD COLUMN correlation_id uuid;
--> statement-breakpoint

ALTER TABLE public.leads
  ADD CONSTRAINT leads_organization_id_orgs_id_fk
  FOREIGN KEY (organization_id) REFERENCES public.orgs(id) ON DELETE RESTRICT;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_routing_owner_identity_id_identities_id_fk
  FOREIGN KEY (routing_owner_identity_id) REFERENCES public.identities(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX leads_idempotency_key_uq ON public.leads (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX leads_organization_status_idx ON public.leads (organization_id, status);
--> statement-breakpoint

-- Keep the legacy lead table closed to every raw runtime role. The reviewed
-- command below is the only public request boundary for lead creation.
REVOKE ALL ON TABLE public.leads
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint

-- NOT VALID preserves old status values while enforcing the contract on all
-- new rows. The constraint can be validated after a legacy data review.
ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_ck CHECK (
    status IN ('new', 'contacted', 'qualified', 'disqualified', 'converted', 'archived')
  ) NOT VALID;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_request_digest_ck CHECK (
    request_digest IS NULL OR request_digest ~ '^[0-9a-f]{64}$'
  ) NOT VALID;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_create_lead(
  full_name text,
  company text,
  work_email text,
  phone text,
  source text,
  consent_at timestamptz,
  idempotency_key uuid
)
RETURNS TABLE (
  lead_id uuid,
  status text,
  owner_identity_id uuid,
  outcome_code text,
  correlation_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_full_name text := btrim(full_name);
  normalized_company text := btrim(company);
  normalized_email text := lower(btrim(work_email));
  normalized_phone text;
  normalized_source text := lower(btrim(source));
  request_digest text;
  existing public.leads%ROWTYPE;
  new_lead public.leads%ROWTYPE;
  actor_identity uuid;
  actor_type public.audit_actor_type;
  event_correlation uuid := gen_random_uuid();
BEGIN
  IF normalized_full_name = '' OR length(normalized_full_name) > 200
    OR normalized_company = '' OR length(normalized_company) > 200
    OR normalized_email = '' OR length(normalized_email) > 320
    OR normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    OR split_part(normalized_email, '@', 2) IN
      ('aol.com', 'gmail.com', 'hotmail.com', 'icloud.com', 'live.com',
       'outlook.com', 'proton.me', 'protonmail.com', 'yahoo.com')
    OR btrim(phone) !~ '^\+?[0-9 ().-]{7,24}$'
    OR length(regexp_replace(btrim(phone), '[^0-9]', '', 'g')) NOT BETWEEN 7 AND 15
    OR normalized_source !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    OR idempotency_key IS NULL
    OR consent_at IS NULL
    OR consent_at > statement_timestamp()
  THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid,
      'invalid_input'::text, event_correlation;
    RETURN;
  END IF;

  normalized_phone := CASE WHEN left(btrim(phone), 1) = '+' THEN '+' ELSE '' END
    || regexp_replace(btrim(phone), '[^0-9]', '', 'g');
  request_digest := encode(sha256(convert_to(
    concat_ws(chr(31), normalized_full_name, normalized_company,
      normalized_email, normalized_phone, normalized_source,
      consent_at::text), 'UTF8')), 'hex');

  SELECT * INTO existing FROM public.leads
  WHERE public.leads.idempotency_key = mmhr_create_lead.idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF existing.request_digest IS DISTINCT FROM request_digest THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid,
        'idempotency_conflict'::text, event_correlation;
      RETURN;
    END IF;
    RETURN QUERY SELECT existing.id, existing.status, existing.routing_owner_identity_id,
      'replayed'::text, coalesce(existing.correlation_id, event_correlation);
    RETURN;
  END IF;

  actor_identity := mmhr_private.r1_request_identity_id();
  actor_type := CASE WHEN actor_identity IS NULL THEN 'system'::public.audit_actor_type
    ELSE 'user'::public.audit_actor_type END;

  INSERT INTO public.leads (
    full_name, company, work_email, phone, source, status, consent_at,
    organization_id, routing_owner_identity_id, normalized_source,
    idempotency_key, request_digest, correlation_id
  ) VALUES (
    normalized_full_name, normalized_company, normalized_email, normalized_phone,
    normalized_source, 'new', consent_at, NULL, NULL, normalized_source,
    mmhr_create_lead.idempotency_key, request_digest, event_correlation
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING * INTO new_lead;

  IF NOT FOUND THEN
    SELECT * INTO existing FROM public.leads
    WHERE public.leads.idempotency_key = mmhr_create_lead.idempotency_key
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lead idempotency record disappeared';
    END IF;
    IF existing.request_digest IS DISTINCT FROM request_digest THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid,
        'idempotency_conflict'::text, event_correlation;
      RETURN;
    END IF;
    RETURN QUERY SELECT existing.id, existing.status, existing.routing_owner_identity_id,
      'replayed'::text, coalesce(existing.correlation_id, event_correlation);
    RETURN;
  END IF;

  INSERT INTO public.audit_events (
    actor_type, actor_identity_id, actor_reference, organization_id,
    command, action, entity_type, entity_id, reason, correlation_id,
    idempotency_key, before_summary, after_summary
  ) VALUES (
    actor_type, actor_identity, CASE WHEN actor_identity IS NULL THEN 'public-lead' ELSE NULL END,
    NULL, 'crm.leads.create', 'lead.create', 'lead', new_lead.id::text,
    'Public lead captured', event_correlation, mmhr_create_lead.idempotency_key,
    NULL, jsonb_build_object('status', new_lead.status, 'source', normalized_source)
  );

  RETURN QUERY SELECT new_lead.id, new_lead.status, new_lead.routing_owner_identity_id,
    'created'::text, event_correlation;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.mmhr_create_lead(text, text, text, text, text, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_create_lead(text, text, text, text, text, timestamptz, uuid)
  TO anon, authenticated;
