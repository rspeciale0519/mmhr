-- R2B permitted vendor source registry metadata and audited lifecycle commands.
ALTER TABLE public.vendor_sources
  ADD COLUMN IF NOT EXISTS owner_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS capture_method text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS cadence_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS review_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();--> statement-breakpoint
ALTER TABLE public.vendor_sources
  ADD CONSTRAINT vendor_sources_capture_method_ck CHECK (capture_method IN ('api','web','document','email','manual','other')),
  ADD CONSTRAINT vendor_sources_cadence_ck CHECK (cadence_days BETWEEN 1 AND 3650),
  ADD CONSTRAINT vendor_sources_revision_ck CHECK (revision > 0),
  ADD CONSTRAINT vendor_sources_updated_at_ck CHECK (updated_at >= created_at);--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_record_vendor_source(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; item public.vendor_sources%ROWTYPE; v_org uuid; v_actor uuid; v_id uuid; v_action text; v_revision integer;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR payload->>'action' NOT IN ('create','retire')
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'sourceId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR correlation_id IS NULL OR idempotency_key IS NULL
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid vendor source input'; END IF;
  v_org := (payload->>'organizationId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_id := (payload->>'sourceId')::uuid; v_action := payload->>'action';
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Record vendor source', correlation_id, idempotency_key);
  IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r2b.vendor.source', idempotency_key, payload);
  IF receipt IS NOT NULL THEN RETURN jsonb_build_object('sourceId', receipt->>'entity_id', 'organizationId', v_org, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  IF v_action = 'create' THEN
    IF coalesce(payload->>'vendorProfileId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'uri','') !~ '^https://'
      OR payload->>'sourceType' NOT IN ('vendor_owned','licensed','manual') OR payload->>'captureMethod' NOT IN ('api','web','document','email','manual','other')
      OR coalesce(payload->>'capturedAt','') = '' OR coalesce((payload->>'cadenceDays')::integer, 0) NOT BETWEEN 1 AND 3650
      OR length(coalesce(payload->>'licenseNote','')) > 500 OR payload->>'ownerIdentityId' IS NULL
    THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid vendor source metadata'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.vendor_profiles v WHERE v.organization_id = v_org AND v.id = (payload->>'vendorProfileId')::uuid) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Vendor source scope denied'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.identities i WHERE i.id = (payload->>'ownerIdentityId')::uuid AND i.status = 'active') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Vendor source owner denied'; END IF;
    INSERT INTO public.vendor_sources (id, organization_id, vendor_profile_id, uri, source_type, license_note, captured_at, active, created_by_identity_id, owner_identity_id, capture_method, cadence_days, review_required, revision, updated_at)
      VALUES (v_id, v_org, (payload->>'vendorProfileId')::uuid, payload->>'uri', payload->>'sourceType', NULLIF(payload->>'licenseNote',''), (payload->>'capturedAt')::timestamptz, true, v_actor, (payload->>'ownerIdentityId')::uuid, payload->>'captureMethod', (payload->>'cadenceDays')::integer, coalesce((payload->>'reviewRequired')::boolean, true), 1, clock_timestamp()) RETURNING * INTO item;
  ELSE
    v_revision := (payload->>'expectedRevision')::integer;
    IF v_revision IS NULL OR v_revision <= 0 OR coalesce(payload->>'reason','') = '' OR length(payload->>'reason') > 500 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid vendor source retirement'; END IF;
    SELECT * INTO item FROM public.vendor_sources WHERE id = v_id AND organization_id = v_org FOR UPDATE;
    IF NOT FOUND OR item.revision <> v_revision OR NOT item.active THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Vendor source is stale'; END IF;
    UPDATE public.vendor_sources SET active = false, revision = revision + 1, updated_at = clock_timestamp() WHERE id = v_id AND organization_id = v_org RETURNING * INTO item;
  END IF;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r2b.vendor.source', 'vendor.source.' || v_action, 'vendor_source', item.id, v_org, 'Record vendor source', correlation_id, idempotency_key, payload, CASE WHEN v_action = 'create' THEN NULL ELSE jsonb_build_object('state','active') END, jsonb_build_object('state', CASE WHEN item.active THEN 'active' ELSE 'retired' END), context.authorization_time);
  RETURN jsonb_build_object('sourceId', item.id, 'organizationId', item.organization_id, 'active', item.active, 'revision', item.revision, 'outcomeCode', 'recorded', 'correlationId', correlation_id);
END; $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_record_vendor_source(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker; GRANT EXECUTE ON FUNCTION public.mmhr_record_vendor_source(jsonb,uuid,uuid) TO authenticated;
