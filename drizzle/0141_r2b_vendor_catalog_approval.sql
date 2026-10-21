-- Additive catalog review. No commercial terms, memberships, RLS or matching rules change.
CREATE OR REPLACE FUNCTION public.mmhr_get_vendor_catalog_profile(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid; v_id uuid; profile public.vendor_profiles%ROWTYPE;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object'
    OR payload - ARRAY['organizationId','profileId'] <> '{}'::jsonb
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'profileId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN RAISE EXCEPTION 'Invalid catalog input' USING ERRCODE='22023'; END IF;
  v_org := (payload->>'organizationId')::uuid; v_id := (payload->>'profileId')::uuid;
  IF NOT mmhr_private.r1_request_has_permission('workspace.access',v_org)
    OR NOT mmhr_private.r1_request_has_permission('admin.access',NULL::uuid)
  THEN RAISE EXCEPTION 'Catalog access denied' USING ERRCODE='42501'; END IF;
  SELECT * INTO profile FROM public.vendor_profiles WHERE organization_id=v_org AND id=v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catalog access denied' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('organizationId',v_org,'profileId',v_id,'revision',profile.revision,
    'status',profile.status,'approvedAt',profile.approved_at);
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_approve_vendor_catalog_profile(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE v_org uuid; v_id uuid; profile public.vendor_profiles%ROWTYPE; context record;
  receipt jsonb; before_summary jsonb; outcome text := 'approved';
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR payload - ARRAY['organizationId','profileId','expectedRevision','reason','approvalReference'] <> '{}'::jsonb
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'profileId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR jsonb_typeof(payload->'expectedRevision') IS DISTINCT FROM 'number'
    OR coalesce(payload->>'expectedRevision','') !~ '^[1-9][0-9]{0,9}$'
    OR jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string'
    OR length(btrim(coalesce(payload->>'reason',''))) NOT BETWEEN 1 AND 500
    OR jsonb_typeof(payload->'approvalReference') IS DISTINCT FROM 'string'
    OR length(btrim(coalesce(payload->>'approvalReference',''))) NOT BETWEEN 1 AND 200
  THEN RAISE EXCEPTION 'Invalid catalog input' USING ERRCODE='22023'; END IF;
  IF (payload->>'expectedRevision')::bigint > 2147483647 THEN
    RAISE EXCEPTION 'Invalid catalog input' USING ERRCODE='22023'; END IF;
  v_org := (payload->>'organizationId')::uuid; v_id := (payload->>'profileId')::uuid;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'audit.export',v_org,payload->>'reason',correlation_id,idempotency_key);
  IF NOT mmhr_private.r1_request_has_permission('workspace.access',v_org)
    OR NOT mmhr_private.r1_request_has_permission('admin.access',NULL::uuid)
  THEN RAISE EXCEPTION 'Catalog access denied' USING ERRCODE='42501'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'vendor.catalog.approve',idempotency_key,payload);
  SELECT * INTO profile FROM public.vendor_profiles WHERE organization_id=v_org AND id=v_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catalog access denied' USING ERRCODE='42501'; END IF;
  IF receipt IS NOT NULL THEN
    IF (receipt->>'entity_id')::uuid IS DISTINCT FROM v_id THEN
      RAISE EXCEPTION 'Catalog access denied' USING ERRCODE='42501'; END IF;
    outcome := 'replayed';
  ELSE
    IF profile.revision <> (payload->>'expectedRevision')::integer OR profile.status NOT IN ('prospect','active')
      OR profile.approved_at IS NOT NULL OR profile.approved_by_identity_id IS NOT NULL
    THEN RAISE EXCEPTION 'Catalog review state changed' USING ERRCODE='42501'; END IF;
    -- Audit the approval state, not a CRM-only status outside the audit vocabulary.
    before_summary := jsonb_build_object('state','pending','version',profile.revision);
    UPDATE public.vendor_profiles SET status='active', approved_at=context.authorization_time,
      approved_by_identity_id=context.actor_identity_id, updated_by_identity_id=context.actor_identity_id,
      updated_at=context.authorization_time, revision=revision+1, correlation_id=correlation_id
    WHERE organization_id=v_org AND id=v_id RETURNING * INTO profile;
    PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'vendor.catalog.approve',
      'vendor.catalog.approve','vendor_profile',v_id,v_org,
      (payload->>'reason') || ' [reference: ' || (payload->>'approvalReference') || ']',correlation_id,idempotency_key,
      payload,before_summary,jsonb_build_object('state','approved','version',profile.revision),context.authorization_time);
  END IF;
  RETURN jsonb_build_object('organizationId',v_org,'profileId',v_id,'revision',profile.revision,'status',profile.status,
    'approvedAt',profile.approved_at,'outcomeCode',outcome,'correlationId',correlation_id);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_vendor_catalog_profile(jsonb) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_approve_vendor_catalog_profile(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_get_vendor_catalog_profile(jsonb) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_approve_vendor_catalog_profile(jsonb,uuid,uuid) TO authenticated;
