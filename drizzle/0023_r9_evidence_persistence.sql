-- R9 deletion, availability, and performance evidence persistence.
-- These records contain bounded operational facts and no raw user content.
CREATE TABLE public.deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL,
  requested_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  legal_hold boolean NOT NULL DEFAULT false,
  retention_until timestamptz,
  status text NOT NULL DEFAULT 'requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deletion_requests_due_ck CHECK (due_at >= requested_at AND due_at <= requested_at + interval '30 days'),
  CONSTRAINT deletion_requests_retention_ck CHECK (retention_until IS NULL OR retention_until >= requested_at),
  CONSTRAINT deletion_requests_status_ck CHECK (status IN ('requested', 'approved', 'held', 'rejected', 'completed'))
);
CREATE UNIQUE INDEX deletion_requests_organization_id_uq ON public.deletion_requests (organization_id, id);
CREATE INDEX deletion_requests_due_status_idx ON public.deletion_requests (organization_id, status, due_at);

CREATE TABLE public.deletion_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  decided_at timestamptz NOT NULL,
  decision text NOT NULL,
  audit_reference text NOT NULL,
  CONSTRAINT deletion_decisions_scope_fk FOREIGN KEY (organization_id, request_id)
    REFERENCES public.deletion_requests (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT deletion_decisions_decision_ck CHECK (decision IN ('approved', 'held', 'rejected')),
  CONSTRAINT deletion_decisions_reference_ck CHECK (audit_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$')
);
CREATE UNIQUE INDEX deletion_decisions_organization_id_uq ON public.deletion_decisions (organization_id, id);
CREATE UNIQUE INDEX deletion_decisions_request_uq ON public.deletion_decisions (organization_id, request_id);

CREATE TABLE public.availability_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  service_id text NOT NULL,
  observed_at timestamptz NOT NULL,
  duration_seconds integer NOT NULL,
  outcome text NOT NULL,
  maintenance boolean NOT NULL DEFAULT false,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_observations_duration_ck CHECK (duration_seconds BETWEEN 1 AND 86400),
  CONSTRAINT availability_observations_outcome_ck CHECK (outcome IN ('available', 'unavailable')),
  CONSTRAINT availability_observations_source_ck CHECK (source IN ('synthetic', 'user')),
  CONSTRAINT availability_observations_service_ck CHECK (service_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$')
);
CREATE UNIQUE INDEX availability_observations_organization_id_uq ON public.availability_observations (organization_id, id);
CREATE INDEX availability_observations_service_time_idx ON public.availability_observations (organization_id, service_id, observed_at);

CREATE TABLE public.performance_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  route text NOT NULL,
  measured_at timestamptz NOT NULL,
  sample_count integer NOT NULL,
  lcp_p75_ms integer NOT NULL,
  inp_p75_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT performance_measurements_route_ck CHECK (route ~ '^/(|[a-z0-9][a-z0-9/_-]*)$'),
  CONSTRAINT performance_measurements_sample_ck CHECK (sample_count BETWEEN 1 AND 100000),
  CONSTRAINT performance_measurements_lcp_ck CHECK (lcp_p75_ms BETWEEN 0 AND 60000),
  CONSTRAINT performance_measurements_inp_ck CHECK (inp_p75_ms BETWEEN 0 AND 60000)
);
CREATE UNIQUE INDEX performance_measurements_organization_id_uq ON public.performance_measurements (organization_id, id);
CREATE UNIQUE INDEX performance_measurements_route_time_uq ON public.performance_measurements (organization_id, route, measured_at);

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deletion_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_measurements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.deletion_requests, public.deletion_decisions,
  public.availability_observations, public.performance_measurements
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

CREATE POLICY r9_deny_anon_authenticated_deletion_requests ON public.deletion_requests AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r9_deny_anon_authenticated_deletion_decisions ON public.deletion_decisions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r9_deny_anon_authenticated_availability_observations ON public.availability_observations AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r9_deny_anon_authenticated_performance_measurements ON public.performance_measurements AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.deletion_requests IS 'R9 bounded deletion requests with legal-hold and retention controls.';
COMMENT ON TABLE public.availability_observations IS 'R9 redacted service-availability observations for SLO calculation.';
COMMENT ON TABLE public.performance_measurements IS 'R9 route performance measurements for LCP and INP evidence.';
