-- Preserve the fixed audit-summary vocabulary. A failed audit keeps delivery atomic.
-- Recovery: revoke the portal delivery RPC and apply a forward correction.
CREATE OR REPLACE FUNCTION public.mmhr_deliver_rfp_to_portals(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE ctx record; v_org uuid; v_rfp public.rfp_versions%ROWTYPE; v_review jsonb; v_digest text;
  v_receipt jsonb; v_item record; v_deadline timestamptz;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid portal delivery'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(payload))<>5 OR NOT(payload ?& ARRAY['organizationId','rfpId','version','deadlineAt','expectedDigest'])
    OR coalesce(payload->>'expectedDigest','') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid portal delivery'; END IF;
  v_org := (payload->>'organizationId')::uuid; v_deadline := (payload->>'deadlineAt')::timestamptz;
  SELECT * INTO ctx FROM mmhr_private.r1_start_security_command('rfp.distribute',v_org,
    'Deliver approved RFP to vendor portals',correlation_id,idempotency_key);
  IF NOT mmhr_private.r1_request_has_permission('admin.access',NULL) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP staff access denied'; END IF;
  v_receipt := mmhr_private.r1_checked_receipt(ctx.actor_identity_id,'r4.rfp.portal_delivery',idempotency_key,payload);
  SELECT * INTO v_rfp FROM public.rfp_versions r WHERE r.organization_id=v_org
    AND r.rfp_id=(payload->>'rfpId')::uuid AND r.version=(payload->>'version')::integer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP delivery denied'; END IF;
  IF v_receipt IS NOT NULL THEN
    IF (v_receipt->>'entity_id')::uuid<>v_rfp.id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP replay denied'; END IF;
    RETURN jsonb_build_object('organizationId',v_org,'rfpId',v_rfp.rfp_id,'status','distributed','correlationId',correlation_id);
  END IF;
  IF v_deadline IS NULL OR NOT isfinite(v_deadline) OR v_deadline<=clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RFP response deadline must be in the future'; END IF;
  PERFORM 1 FROM public.intakes i WHERE i.organization_id=v_org AND i.id=v_rfp.source_intake_id FOR UPDATE;
  v_review := mmhr_private.r4_portal_delivery_review(v_org,v_rfp.source_intake_id);
  v_digest := encode(sha256(convert_to(jsonb_build_object('rfpId',v_rfp.rfp_id,'version',v_rfp.version,
    'title',v_rfp.title,'sections',v_rfp.sections,'review',v_review)::text,'UTF8')),'hex');
  IF v_rfp.status<>'approved' OR NOT mmhr_private.r4_has_mmhr_rfp_approval(v_rfp.id,v_org,v_rfp.approved_by_identity_id)
    OR (v_review->>'ready')::boolean IS DISTINCT FROM true OR v_digest IS DISTINCT FROM payload->>'expectedDigest'
    OR v_rfp.sections->0->>'sectionKey' IS DISTINCT FROM 'questionnaire' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP approval or disclosure changed'; END IF;
  FOR v_item IN SELECT DISTINCT (x->>'vendorProfileId')::uuid vendor_id,
    (x->>'vendorOrganizationId')::uuid vendor_org FROM jsonb_array_elements(v_review->'items') x LOOP
    INSERT INTO public.rfp_recipients(organization_id,rfp_version_id,vendor_profile_id,vendor_organization_id,
      state,sent_at,deadline_at,delivery_reference) VALUES(v_org,v_rfp.id,v_item.vendor_id,v_item.vendor_org,
      'distributed',clock_timestamp(),v_deadline,'portal:'||gen_random_uuid()::text);
  END LOOP;
  UPDATE public.rfp_versions SET status='distributed',updated_at=clock_timestamp() WHERE id=v_rfp.id;
  PERFORM mmhr_private.r1_finish_security_command(ctx.actor_identity_id,'r4.rfp.portal_delivery','rfp.distribute',
    'rfp_version',v_rfp.id,v_org,'Deliver approved RFP to vendor portals',correlation_id,idempotency_key,payload,
    jsonb_build_object('state','approved'),jsonb_build_object('state','completed'),ctx.authorization_time);
  RETURN jsonb_build_object('organizationId',v_org,'rfpId',v_rfp.rfp_id,'status','distributed','correlationId',correlation_id);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_deliver_rfp_to_portals(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_deliver_rfp_to_portals(jsonb,uuid,uuid) TO authenticated;
