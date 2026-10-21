-- R4 bounded response normalization. Results remain pending until human review.

CREATE UNIQUE INDEX IF NOT EXISTS inbound_email_organization_id_id_uq ON public.inbound_email_events (organization_id, id);

CREATE TABLE public.rfp_response_normalizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  inbound_event_id uuid NOT NULL, rfp_version_id uuid NOT NULL, vendor_profile_id uuid NOT NULL,
  supported_requirements jsonb NOT NULL DEFAULT '[]'::jsonb, unsupported_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  caveats jsonb NOT NULL DEFAULT '[]'::jsonb, dependencies jsonb NOT NULL DEFAULT '[]'::jsonb, commitments jsonb NOT NULL DEFAULT '[]'::jsonb,
  implementation_details jsonb NOT NULL DEFAULT '[]'::jsonb, missing_answers jsonb NOT NULL DEFAULT '[]'::jsonb, proposed_follow_ups jsonb NOT NULL DEFAULT '[]'::jsonb,
  state text NOT NULL DEFAULT 'pending', created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfp_response_normalizations_event_scope_fk FOREIGN KEY (organization_id, inbound_event_id) REFERENCES public.inbound_email_events (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT rfp_response_normalizations_version_scope_fk FOREIGN KEY (organization_id, rfp_version_id) REFERENCES public.rfp_versions (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT rfp_response_normalizations_vendor_scope_fk FOREIGN KEY (organization_id, vendor_profile_id) REFERENCES public.vendor_profiles (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT rfp_response_normalizations_state_ck CHECK (state IN ('pending', 'reviewed', 'approved', 'rejected')),
  CONSTRAINT rfp_response_normalizations_arrays_ck CHECK (jsonb_typeof(supported_requirements) = 'array' AND jsonb_typeof(unsupported_requirements) = 'array' AND jsonb_typeof(caveats) = 'array' AND jsonb_typeof(dependencies) = 'array' AND jsonb_typeof(commitments) = 'array' AND jsonb_typeof(implementation_details) = 'array' AND jsonb_typeof(missing_answers) = 'array' AND jsonb_typeof(proposed_follow_ups) = 'array'),
  CONSTRAINT rfp_response_normalizations_count_ck CHECK (jsonb_array_length(supported_requirements) <= 100 AND jsonb_array_length(unsupported_requirements) <= 100 AND jsonb_array_length(caveats) <= 100 AND jsonb_array_length(dependencies) <= 100 AND jsonb_array_length(commitments) <= 100 AND jsonb_array_length(implementation_details) <= 100 AND jsonb_array_length(missing_answers) <= 100 AND jsonb_array_length(proposed_follow_ups) <= 100)
);
CREATE UNIQUE INDEX rfp_response_normalizations_organization_id_uq ON public.rfp_response_normalizations (organization_id, id);
CREATE INDEX rfp_response_normalizations_event_idx ON public.rfp_response_normalizations (organization_id, inbound_event_id);
ALTER TABLE public.rfp_response_normalizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rfp_response_normalizations FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r1_deny_anon_authenticated_rfp_response_normalizations ON public.rfp_response_normalizations AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.mmhr_record_rfp_response_normalization(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; receipt jsonb; normalization public.rfp_response_normalizations%ROWTYPE; event public.inbound_email_events%ROWTYPE; version_row public.rfp_versions%ROWTYPE; v_id uuid; v_org uuid; v_actor uuid; v_event_id uuid; v_rfp_id uuid; v_vendor_id uuid; v_version integer; v_fields text[] := ARRAY['supportedRequirements','unsupportedRequirements','caveats','dependencies','commitments','implementationDetails','missingAnswers','proposedFollowUps']; v_key text; v_value jsonb;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL OR coalesce(payload->>'normalizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'eventId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'rfpId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'vendorProfileId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'version','') !~ '^[1-9][0-9]{0,3}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP normalization input'; END IF;
  v_id := (payload->>'normalizationId')::uuid; v_event_id := (payload->>'eventId')::uuid; v_org := (payload->>'organizationId')::uuid; v_rfp_id := (payload->>'rfpId')::uuid; v_vendor_id := (payload->>'vendorProfileId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_version := (payload->>'version')::integer;
  FOREACH v_key IN ARRAY v_fields LOOP v_value := payload -> v_key; IF v_value IS NULL OR jsonb_typeof(v_value) <> 'array' OR jsonb_array_length(v_value) > 100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP normalization fields'; END IF; END LOOP;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Record RFP response normalization', correlation_id, idempotency_key); IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rsp.normalize', idempotency_key, payload); IF receipt IS NOT NULL THEN SELECT * INTO normalization FROM public.rfp_response_normalizations n WHERE n.id = (receipt->>'entity_id')::uuid AND n.organization_id = v_org; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('normalizationId', normalization.id, 'eventId', normalization.inbound_event_id, 'organizationId', normalization.organization_id, 'rfpId', (SELECT r.rfp_id FROM public.rfp_versions r WHERE r.id = normalization.rfp_version_id), 'version', (SELECT r.version FROM public.rfp_versions r WHERE r.id = normalization.rfp_version_id), 'vendorProfileId', normalization.vendor_profile_id, 'state', normalization.state, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  SELECT * INTO event FROM public.inbound_email_events e WHERE e.id = v_event_id AND e.organization_id = v_org; IF NOT FOUND OR event.rfp_version_id IS NULL OR event.vendor_profile_id <> v_vendor_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP normalization association denied'; END IF;
  SELECT * INTO version_row FROM public.rfp_versions r WHERE r.id = event.rfp_version_id AND r.rfp_id = v_rfp_id AND r.version = v_version AND r.organization_id = v_org; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP normalization association denied'; END IF;
  INSERT INTO public.rfp_response_normalizations (id, organization_id, inbound_event_id, rfp_version_id, vendor_profile_id, supported_requirements, unsupported_requirements, caveats, dependencies, commitments, implementation_details, missing_answers, proposed_follow_ups, created_by_identity_id) VALUES (v_id, v_org, event.id, version_row.id, v_vendor_id, payload->'supportedRequirements', payload->'unsupportedRequirements', payload->'caveats', payload->'dependencies', payload->'commitments', payload->'implementationDetails', payload->'missingAnswers', payload->'proposedFollowUps', v_actor) RETURNING * INTO normalization;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.rsp.normalize', 'rsp.normalize', 'rfp_response_normalization', normalization.id, v_org, 'Record RFP response normalization', correlation_id, idempotency_key, payload, jsonb_build_object('state', 'pending', 'version', version_row.version), jsonb_build_object('state', 'pending', 'version', version_row.version), context.authorization_time);
  RETURN jsonb_build_object('normalizationId', normalization.id, 'eventId', normalization.inbound_event_id, 'organizationId', normalization.organization_id, 'rfpId', version_row.rfp_id, 'version', version_row.version, 'vendorProfileId', normalization.vendor_profile_id, 'state', normalization.state, 'outcomeCode', 'recorded', 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_record_rfp_response_normalization(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_rfp_response_normalization(jsonb, uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_record_rfp_response_normalization(jsonb, uuid, uuid) IS 'R4 audited bounded response extraction that remains pending until human review.';
