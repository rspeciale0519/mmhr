-- R4 response normalization review and MMHR approval.

ALTER TABLE public.rfp_response_normalizations
  ADD COLUMN reviewed_by_identity_id uuid,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN approved_by_identity_id uuid,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approval_reference text;
ALTER TABLE public.rfp_response_normalizations
  ADD CONSTRAINT rfp_response_normalizations_reviewed_identity_fk FOREIGN KEY (reviewed_by_identity_id) REFERENCES public.identities(id) ON DELETE RESTRICT,
  ADD CONSTRAINT rfp_response_normalizations_approved_identity_fk FOREIGN KEY (approved_by_identity_id) REFERENCES public.identities(id) ON DELETE RESTRICT,
  ADD CONSTRAINT rfp_response_normalizations_approval_reference_ck CHECK (approval_reference IS NULL OR approval_reference ~ '^approval:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'),
  ADD CONSTRAINT rfp_response_normalizations_review_state_ck CHECK (
    (state = 'pending' AND reviewed_by_identity_id IS NULL AND reviewed_at IS NULL AND approved_by_identity_id IS NULL AND approved_at IS NULL AND approval_reference IS NULL)
    OR (state = 'reviewed' AND reviewed_by_identity_id IS NOT NULL AND reviewed_at IS NOT NULL AND approved_by_identity_id IS NULL AND approved_at IS NULL AND approval_reference IS NULL)
    OR (state = 'approved' AND reviewed_by_identity_id IS NOT NULL AND reviewed_at IS NOT NULL AND approved_by_identity_id IS NOT NULL AND approved_at IS NOT NULL AND approval_reference IS NOT NULL)
    OR (state = 'rejected' AND reviewed_by_identity_id IS NOT NULL AND reviewed_at IS NOT NULL AND approved_by_identity_id IS NULL AND approved_at IS NULL AND approval_reference IS NULL)
  );

