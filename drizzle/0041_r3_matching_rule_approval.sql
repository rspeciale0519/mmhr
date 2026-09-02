-- R3 rule-set approval command. Draft rules cannot affect active matching runs.

CREATE OR REPLACE FUNCTION public.mmhr_approve_matching_rule_set(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; rule_set public.matching_rule_sets%ROWTYPE; receipt jsonb; outcome text;
  v_organization_id uuid; v_rule_set_id uuid; v_actor_id uuid;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'ruleSetId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid rule approval input'; END IF;
  v_organization_id := (payload->>'organizationId')::uuid; v_rule_set_id := (payload->>'ruleSetId')::uuid; v_actor_id := (payload->>'actorIdentityId')::uuid;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Approve matching rules', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.matching.rule.approve', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO rule_set FROM public.matching_rule_sets AS rs WHERE rs.id=(receipt->>'entity_id')::uuid AND rs.organization_id=v_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    outcome := 'replayed';
  ELSE
    SELECT * INTO rule_set FROM public.matching_rule_sets AS rs WHERE rs.id=v_rule_set_id AND rs.organization_id=v_organization_id FOR UPDATE;
    IF NOT FOUND OR rule_set.status <> 'draft' THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Rule approval denied'; END IF;
    UPDATE public.matching_rule_sets AS rs SET status='approved', approved_by_identity_id=context.actor_identity_id, approved_at=clock_timestamp() WHERE rs.id=v_rule_set_id AND rs.organization_id=v_organization_id RETURNING * INTO rule_set;
    PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r3.matching.rule.approve', 'matching.rule.approve', 'matching_rule_set', rule_set.id, v_organization_id, 'Approve matching rules', correlation_id, idempotency_key, payload, jsonb_build_object('version',rule_set.version,'state','draft'), jsonb_build_object('version',rule_set.version,'state','approved'), context.authorization_time);
    outcome := 'approved';
  END IF;
  RETURN jsonb_build_object('ruleSetId',rule_set.id,'organizationId',rule_set.organization_id,'version',rule_set.version,'status',rule_set.status,'outcomeCode',outcome,'correlationId',correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_approve_matching_rule_set(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_approve_matching_rule_set(jsonb,uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_approve_matching_rule_set(jsonb,uuid,uuid) IS 'R3 approval-bound activation of versioned deterministic matching rules.';
