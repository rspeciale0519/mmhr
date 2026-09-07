-- R4 organization-scoped inbound response association.

ALTER TABLE public.inbound_email_events ADD COLUMN rfp_version_id uuid;
ALTER TABLE public.inbound_email_events ADD COLUMN vendor_profile_id uuid;
ALTER TABLE public.inbound_email_events ADD COLUMN association_state text NOT NULL DEFAULT 'associated';
ALTER TABLE public.inbound_email_events ADD CONSTRAINT inbound_email_rfp_version_scope_fk FOREIGN KEY (organization_id, rfp_version_id) REFERENCES public.rfp_versions (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE public.inbound_email_events ADD CONSTRAINT inbound_email_vendor_scope_fk FOREIGN KEY (organization_id, vendor_profile_id) REFERENCES public.vendor_profiles (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE public.inbound_email_events ADD CONSTRAINT inbound_email_association_state_ck CHECK (association_state IN ('associated', 'needs_attention', 'failed'));
CREATE INDEX inbound_email_organization_association_idx ON public.inbound_email_events (organization_id, rfp_version_id, vendor_profile_id);

CREATE OR REPLACE FUNCTION public.mmhr_ingest_rfp_response(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; receipt jsonb; event public.inbound_email_events%ROWTYPE; version_row public.rfp_versions%ROWTYPE;
  v_event_id uuid; v_provider_id text; v_org uuid; v_rfp_id uuid; v_vendor_id uuid; v_actor uuid; v_version integer;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'eventId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'providerEventId','') = '' OR length(payload->>'providerEventId') > 200
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'rfpId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'vendorProfileId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'version','') !~ '^[1-9][0-9]{0,3}$'
    OR coalesce(payload->>'conversationToken','') = '' OR length(payload->>'conversationToken') > 300
    OR coalesce(payload->>'senderAddress','') = '' OR length(payload->>'senderAddress') > 320
    OR jsonb_typeof(payload->'recipientAddresses') <> 'array' OR jsonb_array_length(payload->'recipientAddresses') NOT BETWEEN 1 AND 50
    OR coalesce(payload->>'bodyReference','') = '' OR length(payload->>'bodyReference') > 500
    OR jsonb_typeof(payload->'attachmentReferences') <> 'array' OR jsonb_array_length(payload->'attachmentReferences') > 50
    OR coalesce(payload->>'rawBodyHash','') !~ '^[0-9a-fA-F]{64}$'
    OR coalesce(payload->>'signature','') = '' OR length(payload->>'signature') > 500
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP response input'; END IF;
  v_event_id := (payload->>'eventId')::uuid; v_provider_id := btrim(payload->>'providerEventId'); v_org := (payload->>'organizationId')::uuid; v_rfp_id := (payload->>'rfpId')::uuid; v_vendor_id := (payload->>'vendorProfileId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_version := (payload->>'version')::integer;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Ingest RFP response', correlation_id, idempotency_key);
  IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rsp.ingest', idempotency_key, payload);
  IF receipt IS NOT NULL THEN SELECT * INTO event FROM public.inbound_email_events e WHERE e.id = (receipt->>'entity_id')::uuid AND e.organization_id = v_org; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('eventId', event.id, 'providerEventId', event.provider_event_id, 'organizationId', event.organization_id, 'rfpId', (SELECT r.rfp_id FROM public.rfp_versions r WHERE r.id = event.rfp_version_id), 'version', (SELECT r.version FROM public.rfp_versions r WHERE r.id = event.rfp_version_id), 'vendorProfileId', event.vendor_profile_id, 'associationState', event.association_state, 'receivedAt', event.received_at, 'attachmentCount', jsonb_array_length(event.attachment_references), 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  SELECT * INTO version_row FROM public.rfp_versions r WHERE r.rfp_id = v_rfp_id AND r.organization_id = v_org AND r.version = v_version;
  IF NOT FOUND OR version_row.status NOT IN ('approved','distributed') OR NOT EXISTS (SELECT 1 FROM public.vendor_profiles v WHERE v.id = v_vendor_id AND v.organization_id = v_org AND v.status = 'active') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP response association denied'; END IF;
  INSERT INTO public.inbound_email_events (id, provider_event_id, organization_id, conversation_token, sender_address, recipient_addresses, subject, body_reference, attachment_references, raw_body_hash, signed_at, received_at, signature, rfp_version_id, vendor_profile_id, association_state)
    VALUES (v_event_id, v_provider_id, v_org, btrim(payload->>'conversationToken'), btrim(payload->>'senderAddress'), payload->'recipientAddresses', NULLIF(btrim(payload->>'subject'), ''), btrim(payload->>'bodyReference'), payload->'attachmentReferences', lower(payload->>'rawBodyHash'), (payload->>'signedAt')::timestamptz, (payload->>'receivedAt')::timestamptz, btrim(payload->>'signature'), version_row.id, v_vendor_id, 'associated') RETURNING * INTO event;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.rsp.ingest', 'rsp.ingest', 'inbound_email_event', event.id, v_org, 'Ingest RFP response', correlation_id, idempotency_key, payload, jsonb_build_object('state', 'pending', 'version', version_row.version), jsonb_build_object('state', 'completed', 'version', version_row.version), context.authorization_time);
  RETURN jsonb_build_object('eventId', event.id, 'providerEventId', event.provider_event_id, 'organizationId', event.organization_id, 'rfpId', version_row.rfp_id, 'version', version_row.version, 'vendorProfileId', event.vendor_profile_id, 'associationState', event.association_state, 'receivedAt', event.received_at, 'attachmentCount', jsonb_array_length(event.attachment_references), 'outcomeCode', 'ingested', 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_ingest_rfp_response(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_ingest_rfp_response(jsonb, uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_ingest_rfp_response(jsonb, uuid, uuid) IS 'R4 audited association of signed inbound response metadata to an approved RFP and active vendor.';