-- Permit the explicit review state in redacted audit summaries.
CREATE OR REPLACE FUNCTION mmhr_private.r1_audit_summary_is_safe(value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT $1 IS NULL OR (jsonb_typeof($1) = 'object' AND NOT EXISTS (
    SELECT 1 FROM jsonb_each($1) e(key,item)
    WHERE CASE
      WHEN e.key = 'stable_key' THEN NOT (jsonb_typeof(e.item) = 'string' AND e.item #>> '{}' IN ('super_admin','admin','staff','organization_admin','contributor','viewer'))
      WHEN e.key IN ('state','status') THEN NOT (jsonb_typeof(e.item) = 'string' AND e.item #>> '{}' IN ('pending','linked','active','recovery_pending','suspended','archived','revoked','accepted','expired','draft','reviewed','approved','rejected','retired','verified','consumed','cancelled','completed','in_flight','succeeded','failed','outcome_unknown'))
      WHEN e.key = 'version' THEN NOT (jsonb_typeof(e.item) = 'number' AND e.item #>> '{}' ~ '^[1-9][0-9]{0,8}$')
      WHEN e.key IN ('identity_count','membership_count','invitation_count','role_definition_count') THEN NOT (jsonb_typeof(e.item) = 'number' AND e.item #>> '{}' ~ '^(0|[1-9][0-9]{0,8})$')
      WHEN e.key IN ('can_view','can_grant','can_revoke','can_delegate') THEN jsonb_typeof(e.item) <> 'boolean'
      WHEN e.key IN ('record_id','identity_id','organization_id','source_delegation_id','parent_grant_id') THEN NOT (e.item = 'null'::jsonb OR jsonb_typeof(e.item) = 'string' AND e.item #>> '{}' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
      WHEN e.key = 'permission_key' THEN NOT (jsonb_typeof(e.item) = 'string' AND length(e.item #>> '{}') <= 128 AND e.item #>> '{}' ~ '^[a-z][a-z0-9_]*([.][a-z][a-z0-9_]*)+$')
      WHEN e.key = 'effect' THEN NOT (jsonb_typeof(e.item) = 'string' AND e.item #>> '{}' IN ('allow','deny'))
      WHEN e.key = 'type' THEN NOT (jsonb_typeof(e.item) = 'string' AND e.item #>> '{}' IN ('internal','customer','vendor'))
      WHEN e.key = 'portal' THEN NOT (jsonb_typeof(e.item) = 'string' AND e.item #>> '{}' IN ('customer','vendor'))
      WHEN e.key = 'expires_at_epoch' THEN NOT (e.item = 'null'::jsonb OR jsonb_typeof(e.item) = 'number' AND e.item #>> '{}' ~ '^[0-9]{1,12}([.][0-9]{1,6})?$')
      ELSE true
    END
  ));
$$;

CREATE OR REPLACE FUNCTION public.mmhr_review_rfp_response_normalization(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; receipt jsonb; normalization public.rfp_response_normalizations%ROWTYPE; version_row public.rfp_versions%ROWTYPE; v_action text; v_id uuid; v_org uuid; v_actor uuid; v_rfp_id uuid; v_version integer; v_reference text; v_expected_state text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR coalesce(payload->>'action','') NOT IN ('review','approve','reject') OR correlation_id IS NULL OR idempotency_key IS NULL OR coalesce(payload->>'normalizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'rfpId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'version','') !~ '^[1-9][0-9]{0,3}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP response review input'; END IF;
  v_action := payload->>'action'; v_id := (payload->>'normalizationId')::uuid; v_org := (payload->>'organizationId')::uuid; v_rfp_id := (payload->>'rfpId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_version := (payload->>'version')::integer; v_reference := payload->>'approvalReference'; v_expected_state := CASE WHEN v_action = 'review' THEN 'pending' ELSE 'reviewed' END;
  IF v_action = 'approve' AND coalesce(v_reference,'') !~ '^approval:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid approval reference'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Review RFP response normalization', correlation_id, idempotency_key); IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rsp.review', idempotency_key, payload); IF receipt IS NOT NULL THEN SELECT * INTO normalization FROM public.rfp_response_normalizations n WHERE n.id = (receipt->>'entity_id')::uuid AND n.organization_id = v_org; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('normalizationId', normalization.id, 'organizationId', normalization.organization_id, 'rfpId', v_rfp_id, 'version', v_version, 'state', normalization.state, 'reviewedByIdentityId', normalization.reviewed_by_identity_id, 'approvedByIdentityId', normalization.approved_by_identity_id, 'approvalReference', normalization.approval_reference, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  SELECT r.* INTO version_row FROM public.rfp_versions r JOIN public.rfp_response_normalizations n ON n.rfp_version_id = r.id AND n.organization_id = r.organization_id WHERE n.id = v_id AND n.organization_id = v_org AND r.rfp_id = v_rfp_id AND r.version = v_version; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP response review association denied'; END IF;
  SELECT * INTO normalization FROM public.rfp_response_normalizations n WHERE n.id = v_id AND n.organization_id = v_org FOR UPDATE; IF NOT FOUND OR normalization.state <> v_expected_state THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP response review transition denied'; END IF;
  IF v_action = 'review' AND normalization.created_by_identity_id = v_actor THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP response reviewer denied'; END IF;
  IF v_action IN ('approve','reject') AND normalization.reviewed_by_identity_id = v_actor THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP response approver denied'; END IF;
  IF v_action = 'review' THEN UPDATE public.rfp_response_normalizations SET state = 'reviewed', reviewed_by_identity_id = v_actor, reviewed_at = clock_timestamp() WHERE id = v_id AND organization_id = v_org RETURNING * INTO normalization;
  ELSIF v_action = 'approve' THEN UPDATE public.rfp_response_normalizations SET state = 'approved', approved_by_identity_id = v_actor, approved_at = clock_timestamp(), approval_reference = v_reference WHERE id = v_id AND organization_id = v_org RETURNING * INTO normalization;
  ELSE UPDATE public.rfp_response_normalizations SET state = 'rejected' WHERE id = v_id AND organization_id = v_org RETURNING * INTO normalization; END IF;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.rsp.review', 'rsp.review', 'rfp_response_normalization', normalization.id, v_org, 'Review RFP response normalization', correlation_id, idempotency_key, payload, jsonb_build_object('state', CASE WHEN v_action = 'review' THEN 'pending' ELSE 'reviewed' END, 'version', version_row.version), jsonb_build_object('state', normalization.state, 'version', version_row.version), context.authorization_time);
  RETURN jsonb_build_object('normalizationId', normalization.id, 'organizationId', normalization.organization_id, 'rfpId', version_row.rfp_id, 'version', version_row.version, 'state', normalization.state, 'reviewedByIdentityId', normalization.reviewed_by_identity_id, 'approvedByIdentityId', normalization.approved_by_identity_id, 'approvalReference', normalization.approval_reference, 'outcomeCode', 'recorded', 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_review_rfp_response_normalization(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_review_rfp_response_normalization(jsonb, uuid, uuid) TO authenticated;
