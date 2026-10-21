-- R4 provider-neutral communication records and delivery updates.

-- Permit provider-neutral delivery states in redacted audit summaries.
CREATE OR REPLACE FUNCTION mmhr_private.r1_audit_summary_is_safe(value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT $1 IS NULL OR (jsonb_typeof($1) = 'object' AND NOT EXISTS (
    SELECT 1 FROM jsonb_each($1) e(key,item)
    WHERE CASE
      WHEN e.key = 'stable_key' THEN NOT (jsonb_typeof(e.item) = 'string' AND e.item #>> '{}' IN ('super_admin','admin','staff','organization_admin','contributor','viewer'))
      WHEN e.key IN ('state','status') THEN NOT (jsonb_typeof(e.item) = 'string' AND e.item #>> '{}' IN ('pending','linked','active','recovery_pending','suspended','archived','revoked','accepted','expired','draft','reviewed','approved','rejected','retired','verified','consumed','cancelled','completed','in_flight','succeeded','failed','outcome_unknown','queued','sent','delivered','bounced','complained','opted_out'))
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

CREATE OR REPLACE FUNCTION public.mmhr_record_workflow_communication(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; receipt jsonb; communication public.workflow_communications%ROWTYPE; v_action text; v_id uuid; v_org uuid; v_actor uuid; v_direction text; v_template text; v_recipients jsonb; v_associations jsonb; v_consent text; v_state text; v_provider text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR coalesce(payload->>'action','') NOT IN ('queue','update_delivery') OR correlation_id IS NULL OR idempotency_key IS NULL OR coalesce(payload->>'communicationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid communication input'; END IF;
  v_action := payload->>'action'; v_id := (payload->>'communicationId')::uuid; v_org := (payload->>'organizationId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_direction := coalesce(payload->>'direction','outbound'); v_template := nullif(btrim(payload->>'templateKey'),''); v_recipients := payload->'recipientReferences'; v_associations := payload->'associationReferences'; v_consent := nullif(btrim(payload->>'consent'),''); v_state := coalesce(payload->>'deliveryState','queued'); v_provider := nullif(btrim(payload->>'providerMessageId'),'');
  IF v_action = 'queue' AND (v_direction NOT IN ('outbound','inbound') OR v_recipients IS NULL OR jsonb_typeof(v_recipients) <> 'array' OR jsonb_array_length(v_recipients) > 50 OR v_associations IS NULL OR jsonb_typeof(v_associations) <> 'array' OR jsonb_array_length(v_associations) > 50 OR v_state <> 'queued') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid communication queue input'; END IF;
  IF v_action = 'update_delivery' AND v_state NOT IN ('sent','delivered','failed','bounced','complained','opted_out') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid communication delivery state'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Record workflow communication', correlation_id, idempotency_key); IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.communication', idempotency_key, payload); IF receipt IS NOT NULL THEN SELECT * INTO communication FROM public.workflow_communications c WHERE c.id = (receipt->>'entity_id')::uuid AND c.organization_id = v_org; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('communicationId', communication.id, 'organizationId', communication.organization_id, 'deliveryState', communication.delivery_state, 'providerMessageId', communication.provider_message_id, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  IF v_action = 'queue' THEN INSERT INTO public.workflow_communications (id, organization_id, direction, idempotency_key, correlation_id, template_key, recipient_references, association_references, consent, delivery_state, created_by_identity_id) VALUES (v_id, v_org, v_direction, idempotency_key, correlation_id, v_template, v_recipients, v_associations, v_consent, 'queued', v_actor) RETURNING * INTO communication;
  ELSE UPDATE public.workflow_communications SET delivery_state = v_state, provider_message_id = v_provider, updated_at = clock_timestamp() WHERE id = v_id AND organization_id = v_org RETURNING * INTO communication; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Communication delivery association denied'; END IF; END IF;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.communication', 'communication.' || v_action, 'workflow_communication', communication.id, v_org, 'Record workflow communication', correlation_id, idempotency_key, payload, jsonb_build_object('status', CASE WHEN v_action = 'queue' THEN 'queued' ELSE 'queued' END), jsonb_build_object('status', communication.delivery_state), context.authorization_time);
  RETURN jsonb_build_object('communicationId', communication.id, 'organizationId', communication.organization_id, 'deliveryState', communication.delivery_state, 'providerMessageId', communication.provider_message_id, 'outcomeCode', 'recorded', 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_record_workflow_communication(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_workflow_communication(jsonb, uuid, uuid) TO authenticated;
