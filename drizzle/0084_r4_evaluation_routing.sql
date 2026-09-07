-- R4 evaluation communications stay on MMHR until an audited final-selection transition.
CREATE TABLE public.evaluation_communication_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  deal_id uuid NOT NULL,
  route text NOT NULL DEFAULT 'mmhr',
  state text NOT NULL DEFAULT 'active',
  revision integer NOT NULL DEFAULT 1,
  decided_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  updated_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evaluation_communication_routes_deal_scope_fk FOREIGN KEY (organization_id, deal_id) REFERENCES public.deals(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT evaluation_communication_routes_organization_id_id_uq UNIQUE (organization_id, id),
  CONSTRAINT evaluation_communication_routes_deal_uq UNIQUE (organization_id, deal_id),
  CONSTRAINT evaluation_communication_routes_route_ck CHECK (route IN ('mmhr', 'direct')),
  CONSTRAINT evaluation_communication_routes_state_ck CHECK (state IN ('active', 'finalized')),
  CONSTRAINT evaluation_communication_routes_revision_ck CHECK (revision > 0),
  CONSTRAINT evaluation_communication_routes_decision_ck CHECK ((state = 'active' AND route = 'mmhr' AND decided_by_identity_id IS NULL AND decided_at IS NULL) OR (state = 'finalized' AND route = 'direct' AND decided_by_identity_id IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT evaluation_communication_routes_updated_at_ck CHECK (updated_at >= created_at)
);--> statement-breakpoint
ALTER TABLE public.evaluation_communication_routes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY r4_deny_anon_authenticated_evaluation_routes ON public.evaluation_communication_routes FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);--> statement-breakpoint
REVOKE ALL ON TABLE public.evaluation_communication_routes FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_record_evaluation_route(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; item public.evaluation_communication_routes%ROWTYPE; v_org uuid; v_actor uuid; v_id uuid; v_action text; v_revision integer;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR payload->>'action' NOT IN ('create','finalize') OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'routeId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'dealId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid evaluation route input'; END IF;
  v_org := (payload->>'organizationId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_id := (payload->>'routeId')::uuid; v_action := payload->>'action';
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Record evaluation route', correlation_id, idempotency_key);
  IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.evaluation.route', idempotency_key, payload);
  IF receipt IS NOT NULL THEN SELECT * INTO item FROM public.evaluation_communication_routes WHERE id = (receipt->>'entity_id')::uuid AND organization_id = v_org; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('routeId', item.id, 'dealId', item.deal_id, 'organizationId', item.organization_id, 'route', item.route, 'state', item.state, 'revision', item.revision, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  IF v_action = 'create' THEN
    IF NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.organization_id = v_org AND d.id = (payload->>'dealId')::uuid AND d.status = 'open') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Evaluation route deal denied'; END IF;
    INSERT INTO public.evaluation_communication_routes (id, organization_id, deal_id, route, state, revision, created_by_identity_id, updated_by_identity_id) VALUES (v_id, v_org, (payload->>'dealId')::uuid, 'mmhr', 'active', 1, v_actor, v_actor) RETURNING * INTO item;
  ELSE
    v_revision := (payload->>'expectedRevision')::integer;
    IF v_revision IS NULL OR v_revision <= 0 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid evaluation route revision'; END IF;
    SELECT r.* INTO item FROM public.evaluation_communication_routes r JOIN public.deals d ON d.organization_id = r.organization_id AND d.id = r.deal_id WHERE r.organization_id = v_org AND r.id = v_id AND r.revision = v_revision AND r.state = 'active' AND d.stage = 'won' AND d.status = 'won' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Final selection is not recorded'; END IF;
    UPDATE public.evaluation_communication_routes SET route = 'direct', state = 'finalized', revision = revision + 1, decided_by_identity_id = v_actor, decided_at = clock_timestamp(), updated_by_identity_id = v_actor, updated_at = clock_timestamp() WHERE organization_id = v_org AND id = v_id RETURNING * INTO item;
  END IF;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.evaluation.route', 'evaluation.route.' || v_action, 'evaluation_route', item.id, v_org, 'Record evaluation route', correlation_id, idempotency_key, payload, CASE WHEN v_action = 'create' THEN NULL ELSE jsonb_build_object('state','active') END, jsonb_build_object('state', CASE WHEN item.state = 'finalized' THEN 'completed' ELSE 'active' END), context.authorization_time);
  RETURN jsonb_build_object('routeId', item.id, 'dealId', item.deal_id, 'organizationId', item.organization_id, 'route', item.route, 'state', item.state, 'revision', item.revision, 'outcomeCode', 'recorded', 'correlationId', correlation_id);
END; $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_record_evaluation_route(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker; GRANT EXECUTE ON FUNCTION public.mmhr_record_evaluation_route(jsonb,uuid,uuid) TO authenticated;
