-- R4 audited distribution records for approved RFP versions.

ALTER TABLE public.rfp_recipients ADD COLUMN deadline_at timestamptz;
ALTER TABLE public.rfp_recipients ADD COLUMN reminder_at timestamptz;
ALTER TABLE public.rfp_recipients ADD COLUMN acknowledged_at timestamptz;
ALTER TABLE public.rfp_recipients ADD COLUMN delivery_reference text;
ALTER TABLE public.rfp_recipients ADD CONSTRAINT rfp_recipients_vendor_scope_fk
  FOREIGN KEY (organization_id, vendor_profile_id)
  REFERENCES public.vendor_profiles (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE public.rfp_recipients ADD CONSTRAINT rfp_recipients_delivery_dates_ck
  CHECK (reminder_at IS NULL OR deadline_at IS NULL OR reminder_at <= deadline_at);
ALTER TABLE public.rfp_recipients ADD CONSTRAINT rfp_recipients_delivery_reference_ck
  CHECK (delivery_reference IS NULL OR length(btrim(delivery_reference)) BETWEEN 1 AND 300);

CREATE OR REPLACE FUNCTION public.mmhr_distribute_rfp_version(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  receipt jsonb;
  v_rfp public.rfp_versions%ROWTYPE;
  v_rfp_id uuid;
  v_organization_id uuid;
  v_actor_id uuid;
  v_version integer;
  v_recipients jsonb;
  v_item jsonb;
  v_recipient_id uuid;
  v_vendor_id uuid;
  v_deadline timestamptz;
  v_reminder timestamptz;
  v_reference text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'rfpId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'version','') !~ '^[1-9][0-9]{0,3}$'
    OR jsonb_typeof(payload->'recipients') <> 'array'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP distribution input'; END IF;
  v_rfp_id := (payload->>'rfpId')::uuid;
  v_organization_id := (payload->>'organizationId')::uuid;
  v_actor_id := (payload->>'actorIdentityId')::uuid;
  v_version := (payload->>'version')::integer;
  v_recipients := payload->'recipients';
  IF jsonb_array_length(v_recipients) NOT BETWEEN 1 AND 100
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_recipients) AS item
      WHERE jsonb_typeof(item) <> 'object'
        OR coalesce(item->>'recipientId','') !~ '^[0-9a-fA-F-]{36}$'
        OR coalesce(item->>'vendorProfileId','') !~ '^[0-9a-fA-F-]{36}$'
        OR coalesce(item->>'deadlineAt','') = ''
        OR coalesce(item->>'deliveryReference','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$')
    OR (SELECT count(*) FROM (SELECT item->>'recipientId' AS key FROM jsonb_array_elements(v_recipients) AS item GROUP BY item->>'recipientId' HAVING count(*) > 1) AS duplicates) > 0
    OR (SELECT count(*) FROM (SELECT item->>'vendorProfileId' AS key FROM jsonb_array_elements(v_recipients) AS item GROUP BY item->>'vendorProfileId' HAVING count(*) > 1) AS duplicates) > 0
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP distribution recipients'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Distribute RFP version', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rfp.distribute', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO v_rfp FROM public.rfp_versions AS r WHERE r.id = (receipt->>'entity_id')::uuid AND r.organization_id = v_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('rfpId', v_rfp.rfp_id, 'organizationId', v_rfp.organization_id, 'version', v_rfp.version, 'status', v_rfp.status,
      'recipients', (SELECT coalesce(jsonb_agg(jsonb_build_object('recipientId', rr.id, 'vendorProfileId', rr.vendor_profile_id, 'state', rr.state, 'sentAt', rr.sent_at, 'deadlineAt', rr.deadline_at, 'reminderAt', rr.reminder_at, 'acknowledgedAt', rr.acknowledged_at, 'deliveryReference', rr.delivery_reference) ORDER BY rr.id), '[]'::jsonb) FROM public.rfp_recipients AS rr WHERE rr.organization_id = v_organization_id AND rr.rfp_version_id = v_rfp.id),
      'outcomeCode', 'replayed', 'correlationId', correlation_id);
  END IF;
  SELECT * INTO v_rfp FROM public.rfp_versions AS r WHERE r.rfp_id = v_rfp_id AND r.organization_id = v_organization_id AND r.version = v_version FOR UPDATE;
  IF NOT FOUND OR v_rfp.status <> 'approved' OR v_rfp.approved_by_identity_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP distribution denied'; END IF;
  IF (SELECT count(*) FROM public.vendor_profiles AS v WHERE v.organization_id = v_organization_id AND v.status = 'active' AND v.id IN (SELECT (item->>'vendorProfileId')::uuid FROM jsonb_array_elements(v_recipients) AS item)) <> jsonb_array_length(v_recipients)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP recipient denied'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_recipients) LOOP
    v_recipient_id := (v_item->>'recipientId')::uuid;
    v_vendor_id := (v_item->>'vendorProfileId')::uuid;
    v_deadline := (v_item->>'deadlineAt')::timestamptz;
    v_reminder := CASE WHEN v_item ? 'reminderAt' AND jsonb_typeof(v_item->'reminderAt') <> 'null' THEN (v_item->>'reminderAt')::timestamptz ELSE NULL END;
    v_reference := btrim(v_item->>'deliveryReference');
    IF v_reminder IS NOT NULL AND v_reminder > v_deadline THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP reminder time'; END IF;
    INSERT INTO public.rfp_recipients (id, organization_id, rfp_version_id, vendor_profile_id, state, sent_at, deadline_at, reminder_at, delivery_reference)
      VALUES (v_recipient_id, v_organization_id, v_rfp.id, v_vendor_id, 'distributed', clock_timestamp(), v_deadline, v_reminder, v_reference);
  END LOOP;
  UPDATE public.rfp_versions SET status = 'distributed', updated_at = clock_timestamp() WHERE id = v_rfp.id;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.rfp.distribute', 'rfp.distribute', 'rfp_version', v_rfp.id, v_organization_id, 'Distribute RFP version', correlation_id, idempotency_key, payload, jsonb_build_object('status', v_rfp.status), jsonb_build_object('state', 'completed', 'version', v_rfp.version), context.authorization_time);
  RETURN jsonb_build_object('rfpId', v_rfp.rfp_id, 'organizationId', v_rfp.organization_id, 'version', v_rfp.version, 'status', 'distributed',
    'recipients', (SELECT coalesce(jsonb_agg(jsonb_build_object('recipientId', rr.id, 'vendorProfileId', rr.vendor_profile_id, 'state', rr.state, 'sentAt', rr.sent_at, 'deadlineAt', rr.deadline_at, 'reminderAt', rr.reminder_at, 'acknowledgedAt', rr.acknowledged_at, 'deliveryReference', rr.delivery_reference) ORDER BY rr.id), '[]'::jsonb) FROM public.rfp_recipients AS rr WHERE rr.organization_id = v_organization_id AND rr.rfp_version_id = v_rfp.id),
    'outcomeCode', 'distributed', 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_distribute_rfp_version(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_distribute_rfp_version(jsonb, uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_distribute_rfp_version(jsonb, uuid, uuid) IS 'R4 audited organization-scoped distribution record for approved RFP versions.';
