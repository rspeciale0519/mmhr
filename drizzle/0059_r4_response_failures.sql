-- R4 visible response ingestion and extraction failures.

CREATE TABLE public.rfp_response_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  event_id uuid, normalization_id uuid, failure_code text NOT NULL, failure_detail text NOT NULL,
  retry_at timestamptz, state text NOT NULL DEFAULT 'failed', created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfp_response_failures_event_scope_fk FOREIGN KEY (organization_id, event_id) REFERENCES public.inbound_email_events (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT rfp_response_failures_normalization_scope_fk FOREIGN KEY (organization_id, normalization_id) REFERENCES public.rfp_response_normalizations (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT rfp_response_failures_code_ck CHECK (failure_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT rfp_response_failures_detail_ck CHECK (length(btrim(failure_detail)) BETWEEN 1 AND 1000),
  CONSTRAINT rfp_response_failures_state_ck CHECK (state = 'failed')
);
CREATE UNIQUE INDEX rfp_response_failures_organization_id_uq ON public.rfp_response_failures (organization_id, id);
CREATE INDEX rfp_response_failures_event_idx ON public.rfp_response_failures (organization_id, event_id, created_at);
ALTER TABLE public.rfp_response_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rfp_response_failures FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r1_deny_anon_authenticated_rfp_response_failures ON public.rfp_response_failures AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.mmhr_record_rfp_response_failure(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; receipt jsonb; failure public.rfp_response_failures%ROWTYPE; v_id uuid; v_org uuid; v_actor uuid; v_event_id uuid; v_normalization_id uuid; v_code text; v_detail text; v_retry_at timestamptz;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL OR coalesce(payload->>'failureId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'failureCode','') !~ '^[a-z][a-z0-9_]{0,63}$' OR length(btrim(coalesce(payload->>'failureDetail',''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP response failure input'; END IF;
  v_id := (payload->>'failureId')::uuid; v_org := (payload->>'organizationId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_event_id := nullif(payload->>'eventId','')::uuid; v_normalization_id := nullif(payload->>'normalizationId','')::uuid; v_code := payload->>'failureCode'; v_detail := btrim(payload->>'failureDetail'); v_retry_at := nullif(payload->>'retryAt','')::timestamptz;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Record RFP response failure', correlation_id, idempotency_key); IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rsp.failure', idempotency_key, payload); IF receipt IS NOT NULL THEN SELECT * INTO failure FROM public.rfp_response_failures f WHERE f.id = (receipt->>'entity_id')::uuid AND f.organization_id = v_org; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('failureId', failure.id, 'organizationId', failure.organization_id, 'eventId', failure.event_id, 'normalizationId', failure.normalization_id, 'failureCode', failure.failure_code, 'state', failure.state, 'retryAt', failure.retry_at, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  IF v_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inbound_email_events e WHERE e.id = v_event_id AND e.organization_id = v_org) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP response failure association denied'; END IF;
  IF v_normalization_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.rfp_response_normalizations n WHERE n.id = v_normalization_id AND n.organization_id = v_org) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP response failure association denied'; END IF;
  INSERT INTO public.rfp_response_failures (id, organization_id, event_id, normalization_id, failure_code, failure_detail, retry_at, created_by_identity_id) VALUES (v_id, v_org, v_event_id, v_normalization_id, v_code, v_detail, v_retry_at, v_actor) RETURNING * INTO failure;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.rsp.failure', 'rsp.failure', 'rfp_response_failure', failure.id, v_org, 'Record RFP response failure', correlation_id, idempotency_key, payload, jsonb_build_object('state', 'failed'), jsonb_build_object('state', 'failed'), context.authorization_time);
  RETURN jsonb_build_object('failureId', failure.id, 'organizationId', failure.organization_id, 'eventId', failure.event_id, 'normalizationId', failure.normalization_id, 'failureCode', failure.failure_code, 'state', failure.state, 'retryAt', failure.retry_at, 'outcomeCode', 'recorded', 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_record_rfp_response_failure(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_rfp_response_failure(jsonb, uuid, uuid) TO authenticated;
