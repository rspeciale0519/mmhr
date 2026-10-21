-- Product decision: separate RFP approval is optional while MMHR has two staff.
-- Database-owner configuration only. Existing approvals and delivery remain valid.
-- Recovery: set require_separate_approval=true under r1_lock_security(), then
-- correct forward. Do not delete approval, audit, or delivery records.
SELECT mmhr_private.r1_lock_security();
--> statement-breakpoint
CREATE TABLE mmhr_private.rfp_approval_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  require_separate_approval boolean NOT NULL DEFAULT true
);
REVOKE ALL ON TABLE mmhr_private.rfp_approval_policy FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
INSERT INTO mmhr_private.rfp_approval_policy(singleton,require_separate_approval) VALUES(true,false);
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_requires_separate_approval()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT require_separate_approval FROM mmhr_private.rfp_approval_policy WHERE singleton),true)
$$;
REVOKE ALL ON FUNCTION mmhr_private.r4_requires_separate_approval() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
--> statement-breakpoint
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
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('rfp.approve', v_organization_id, 'Approve RFP version', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rfp.approve', idempotency_key, payload);
  IF receipt IS NOT NULL AND NOT mmhr_private.r4_has_mmhr_rfp_approval(
    (receipt->>'entity_id')::uuid,v_organization_id,v_actor_id)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP requires MMHR review with a new command key'; END IF;
  IF receipt IS NOT NULL THEN SELECT * INTO v_rfp FROM public.rfp_versions AS r WHERE r.id = (receipt->>'entity_id')::uuid AND r.organization_id = v_organization_id; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('rfpId', v_rfp.rfp_id, 'organizationId', v_rfp.organization_id, 'sourceIntakeId', v_rfp.source_intake_id, 'version', v_rfp.version, 'status', v_rfp.status, 'approvedByIdentityId', v_rfp.approved_by_identity_id, 'approvedAt', v_rfp.approved_at, 'approvalReference', v_rfp.approval_reference, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  SELECT * INTO v_rfp FROM public.rfp_versions AS r WHERE r.rfp_id = v_rfp_id AND r.organization_id = v_organization_id AND r.version = v_version FOR UPDATE;
  IF NOT FOUND OR v_rfp.status NOT IN ('draft', 'review', 'approved') OR (v_rfp.status = 'approved' AND mmhr_private.r4_has_mmhr_rfp_approval(v_rfp.id,v_organization_id,v_rfp.approved_by_identity_id)) OR (v_rfp.created_by_identity_id = v_actor_id AND mmhr_private.r4_requires_separate_approval()) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP approval denied'; END IF;
  UPDATE public.rfp_versions AS r SET status = 'approved', approved_by_identity_id = v_actor_id, approved_at = clock_timestamp(), approval_reference = v_approval_reference, updated_at = clock_timestamp() WHERE r.id = v_rfp.id RETURNING * INTO v_rfp;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.rfp.approve', 'rfp.mmhr_approve', 'rfp_version', v_rfp.id, v_organization_id, 'Approve RFP version', correlation_id, idempotency_key, payload, jsonb_build_object('version', v_rfp.version), jsonb_build_object('version', v_rfp.version, 'state', 'approved'), context.authorization_time);
  RETURN jsonb_build_object('rfpId', v_rfp.rfp_id, 'organizationId', v_rfp.organization_id, 'sourceIntakeId', v_rfp.source_intake_id, 'version', v_rfp.version, 'status', v_rfp.status, 'approvedByIdentityId', v_rfp.approved_by_identity_id, 'approvedAt', v_rfp.approved_at, 'approvalReference', v_rfp.approval_reference, 'outcomeCode', 'approved', 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_approve_rfp_version(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_approve_rfp_version(jsonb, uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_approve_rfp_version(jsonb, uuid, uuid) IS 'R4 audited MMHR approval for an immutable organization-scoped RFP version.';

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_get_rfp_workflow(payload jsonb,correlation_id uuid)
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
    'requiresSeparateApproval',mmhr_private.r4_requires_separate_approval(),
    'readyToDeliver',(v_review->>'ready')::boolean,'selectedCount',jsonb_array_length(v_review->'items'),
    'correlationId',correlation_id);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_rfp_workflow(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_rfp_workflow(jsonb,uuid) TO authenticated;
