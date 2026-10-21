-- R5 provider-neutral AI run persistence. Raw prompts, documents, and
-- provider payloads are never stored in these tables.
CREATE TABLE public.ai_runs (
  run_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  capability text NOT NULL,
  data_class text NOT NULL,
  adapter_id text NOT NULL,
  model_id text NOT NULL,
  template_version text NOT NULL,
  schema_version text NOT NULL,
  input_artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_artifact jsonb,
  output_hash text,
  source_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  cost_cents integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  failure_code text,
  failure_retryable boolean,
  review_decision text NOT NULL DEFAULT 'pending',
  reviewer_id text,
  approval_reference text,
  decided_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL,
  CONSTRAINT ai_runs_capability_ck CHECK (capability IN ('draft', 'summarize', 'extract_vendor_evidence', 'normalize_response', 'suggest_follow_up', 'identify_risk')),
  CONSTRAINT ai_runs_data_class_ck CHECK (data_class IN ('public', 'internal', 'confidential', 'restricted')),
  CONSTRAINT ai_runs_identifier_ck CHECK (adapter_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' AND model_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' AND template_version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' AND schema_version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'),
  CONSTRAINT ai_runs_hash_ck CHECK (output_hash IS NULL OR output_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT ai_runs_status_ck CHECK (status IN ('queued', 'running', 'validating', 'review_required', 'approved', 'rejected', 'failed')),
  CONSTRAINT ai_runs_review_ck CHECK (review_decision IN ('pending', 'approved', 'rejected')),
  CONSTRAINT ai_runs_failure_ck CHECK ((failure_code IS NULL AND failure_retryable IS NULL) OR (failure_code IN ('provider_timeout', 'provider_error', 'validation_failed', 'policy_denied') AND failure_retryable IS NOT NULL)),
  CONSTRAINT ai_runs_usage_ck CHECK ((input_tokens IS NULL OR input_tokens >= 0) AND (output_tokens IS NULL OR output_tokens >= 0) AND (total_tokens IS NULL OR total_tokens >= 0) AND cost_cents >= 0 AND latency_ms >= 0),
  CONSTRAINT ai_runs_arrays_ck CHECK (jsonb_typeof(input_artifacts) = 'array' AND jsonb_typeof(source_references) = 'array'),
  CONSTRAINT ai_runs_revision_ck CHECK (revision > 0),
  CONSTRAINT ai_runs_time_ck CHECK (completed_at IS NULL OR completed_at >= created_at)
);
CREATE UNIQUE INDEX ai_runs_organization_id_run_uq ON public.ai_runs (organization_id, run_id);
CREATE INDEX ai_runs_organization_status_idx ON public.ai_runs (organization_id, status, created_at);

CREATE TABLE public.ai_run_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  revision integer NOT NULL,
  status text NOT NULL,
  review_decision text NOT NULL,
  reviewer_id text,
  approval_reference text,
  decided_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  correlation_id uuid NOT NULL,
  CONSTRAINT ai_run_history_run_scope_fk FOREIGN KEY (organization_id, run_id)
    REFERENCES public.ai_runs (organization_id, run_id) ON DELETE RESTRICT,
  CONSTRAINT ai_run_history_revision_ck CHECK (revision > 0),
  CONSTRAINT ai_run_history_status_ck CHECK (status IN ('queued', 'running', 'validating', 'review_required', 'approved', 'rejected', 'failed')),
  CONSTRAINT ai_run_history_review_ck CHECK (review_decision IN ('pending', 'approved', 'rejected'))
);
CREATE UNIQUE INDEX ai_run_history_run_revision_uq ON public.ai_run_history (run_id, revision);
CREATE INDEX ai_run_history_organization_time_idx ON public.ai_run_history (organization_id, recorded_at);

ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_run_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_runs, public.ai_run_history
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r5_deny_anon_authenticated_ai_runs ON public.ai_runs
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r5_deny_anon_authenticated_ai_run_history ON public.ai_run_history
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.ai_runs IS 'R5 immutable provider-neutral run metadata; raw provider payloads are excluded.';
COMMENT ON TABLE public.ai_run_history IS 'R5 append-only AI run status and approval history.';
