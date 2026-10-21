-- R2A corrective migration: isolate public RPC argument names from column names.

CREATE FUNCTION mmhr_private.r2a_create_lead_impl(
  p_full_name text, p_company text, p_work_email text, p_phone text,
  p_source text, p_consent_at timestamptz, p_idempotency_key uuid
)
RETURNS TABLE (lead_id uuid, status text, owner_identity_id uuid, outcome_code text, correlation_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  normalized_full_name text := btrim(p_full_name);
  normalized_company text := btrim(p_company);
  normalized_email text := lower(btrim(p_work_email));
  normalized_phone text;
  normalized_source text := lower(btrim(p_source));
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
    OR split_part(normalized_email, '@', 2) IN ('aol.com','gmail.com','hotmail.com','icloud.com','live.com','outlook.com','proton.me','protonmail.com','yahoo.com')
    OR btrim(p_phone) !~ '^\+?[0-9 ().-]{7,24}$'
    OR length(regexp_replace(btrim(p_phone), '[^0-9]', '', 'g')) NOT BETWEEN 7 AND 15
    OR normalized_source !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    OR p_idempotency_key IS NULL OR p_consent_at IS NULL
    OR p_consent_at > statement_timestamp()
  THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid, 'invalid_input'::text, event_correlation;
    RETURN;
  END IF;

  normalized_phone := CASE WHEN left(btrim(p_phone), 1) = '+' THEN '+' ELSE '' END
    || regexp_replace(btrim(p_phone), '[^0-9]', '', 'g');
  request_digest := encode(sha256(convert_to(concat_ws(chr(31), normalized_full_name,
    normalized_company, normalized_email, normalized_phone, normalized_source,
    p_consent_at::text), 'UTF8')), 'hex');

  SELECT l.* INTO existing FROM public.leads AS l
  WHERE l.idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF existing.request_digest IS DISTINCT FROM request_digest THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid, 'idempotency_conflict'::text, event_correlation;
      RETURN;
    END IF;
    RETURN QUERY SELECT existing.id, existing.status, existing.routing_owner_identity_id,
      'replayed'::text, coalesce(existing.correlation_id, event_correlation);
    RETURN;
  END IF;

  actor_identity := mmhr_private.r1_request_identity_id();
  actor_type := CASE WHEN actor_identity IS NULL THEN 'system'::public.audit_actor_type ELSE 'user'::public.audit_actor_type END;
  INSERT INTO public.leads (full_name, company, work_email, phone, source, status, consent_at,
    organization_id, routing_owner_identity_id, normalized_source, idempotency_key, request_digest, correlation_id)
  VALUES (normalized_full_name, normalized_company, normalized_email, normalized_phone, normalized_source,
    'new', p_consent_at, NULL, NULL, normalized_source, p_idempotency_key, request_digest, event_correlation)
  ON CONFLICT (idempotency_key) WHERE public.leads.idempotency_key IS NOT NULL DO NOTHING
  RETURNING * INTO new_lead;

  IF NOT FOUND THEN
    SELECT l.* INTO existing FROM public.leads AS l
    WHERE l.idempotency_key = p_idempotency_key FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lead idempotency record disappeared'; END IF;
    IF existing.request_digest IS DISTINCT FROM request_digest THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid, 'idempotency_conflict'::text, event_correlation;
      RETURN;
    END IF;
    RETURN QUERY SELECT existing.id, existing.status, existing.routing_owner_identity_id,
      'replayed'::text, coalesce(existing.correlation_id, event_correlation);
    RETURN;
  END IF;

  INSERT INTO public.audit_events (actor_type, actor_identity_id, actor_reference, organization_id,
    command, action, entity_type, entity_id, reason, correlation_id, idempotency_key, before_summary, after_summary)
  VALUES (actor_type, actor_identity, CASE WHEN actor_identity IS NULL THEN 'public-lead' ELSE NULL END,
    NULL, 'crm.leads.create', 'lead.create', 'lead', new_lead.id::text, 'Public lead captured',
    event_correlation, p_idempotency_key, NULL, jsonb_build_object('version', 1));
  RETURN QUERY SELECT new_lead.id, new_lead.status, new_lead.routing_owner_identity_id, 'created'::text, event_correlation;
END
$$;

REVOKE ALL ON FUNCTION mmhr_private.r2a_create_lead_impl(text,text,text,text,text,timestamptz,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

CREATE OR REPLACE FUNCTION public.mmhr_create_lead(
  full_name text, company text, work_email text, phone text, source text,
  consent_at timestamptz, idempotency_key uuid
)
RETURNS TABLE (lead_id uuid, status text, owner_identity_id uuid, outcome_code text, correlation_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT * FROM mmhr_private.r2a_create_lead_impl($1,$2,$3,$4,$5,$6,$7) $$;

REVOKE ALL ON FUNCTION public.mmhr_create_lead(text,text,text,text,text,timestamptz,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_create_lead(text,text,text,text,text,timestamptz,uuid) TO anon, authenticated;
COMMENT ON FUNCTION public.mmhr_create_lead(text,text,text,text,text,timestamptz,uuid)
  IS 'R2A public lead capture with normalized, idempotent, audited writes.';
