-- R2B CRM command functions. Raw CRM tables stay closed; these fixed
-- SECURITY DEFINER functions own scope, revisions, receipts, and audit rows.

CREATE OR REPLACE FUNCTION mmhr_private.r2b_crm_result(
  operation text, record_id uuid, organization_id uuid, revision integer,
  outcome_code text, correlation_id uuid
)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'operation', $1,
    'recordId', $2,
    'organizationId', $3,
    'revision', $4,
    'outcomeCode', $5,
    'correlationId', $6
  )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION mmhr_private.r2b_crm_result(text,uuid,uuid,integer,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_create_contact(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  contact public.contacts%ROWTYPE;
  receipt jsonb;
  organization_id uuid;
  normalized_email text;
  full_name text;
  phone text;
  title text;
  status text;
BEGIN
  IF jsonb_typeof(payload) <> 'object'
    OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'organizationId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'fullName', '') = ''
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;
  organization_id := (payload->>'organizationId')::uuid;
  full_name := btrim(payload->>'fullName');
  normalized_email := CASE
    WHEN payload ? 'normalizedEmail' AND jsonb_typeof(payload->'normalizedEmail') <> 'null'
      THEN lower(btrim(payload->>'normalizedEmail'))
    ELSE NULL END;
  phone := CASE WHEN payload ? 'phone' AND jsonb_typeof(payload->'phone') <> 'null'
    THEN btrim(payload->>'phone') ELSE NULL END;
  title := CASE WHEN payload ? 'title' AND jsonb_typeof(payload->'title') <> 'null'
    THEN btrim(payload->>'title') ELSE NULL END;
  status := coalesce(payload->>'status', 'active');
  IF length(full_name) NOT BETWEEN 1 AND 200
    OR (normalized_email IS NOT NULL AND (length(normalized_email) > 254
      OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'))
    OR (phone IS NOT NULL AND length(phone) > 32)
    OR (title IS NOT NULL AND length(title) > 200)
    OR status NOT IN ('active','inactive','archived')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;

  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', organization_id, 'Create CRM contact', correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(
    context.actor_identity_id, 'crm.contact.create', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO contact FROM public.contacts c
    WHERE c.id = (receipt ->> 'entity_id')::uuid AND c.organization_id = organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    RETURN mmhr_private.r2b_crm_result('create_contact', contact.id, contact.organization_id,
      contact.revision, 'replayed', correlation_id);
  END IF;

  INSERT INTO public.contacts (
    organization_id, full_name, normalized_email, phone, title, status,
    created_by_identity_id, updated_by_identity_id, revision, correlation_id,
    created_at, updated_at
  ) VALUES (
    organization_id, full_name, normalized_email, phone, title, status::text,
    context.actor_identity_id, context.actor_identity_id, 1, correlation_id,
    context.authorization_time, context.authorization_time
  ) RETURNING * INTO contact;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'crm.contact.create', 'contact.create', 'contact',
    contact.id, organization_id, 'Create CRM contact', correlation_id, idempotency_key,
    payload, NULL, jsonb_build_object('status', contact.status, 'version', contact.revision),
    context.authorization_time);
  RETURN mmhr_private.r2b_crm_result('create_contact', contact.id, organization_id,
    contact.revision, 'created', correlation_id);
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_update_contact(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  contact public.contacts%ROWTYPE;
  before_summary jsonb;
  receipt jsonb;
  organization_id uuid;
  contact_id uuid;
  expected_revision integer;
  normalized_email text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'organizationId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'contactId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'expectedRevision', '') !~ '^[1-9][0-9]{0,9}$'
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;
  organization_id := (payload->>'organizationId')::uuid;
  contact_id := (payload->>'contactId')::uuid;
  expected_revision := (payload->>'expectedRevision')::integer;
  IF expected_revision > 2147483647
    OR NOT (payload ? 'fullName' OR payload ? 'normalizedEmail' OR payload ? 'phone'
      OR payload ? 'title' OR payload ? 'status')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;
  IF payload ? 'fullName' AND (jsonb_typeof(payload->'fullName') <> 'string'
    OR length(btrim(payload->>'fullName')) NOT BETWEEN 1 AND 200)
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;
  IF payload ? 'normalizedEmail' AND jsonb_typeof(payload->'normalizedEmail') <> 'null' THEN
    normalized_email := lower(btrim(payload->>'normalizedEmail'));
    IF length(normalized_email) > 254
      OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;
  END IF;
  IF payload ? 'phone' AND jsonb_typeof(payload->'phone') <> 'null'
    AND length(btrim(payload->>'phone')) > 32
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;
  IF payload ? 'title' AND jsonb_typeof(payload->'title') <> 'null'
    AND length(btrim(payload->>'title')) > 200
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;
  IF payload ? 'status' AND payload->>'status' NOT IN ('active','inactive','archived')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;

  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', organization_id, 'Update CRM contact', correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(
    context.actor_identity_id, 'crm.contact.update', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO contact FROM public.contacts c
    WHERE c.id = (receipt ->> 'entity_id')::uuid AND c.organization_id = organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    RETURN mmhr_private.r2b_crm_result('update_contact', contact.id, contact.organization_id,
      contact.revision, 'replayed', correlation_id);
  END IF;
  SELECT * INTO contact FROM public.contacts c
  WHERE c.id = contact_id AND c.organization_id = organization_id FOR UPDATE;
  IF NOT FOUND OR contact.revision <> expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  before_summary := jsonb_build_object('status', contact.status, 'version', contact.revision);
  UPDATE public.contacts SET
    full_name = CASE WHEN payload ? 'fullName' THEN btrim(payload->>'fullName') ELSE full_name END,
    normalized_email = CASE WHEN payload ? 'normalizedEmail'
      THEN CASE WHEN jsonb_typeof(payload->'normalizedEmail') = 'null' THEN NULL ELSE lower(btrim(payload->>'normalizedEmail')) END
      ELSE normalized_email END,
    phone = CASE WHEN payload ? 'phone'
      THEN CASE WHEN jsonb_typeof(payload->'phone') = 'null' THEN NULL ELSE btrim(payload->>'phone') END
      ELSE phone END,
    title = CASE WHEN payload ? 'title'
      THEN CASE WHEN jsonb_typeof(payload->'title') = 'null' THEN NULL ELSE btrim(payload->>'title') END
      ELSE title END,
    status = CASE WHEN payload ? 'status' THEN payload->>'status' ELSE status END,
    updated_by_identity_id = context.actor_identity_id,
    revision = contact.revision + 1,
    correlation_id = correlation_id,
    updated_at = context.authorization_time
  WHERE id = contact.id
  RETURNING * INTO contact;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'crm.contact.update', 'contact.update', 'contact',
    contact.id, organization_id, 'Update CRM contact', correlation_id, idempotency_key,
    payload, before_summary, jsonb_build_object('status', contact.status, 'version', contact.revision),
    context.authorization_time);
  RETURN mmhr_private.r2b_crm_result('update_contact', contact.id, organization_id,
    contact.revision, 'updated', correlation_id);
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_create_product(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  product public.products%ROWTYPE;
  receipt jsonb;
  organization_id uuid;
  vendor_profile_id uuid;
  stable_key text;
  name text;
  description text;
  status text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'organizationId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'vendorProfileId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'stableKey', '') !~ '^[a-z][a-z0-9_]{0,99}$'
    OR coalesce(payload->>'name', '') = ''
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;
  organization_id := (payload->>'organizationId')::uuid;
  vendor_profile_id := (payload->>'vendorProfileId')::uuid;
  stable_key := lower(btrim(payload->>'stableKey'));
  name := btrim(payload->>'name');
  description := CASE WHEN payload ? 'description' AND jsonb_typeof(payload->'description') <> 'null'
    THEN btrim(payload->>'description') ELSE NULL END;
  status := coalesce(payload->>'status', 'draft');
  IF length(name) NOT BETWEEN 1 AND 200 OR (description IS NOT NULL AND length(description) > 2000)
    OR status NOT IN ('draft','active','retired','archived')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;

  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', organization_id, 'Create CRM product', correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(
    context.actor_identity_id, 'crm.product.create', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO product FROM public.products p
    WHERE p.id = (receipt ->> 'entity_id')::uuid AND p.organization_id = organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    RETURN mmhr_private.r2b_crm_result('create_product', product.id, product.organization_id,
      product.revision, 'replayed', correlation_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendor_profiles v
    WHERE v.id = vendor_profile_id AND v.organization_id = organization_id)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  INSERT INTO public.products (
    organization_id, vendor_profile_id, stable_key, name, description, status,
    created_by_identity_id, updated_by_identity_id, revision, correlation_id,
    created_at, updated_at
  ) VALUES (
    organization_id, vendor_profile_id, stable_key, name, description, status,
    context.actor_identity_id, context.actor_identity_id, 1, correlation_id,
    context.authorization_time, context.authorization_time
  ) RETURNING * INTO product;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'crm.product.create', 'product.create', 'product',
    product.id, organization_id, 'Create CRM product', correlation_id, idempotency_key,
    payload, NULL, jsonb_build_object('status', product.status, 'version', product.revision),
    context.authorization_time);
  RETURN mmhr_private.r2b_crm_result('create_product', product.id, organization_id,
    product.revision, 'created', correlation_id);
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_update_product(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  product public.products%ROWTYPE;
  before_summary jsonb;
  receipt jsonb;
  organization_id uuid;
  product_id uuid;
  expected_revision integer;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'organizationId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'productId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'expectedRevision', '') !~ '^[1-9][0-9]{0,9}$'
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;
  organization_id := (payload->>'organizationId')::uuid;
  product_id := (payload->>'productId')::uuid;
  expected_revision := (payload->>'expectedRevision')::integer;
  IF expected_revision > 2147483647
    OR NOT (payload ? 'stableKey' OR payload ? 'name' OR payload ? 'description' OR payload ? 'status')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;
  IF payload ? 'stableKey' AND (jsonb_typeof(payload->'stableKey') <> 'string'
    OR payload->>'stableKey' !~ '^[a-z][a-z0-9_]{0,99}$')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;
  IF payload ? 'name' AND (jsonb_typeof(payload->'name') <> 'string'
    OR length(btrim(payload->>'name')) NOT BETWEEN 1 AND 200)
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;
  IF payload ? 'description' AND jsonb_typeof(payload->'description') <> 'null'
    AND length(btrim(payload->>'description')) > 2000
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;
  IF payload ? 'status' AND payload->>'status' NOT IN ('draft','active','retired','archived')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM command input'; END IF;

  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', organization_id, 'Update CRM product', correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(
    context.actor_identity_id, 'crm.product.update', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO product FROM public.products p
    WHERE p.id = (receipt ->> 'entity_id')::uuid AND p.organization_id = organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    RETURN mmhr_private.r2b_crm_result('update_product', product.id, product.organization_id,
      product.revision, 'replayed', correlation_id);
  END IF;
  SELECT * INTO product FROM public.products p
  WHERE p.id = product_id AND p.organization_id = organization_id FOR UPDATE;
  IF NOT FOUND OR product.revision <> expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  before_summary := jsonb_build_object('status', product.status, 'version', product.revision);
  UPDATE public.products SET
    stable_key = CASE WHEN payload ? 'stableKey' THEN lower(btrim(payload->>'stableKey')) ELSE stable_key END,
    name = CASE WHEN payload ? 'name' THEN btrim(payload->>'name') ELSE name END,
    description = CASE WHEN payload ? 'description'
      THEN CASE WHEN jsonb_typeof(payload->'description') = 'null' THEN NULL ELSE btrim(payload->>'description') END
      ELSE description END,
    status = CASE WHEN payload ? 'status' THEN payload->>'status' ELSE status END,
    updated_by_identity_id = context.actor_identity_id,
    revision = product.revision + 1,
    correlation_id = correlation_id,
    updated_at = context.authorization_time
  WHERE id = product.id
  RETURNING * INTO product;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'crm.product.update', 'product.update', 'product',
    product.id, organization_id, 'Update CRM product', correlation_id, idempotency_key,
    payload, before_summary, jsonb_build_object('status', product.status, 'version', product.revision),
    context.authorization_time);
  RETURN mmhr_private.r2b_crm_result('update_product', product.id, organization_id,
    product.revision, 'updated', correlation_id);
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.mmhr_create_contact(jsonb,uuid,uuid),
  public.mmhr_update_contact(jsonb,uuid,uuid),
  public.mmhr_create_product(jsonb,uuid,uuid),
  public.mmhr_update_product(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_create_contact(jsonb,uuid,uuid),
  public.mmhr_update_contact(jsonb,uuid,uuid),
  public.mmhr_create_product(jsonb,uuid,uuid),
  public.mmhr_update_product(jsonb,uuid,uuid)
  TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.mmhr_create_contact(jsonb,uuid,uuid)
  IS 'R2B audited organization-scoped contact create command.';--> statement-breakpoint
COMMENT ON FUNCTION public.mmhr_update_contact(jsonb,uuid,uuid)
  IS 'R2B audited organization-scoped optimistic contact update command.';--> statement-breakpoint
COMMENT ON FUNCTION public.mmhr_create_product(jsonb,uuid,uuid)
  IS 'R2B audited vendor-scoped product create command.';--> statement-breakpoint
COMMENT ON FUNCTION public.mmhr_update_product(jsonb,uuid,uuid)
  IS 'R2B audited organization-scoped optimistic product update command.';
