-- R3 matching rule preview. Preview returns only a digest and bounded counts.

CREATE OR REPLACE FUNCTION public.mmhr_preview_matching_rule_set(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; rule_set public.matching_rule_sets%ROWTYPE; v_organization_id uuid; v_rule_set_id uuid; v_actor_id uuid; rule_digest text; rule_count integer;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'ruleSetId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid rule preview input'; END IF;
  v_organization_id := (payload->>'organizationId')::uuid; v_rule_set_id := (payload->>'ruleSetId')::uuid; v_actor_id := (payload->>'actorIdentityId')::uuid;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Preview matching rules', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  SELECT * INTO rule_set FROM public.matching_rule_sets AS rs WHERE rs.id=v_rule_set_id AND rs.organization_id=v_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Rule preview denied'; END IF;
  rule_digest := encode(sha256(convert_to(rule_set.rules::text, 'UTF8')), 'hex');
  rule_count := coalesce(jsonb_array_length(rule_set.rules->'criteria'), 0);
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r3.matching.rule.preview', 'matching.rule.preview', 'matching_rule_set', rule_set.id, v_organization_id, 'Preview matching rules', correlation_id, idempotency_key, payload, jsonb_build_object('version',rule_set.version,'state',rule_set.status), jsonb_build_object('version',rule_set.version,'state',rule_set.status), context.authorization_time);
  RETURN jsonb_build_object('ruleSetId',rule_set.id,'organizationId',rule_set.organization_id,'version',rule_set.version,'status',rule_set.status,'ruleDigest',rule_digest,'ruleCount',rule_count,'correlationId',correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_preview_matching_rule_set(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_preview_matching_rule_set(jsonb,uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_preview_matching_rule_set(jsonb,uuid,uuid) IS 'R3 bounded preview of a versioned matching rule set with an audited digest.';
