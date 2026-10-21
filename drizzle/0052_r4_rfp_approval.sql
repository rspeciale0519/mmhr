-- R4 mandatory MMHR approval for immutable RFP versions.

CREATE OR REPLACE FUNCTION public.mmhr_approve_rfp_version(payload jsonb, correlation_id uuid, idempotency_key uuid)
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
  v_approval_reference text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'rfpId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'version','') !~ '^[1-9][0-9]{0,3}$'
    OR coalesce(payload->>'approvalReference','') !~ '^approval:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP approval input'; END IF;
  v_rfp_id := (payload->>'rfpId')::uuid; v_organization_id := (payload->>'organizationId')::uuid; v_actor_id := (payload->>'actorIdentityId')::uuid; v_version := (payload->>'version')::integer; v_approval_reference := btrim(payload->>'approvalReference');
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Approve RFP version', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rfp.approve', idempotency_key, payload);
  IF receipt IS NOT NULL THEN SELECT * INTO v_rfp FROM public.rfp_versions AS r WHERE r.id = (receipt->>'entity_id')::uuid AND r.organization_id = v_organization_id; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('rfpId', v_rfp.rfp_id, 'organizationId', v_rfp.organization_id, 'sourceIntakeId', v_rfp.source_intake_id, 'version', v_rfp.version, 'status', v_rfp.status, 'approvedByIdentityId', v_rfp.approved_by_identity_id, 'approvedAt', v_rfp.approved_at, 'approvalReference', v_rfp.approval_reference, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  SELECT * INTO v_rfp FROM public.rfp_versions AS r WHERE r.rfp_id = v_rfp_id AND r.organization_id = v_organization_id AND r.version = v_version FOR UPDATE;
  IF NOT FOUND OR v_rfp.status NOT IN ('draft', 'review') OR v_rfp.created_by_identity_id = v_actor_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP approval denied'; END IF;
  UPDATE public.rfp_versions AS r SET status = 'approved', approved_by_identity_id = v_actor_id, approved_at = clock_timestamp(), approval_reference = v_approval_reference, updated_at = clock_timestamp() WHERE r.id = v_rfp.id RETURNING * INTO v_rfp;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.rfp.approve', 'rfp.approve', 'rfp_version', v_rfp.id, v_organization_id, 'Approve RFP version', correlation_id, idempotency_key, payload, jsonb_build_object('version', v_rfp.version), jsonb_build_object('version', v_rfp.version, 'state', 'approved'), context.authorization_time);
  RETURN jsonb_build_object('rfpId', v_rfp.rfp_id, 'organizationId', v_rfp.organization_id, 'sourceIntakeId', v_rfp.source_intake_id, 'version', v_rfp.version, 'status', v_rfp.status, 'approvedByIdentityId', v_rfp.approved_by_identity_id, 'approvedAt', v_rfp.approved_at, 'approvalReference', v_rfp.approval_reference, 'outcomeCode', 'approved', 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_approve_rfp_version(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_approve_rfp_version(jsonb, uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_approve_rfp_version(jsonb, uuid, uuid) IS 'R4 audited MMHR approval for an immutable organization-scoped RFP version.';
