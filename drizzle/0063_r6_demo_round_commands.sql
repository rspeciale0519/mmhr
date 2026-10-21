-- R6 audited demo-round lifecycle and bounded feedback command.

CREATE OR REPLACE FUNCTION public.mmhr_record_demo_round(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; receipt jsonb; demo public.demo_rounds%ROWTYPE; v_action text; v_demo uuid; v_feedback uuid; v_org uuid; v_actor uuid; v_deal uuid; v_customer uuid; v_vendor uuid; v_status text; v_from text; v_to text; v_expected integer; v_score integer; v_reason text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR coalesce(payload->>'action','') NOT IN ('create','transition','feedback') OR correlation_id IS NULL OR idempotency_key IS NULL OR coalesce(payload->>'demoId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid demo input'; END IF;
  v_action := payload->>'action'; v_demo := (payload->>'demoId')::uuid; v_org := (payload->>'organizationId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Record demo round', correlation_id, idempotency_key);
  IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r6.demo.round', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    IF receipt->>'entity_type' = 'demo_feedback' THEN
      SELECT d.* INTO demo FROM public.demo_rounds d JOIN public.demo_feedback f ON f.organization_id=d.organization_id AND f.demo_id=d.id WHERE f.id=(receipt->>'entity_id')::uuid AND d.organization_id=v_org;
    ELSE
      SELECT * INTO demo FROM public.demo_rounds WHERE id=(receipt->>'entity_id')::uuid AND organization_id=v_org;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('demoId',demo.id,'organizationId',demo.organization_id,'status',demo.status,'revision',demo.revision,'outcomeCode','replayed','correlationId',correlation_id);
  END IF;
  IF v_action = 'create' THEN
    IF coalesce(payload->>'dealId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'customerOrganizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'vendorOrganizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'requestedByIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR payload->>'status' <> 'requested' OR payload->>'scheduledStartAt' IS NOT NULL OR payload->>'scheduledEndAt' IS NOT NULL OR payload->>'meetingReference' IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid demo create'; END IF;
    v_deal := (payload->>'dealId')::uuid; v_customer := (payload->>'customerOrganizationId')::uuid; v_vendor := (payload->>'vendorOrganizationId')::uuid;
    IF v_customer <> v_org OR v_customer = v_vendor THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Demo organization scope denied'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.id=v_deal AND d.organization_id=v_org AND d.vendor_organization_id=v_vendor) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Demo deal scope denied'; END IF;
    INSERT INTO public.demo_rounds(id, organization_id, deal_id, customer_organization_id, vendor_organization_id, requested_by_identity_id, requested_at, status, revision, correlation_id)
      VALUES(v_demo,v_org,v_deal,v_customer,v_vendor,(payload->>'requestedByIdentityId')::uuid,(payload->>'requestedAt')::timestamptz,'requested',1,correlation_id) RETURNING * INTO demo;
  ELSE
    SELECT * INTO demo FROM public.demo_rounds WHERE id=v_demo AND organization_id=v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Demo association denied'; END IF;
    IF v_action = 'transition' THEN
      v_from := payload->>'fromStatus'; v_to := payload->>'toStatus'; v_expected := (payload->>'expectedRevision')::integer; v_reason := btrim(payload->>'reason');
      IF v_from <> demo.status OR v_expected <> demo.revision OR v_to NOT IN ('scheduled','completed','cancelled','no_show') OR length(v_reason) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Demo transition denied'; END IF;
      IF (demo.status='requested' AND v_to NOT IN ('scheduled','cancelled')) OR (demo.status='scheduled' AND v_to NOT IN ('completed','cancelled','no_show')) OR demo.status IN ('completed','cancelled','no_show') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Demo transition denied'; END IF;
      IF v_to='scheduled' AND (payload->>'scheduledStartAt' IS NULL OR payload->>'scheduledEndAt' IS NULL OR btrim(coalesce(payload->>'meetingReference',''))='') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Scheduled demo requires meeting details'; END IF;
      IF v_to <> 'scheduled' AND (payload->>'scheduledStartAt' IS NOT NULL OR payload->>'scheduledEndAt' IS NOT NULL OR payload->>'meetingReference' IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Only scheduled demos may contain meeting details'; END IF;
      IF v_to='scheduled' AND (payload->>'scheduledEndAt')::timestamptz <= (payload->>'scheduledStartAt')::timestamptz THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Demo end must follow its start'; END IF;
      UPDATE public.demo_rounds SET status=v_to, revision=revision+1, scheduled_start_at=CASE WHEN v_to='scheduled' THEN (payload->>'scheduledStartAt')::timestamptz ELSE NULL END, scheduled_end_at=CASE WHEN v_to='scheduled' THEN (payload->>'scheduledEndAt')::timestamptz ELSE NULL END, meeting_reference=CASE WHEN v_to='scheduled' THEN btrim(payload->>'meetingReference') ELSE NULL END, updated_at=clock_timestamp() WHERE id=v_demo AND organization_id=v_org RETURNING * INTO demo;
      INSERT INTO public.demo_round_history(organization_id,demo_id,from_status,to_status,expected_revision,actor_identity_id,reason,occurred_at,correlation_id) VALUES(v_org,v_demo,v_from,v_to,v_expected,v_actor,v_reason,(payload->>'occurredAt')::timestamptz,correlation_id);
    ELSE
      IF coalesce(payload->>'feedbackId','') !~ '^[0-9a-fA-F-]{36}$' OR demo.status <> 'completed' OR coalesce((payload->>'score')::integer,0) NOT BETWEEN 1 AND 5 OR length(btrim(coalesce(payload->>'feedback',''))) NOT BETWEEN 1 AND 5000 OR jsonb_typeof(payload->'evidenceReferences') <> 'array' OR jsonb_array_length(payload->'evidenceReferences') > 50 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid demo feedback'; END IF;
      v_feedback := (payload->>'feedbackId')::uuid; v_score := (payload->>'score')::integer;
      INSERT INTO public.demo_feedback(id,organization_id,demo_id,submitted_by_identity_id,score,feedback,evidence_references) VALUES(v_feedback,v_org,v_demo,v_actor,v_score,btrim(payload->>'feedback'),payload->'evidenceReferences');
    END IF;
  END IF;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r6.demo.round', 'demo.' || v_action, CASE WHEN v_action='feedback' THEN 'demo_feedback' ELSE 'demo_round' END, CASE WHEN v_action='feedback' THEN v_feedback ELSE demo.id END, v_org, 'Record demo round', correlation_id, idempotency_key, payload, jsonb_build_object('status','completed'), jsonb_build_object('status','completed'), context.authorization_time);
  RETURN jsonb_build_object('demoId',demo.id,'organizationId',demo.organization_id,'status',demo.status,'revision',demo.revision,'outcomeCode','recorded','correlationId',correlation_id);
END;
$$;
REVOKE ALL ON FUNCTION public.mmhr_record_demo_round(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_demo_round(jsonb, uuid, uuid) TO authenticated;
