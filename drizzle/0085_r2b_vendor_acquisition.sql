-- R2B provider-neutral manual and automated vendor acquisition runs.
CREATE TABLE public.vendor_acquisition_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  source_id uuid NOT NULL,
  mode text NOT NULL,
  adapter_id text,
  status text NOT NULL DEFAULT 'queued',
  artifact_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_code text,
  requested_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  started_at timestamptz,
  completed_at timestamptz,
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_acquisition_runs_source_scope_fk FOREIGN KEY (organization_id, source_id) REFERENCES public.vendor_sources(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT vendor_acquisition_runs_organization_id_id_uq UNIQUE (organization_id, id),
  CONSTRAINT vendor_acquisition_runs_mode_ck CHECK (mode IN ('manual', 'automated')),
  CONSTRAINT vendor_acquisition_runs_status_ck CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'needs_review')),
  CONSTRAINT vendor_acquisition_runs_adapter_ck CHECK ((mode = 'manual' AND adapter_id IS NULL) OR (mode = 'automated' AND adapter_id IS NOT NULL AND length(btrim(adapter_id)) BETWEEN 1 AND 128)),
  CONSTRAINT vendor_acquisition_runs_artifacts_ck CHECK (jsonb_typeof(artifact_references) = 'array' AND jsonb_array_length(artifact_references) <= 50),
  CONSTRAINT vendor_acquisition_runs_failure_ck CHECK (failure_code IS NULL OR failure_code IN ('provider_unavailable', 'invalid_response', 'manual_required')),
  CONSTRAINT vendor_acquisition_runs_revision_ck CHECK (revision > 0),
  CONSTRAINT vendor_acquisition_runs_timestamps_ck CHECK (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at)),
  CONSTRAINT vendor_acquisition_runs_updated_at_ck CHECK (updated_at >= created_at)
);--> statement-breakpoint
CREATE INDEX vendor_acquisition_runs_source_status_idx ON public.vendor_acquisition_runs (organization_id, source_id, status);--> statement-breakpoint
ALTER TABLE public.vendor_acquisition_runs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY r2b_deny_anon_authenticated_vendor_acquisition_runs ON public.vendor_acquisition_runs FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);--> statement-breakpoint
REVOKE ALL ON TABLE public.vendor_acquisition_runs FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_record_vendor_acquisition(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; item public.vendor_acquisition_runs%ROWTYPE; v_org uuid; v_actor uuid; v_id uuid; v_source uuid; v_action text; v_revision integer; v_status text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR payload->>'action' NOT IN ('create','start','complete','fail') OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'runId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'sourceId','') !~ '^[0-9a-fA-F-]{36}$' OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid vendor acquisition input'; END IF;
  v_org := (payload->>'organizationId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_id := (payload->>'runId')::uuid; v_source := (payload->>'sourceId')::uuid; v_action := payload->>'action';
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Record vendor acquisition', correlation_id, idempotency_key);
  IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r2b.vendor.acquisition', idempotency_key, payload);
  IF receipt IS NOT NULL THEN SELECT * INTO item FROM public.vendor_acquisition_runs WHERE id = (receipt->>'entity_id')::uuid AND organization_id = v_org; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('runId', item.id, 'sourceId', item.source_id, 'organizationId', item.organization_id, 'mode', item.mode, 'adapterId', item.adapter_id, 'status', item.status, 'revision', item.revision, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  IF v_action = 'create' THEN
    IF payload->>'mode' NOT IN ('manual','automated') OR (payload->>'mode' = 'manual' AND payload->>'adapterId' IS NOT NULL) OR (payload->>'mode' = 'automated' AND (payload->>'adapterId' IS NULL OR length(btrim(payload->>'adapterId')) NOT BETWEEN 1 AND 128)) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid vendor acquisition mode'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.vendor_sources s WHERE s.organization_id = v_org AND s.id = v_source AND s.active) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Vendor acquisition source denied'; END IF;
    INSERT INTO public.vendor_acquisition_runs (id, organization_id, source_id, mode, adapter_id, status, requested_by_identity_id) VALUES (v_id, v_org, v_source, payload->>'mode', NULLIF(payload->>'adapterId',''), 'queued', v_actor) RETURNING * INTO item;
  ELSE
    v_revision := (payload->>'expectedRevision')::integer; IF v_revision IS NULL OR v_revision <= 0 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid vendor acquisition revision'; END IF;
    SELECT * INTO item FROM public.vendor_acquisition_runs WHERE organization_id = v_org AND id = v_id AND source_id = v_source AND revision = v_revision FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Vendor acquisition is stale'; END IF;
    IF v_action = 'start' THEN IF item.status <> 'queued' THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Vendor acquisition is not queued'; END IF; UPDATE public.vendor_acquisition_runs SET status='running', started_at=clock_timestamp(), revision=revision+1, updated_at=clock_timestamp() WHERE organization_id=v_org AND id=v_id RETURNING * INTO item;
    ELSIF v_action = 'complete' THEN IF item.status <> 'running' OR jsonb_typeof(payload->'artifactReferences') <> 'array' OR jsonb_array_length(payload->'artifactReferences') > 50 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid vendor acquisition completion'; END IF; UPDATE public.vendor_acquisition_runs SET status='succeeded', artifact_references=payload->'artifactReferences', completed_at=clock_timestamp(), revision=revision+1, updated_at=clock_timestamp() WHERE organization_id=v_org AND id=v_id RETURNING * INTO item;
    ELSE IF item.status <> 'running' OR payload->>'failureCode' NOT IN ('provider_unavailable','invalid_response','manual_required') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid vendor acquisition failure'; END IF; UPDATE public.vendor_acquisition_runs SET status='failed', failure_code=payload->>'failureCode', completed_at=clock_timestamp(), revision=revision+1, updated_at=clock_timestamp() WHERE organization_id=v_org AND id=v_id RETURNING * INTO item; END IF;
  END IF;
  v_status := item.status;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r2b.vendor.acquisition', 'vendor.acquisition.' || v_action, 'vendor_acquisition_run', item.id, v_org, 'Record vendor acquisition', correlation_id, idempotency_key, payload, CASE WHEN v_action = 'create' THEN NULL ELSE jsonb_build_object('state', CASE WHEN v_action = 'start' OR v_action = 'complete' OR v_action = 'fail' THEN 'queued' ELSE v_status END) END, jsonb_build_object('state', CASE WHEN v_status IN ('running', 'needs_review') THEN 'queued' ELSE v_status END), context.authorization_time);
  RETURN jsonb_build_object('runId', item.id, 'sourceId', item.source_id, 'organizationId', item.organization_id, 'mode', item.mode, 'adapterId', item.adapter_id, 'status', item.status, 'revision', item.revision, 'outcomeCode', 'recorded', 'correlationId', correlation_id);
END; $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_record_vendor_acquisition(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker; GRANT EXECUTE ON FUNCTION public.mmhr_record_vendor_acquisition(jsonb,uuid,uuid) TO authenticated;
