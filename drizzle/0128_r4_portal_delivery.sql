-- Local-first vendor portal delivery. No email is sent by these functions.
-- Apply with 0129 before serving the new routes. Recovery: revoke RPC execution,
-- preserve approved documents and recipient history, and correct forward.
CREATE FUNCTION public.mmhr_create_rfp_questionnaire(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE ctx record; v_org uuid; v_result jsonb;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid questionnaire';
  END IF;
  IF NOT (payload ?& ARRAY['organizationId','intakeId','rfpId','sourceRevision','title','content'])
    OR (SELECT count(*) FROM jsonb_object_keys(payload))<>6
    OR jsonb_typeof(payload->'content') IS DISTINCT FROM 'string'
    OR length(btrim(coalesce(payload->>'content',''))) NOT BETWEEN 10 AND 30000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid questionnaire';
  END IF;
  v_org := (payload->>'organizationId')::uuid;
  SELECT * INTO ctx FROM mmhr_private.r1_start_security_command('rfp.approve',v_org,
    'Prepare RFP questionnaire',correlation_id,idempotency_key);
  IF NOT mmhr_private.r1_request_has_permission('admin.access',NULL) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP staff access denied';
  END IF;
  v_result := public.mmhr_create_rfp_version(jsonb_build_object('organizationId',v_org,
    'intakeId',payload->>'intakeId','rfpId',payload->>'rfpId','sourceRevision',payload->'sourceRevision',
    'actorIdentityId',ctx.actor_identity_id,'version',1,'title',payload->>'title',
    'sections',jsonb_build_array(jsonb_build_object('sectionKey','questionnaire','title','Requirements and questions',
      'questionCount',1,'content',btrim(payload->>'content')))),correlation_id,idempotency_key);
  RETURN jsonb_build_object('organizationId',v_org,'rfpId',v_result->>'rfpId',
    'status',v_result->>'status','correlationId',correlation_id);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_create_rfp_questionnaire(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_create_rfp_questionnaire(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint

CREATE FUNCTION mmhr_private.r4_portal_delivery_review(v_org uuid,v_intake uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_items jsonb; v_ready boolean;
BEGIN
  WITH candidates AS (
    SELECT c.*, mmhr_private.r3_disclosure_snapshot(v_org,v_intake,c.id) snapshot
    FROM public.evaluation_candidates c WHERE c.organization_id=v_org AND c.intake_id=v_intake
      AND c.state IN ('proposed','active','selected')
  ), reviewed AS (
    SELECT c.id,c.snapshot,d.id disclosure_id,d.provider_name,d.product_name,
      p.vendor_profile_id,c.vendor_organization_id
    FROM candidates c
    LEFT JOIN LATERAL (SELECT d.* FROM public.evaluation_disclosures d
      WHERE d.organization_id=v_org AND d.intake_id=v_intake AND d.candidate_id=c.id
        AND d.review_digest=encode(sha256(convert_to(c.snapshot::text,'UTF8')),'hex')
      ORDER BY d.disclosed_at DESC,d.id DESC LIMIT 1) d ON true
    LEFT JOIN public.products p ON p.organization_id=c.vendor_organization_id AND p.id=c.product_id
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('candidateId',id,'disclosureId',disclosure_id,
      'providerName',provider_name,'productName',product_name,'vendorProfileId',vendor_profile_id,
      'vendorOrganizationId',vendor_organization_id) ORDER BY id),'[]'::jsonb),
    coalesce(bool_and(disclosure_id IS NOT NULL AND (snapshot->>'canDisclose')::boolean IS TRUE),false)
    INTO v_items,v_ready FROM reviewed;
  RETURN jsonb_build_object('items',v_items,'ready',v_ready AND jsonb_array_length(v_items)>0);
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_portal_delivery_review(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
--> statement-breakpoint

CREATE FUNCTION public.mmhr_get_rfp_workflow(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE v_org uuid; v_intake uuid; v_rows jsonb; v_review jsonb;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid RFP read'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(payload))<>2 OR NOT(payload ?& ARRAY['organizationId','intakeId']) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid RFP read'; END IF;
  v_org := (payload->>'organizationId')::uuid; v_intake := (payload->>'intakeId')::uuid;
  PERFORM mmhr_private.r1_lock_security();
  IF NOT mmhr_private.r1_request_has_permission('workspace.access',v_org)
    OR NOT EXISTS(SELECT 1 FROM public.intakes i WHERE i.organization_id=v_org AND i.id=v_intake) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP read denied'; END IF;
  v_review := mmhr_private.r4_portal_delivery_review(v_org,v_intake);
  SELECT coalesce(jsonb_agg(jsonb_build_object('rfpId',r.rfp_id,'version',r.version,'title',r.title,
    'status',r.status,'content',r.sections->0->>'content','createdByIdentityId',r.created_by_identity_id,
    'approvedByIdentityId',r.approved_by_identity_id,'approvedAt',r.approved_at,
    'recipientCount',(SELECT count(*) FROM public.rfp_recipients rr WHERE rr.organization_id=v_org AND rr.rfp_version_id=r.id),
    'deliveryDigest',encode(sha256(convert_to(jsonb_build_object('rfpId',r.rfp_id,'version',r.version,
      'title',r.title,'sections',r.sections,'review',v_review)::text,'UTF8')),'hex')) ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb)
    INTO v_rows FROM public.rfp_versions r WHERE r.organization_id=v_org AND r.source_intake_id=v_intake
      AND r.sections->0->>'sectionKey'='questionnaire';
  RETURN jsonb_build_object('organizationId',v_org,'intakeId',v_intake,'rfps',v_rows,
    'readyToDeliver',(v_review->>'ready')::boolean,'selectedCount',jsonb_array_length(v_review->'items'),
    'correlationId',correlation_id);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_rfp_workflow(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_rfp_workflow(jsonb,uuid) TO authenticated;
--> statement-breakpoint

CREATE FUNCTION public.mmhr_deliver_rfp_to_portals(payload jsonb,correlation_id uuid,idempotency_key uuid)
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
    jsonb_build_object('state','approved'),jsonb_build_object('state','distributed'),ctx.authorization_time);
  RETURN jsonb_build_object('organizationId',v_org,'rfpId',v_rfp.rfp_id,'status','distributed','correlationId',correlation_id);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_deliver_rfp_to_portals(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_deliver_rfp_to_portals(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint

CREATE FUNCTION public.mmhr_get_vendor_rfps(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE v_org uuid; v_after uuid; v_rows jsonb; v_cursor uuid;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid vendor inbox'; END IF;
  IF NOT(payload ? 'organizationId') OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('organizationId','afterId')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid vendor inbox'; END IF;
  v_org := (payload->>'organizationId')::uuid; v_after := (payload->>'afterId')::uuid;
  PERFORM mmhr_private.r1_lock_security();
  IF NOT mmhr_private.r1_request_has_permission('portal.vendor.access',v_org) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Vendor inbox denied'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('recipientId',p.id,'title',p.title,'content',p.content,
    'version',p.version,'sentAt',p.sent_at,'deadlineAt',p.deadline_at) ORDER BY p.id),'[]'::jsonb)
    INTO v_rows FROM (SELECT rr.id,r.title,r.sections->0->>'content' content,r.version,rr.sent_at,rr.deadline_at
      FROM public.rfp_recipients rr JOIN public.rfp_versions r ON r.organization_id=rr.organization_id AND r.id=rr.rfp_version_id
      JOIN public.vendor_profiles vp ON vp.organization_id=rr.vendor_organization_id AND vp.id=rr.vendor_profile_id AND vp.status='active'
      WHERE rr.vendor_organization_id=v_org AND rr.state IN ('distributed','acknowledged','responded')
        AND r.status IN ('distributed','closed') AND r.sections->0->>'sectionKey'='questionnaire'
        AND (v_after IS NULL OR rr.id>v_after) ORDER BY rr.id LIMIT 26) p;
  IF jsonb_array_length(v_rows)>25 THEN v_rows := v_rows-25; v_cursor := (v_rows->24->>'recipientId')::uuid; END IF;
  RETURN jsonb_build_object('organizationId',v_org,'items',v_rows,'nextCursor',v_cursor,'correlationId',correlation_id);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_vendor_rfps(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_vendor_rfps(jsonb,uuid) TO authenticated;
