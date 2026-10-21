-- R4 workflow foundation. All new tables remain deny-first until reviewed
-- organization-scoped command functions and provider adapters are available.
CREATE TABLE public.rfp_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  rfp_id uuid NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  sections jsonb NOT NULL,
  approved_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  approval_reference text,
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfp_versions_version_ck CHECK (version > 0),
  CONSTRAINT rfp_versions_status_ck CHECK (status IN ('draft', 'review', 'approved', 'distributed', 'closed', 'archived')),
  CONSTRAINT rfp_versions_title_ck CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT rfp_versions_approval_ck CHECK ((approved_by_identity_id IS NULL AND approval_reference IS NULL AND approved_at IS NULL) OR (approved_by_identity_id IS NOT NULL AND approval_reference IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE UNIQUE INDEX rfp_versions_organization_id_uq ON public.rfp_versions (organization_id, id);
CREATE UNIQUE INDEX rfp_versions_organization_rfp_version_uq ON public.rfp_versions (organization_id, rfp_id, version);
CREATE INDEX rfp_versions_organization_status_idx ON public.rfp_versions (organization_id, status);
ALTER TABLE public.rfp_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rfp_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  rfp_version_id uuid NOT NULL,
  vendor_profile_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  responded_at timestamptz,
  CONSTRAINT rfp_recipients_version_scope_fk FOREIGN KEY (organization_id, rfp_version_id) REFERENCES public.rfp_versions (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT rfp_recipients_state_ck CHECK (state IN ('pending', 'distributed', 'acknowledged', 'responded', 'withdrawn'))
);
CREATE UNIQUE INDEX rfp_recipients_version_vendor_uq ON public.rfp_recipients (rfp_version_id, vendor_profile_id);
CREATE INDEX rfp_recipients_organization_state_idx ON public.rfp_recipients (organization_id, state);
ALTER TABLE public.rfp_recipients ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.inbound_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL,
  organization_id uuid REFERENCES public.orgs(id) ON DELETE RESTRICT,
  conversation_token text NOT NULL,
  sender_address text NOT NULL,
  recipient_addresses jsonb NOT NULL,
  subject text,
  body_reference text NOT NULL,
  attachment_references jsonb NOT NULL,
  raw_body_hash text NOT NULL,
  signed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  signature text NOT NULL,
  processed_at timestamptz,
  CONSTRAINT inbound_email_body_hash_ck CHECK (raw_body_hash ~ '^[0-9a-fA-F]{64}$')
);
CREATE UNIQUE INDEX inbound_email_provider_event_uq ON public.inbound_email_events (provider_event_id);
CREATE INDEX inbound_email_organization_received_idx ON public.inbound_email_events (organization_id, received_at);
ALTER TABLE public.inbound_email_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workflow_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  document_type text NOT NULL,
  current_version integer NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'active',
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_documents_type_ck CHECK (document_type IN ('rfp', 'response', 'proposal', 'contract', 'attachment', 'other')),
  CONSTRAINT workflow_documents_state_ck CHECK (state IN ('active', 'archived')),
  CONSTRAINT workflow_documents_version_ck CHECK (current_version > 0)
);
CREATE UNIQUE INDEX workflow_documents_organization_id_id_uq ON public.workflow_documents (organization_id, id);
CREATE INDEX workflow_documents_organization_type_idx ON public.workflow_documents (organization_id, document_type, state);
ALTER TABLE public.workflow_documents ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workflow_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL,
  version integer NOT NULL,
  state text NOT NULL DEFAULT 'ready',
  sha256 text NOT NULL,
  storage_reference text NOT NULL,
  created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_document_versions_document_scope_fk FOREIGN KEY (organization_id, document_id) REFERENCES public.workflow_documents (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT workflow_document_versions_state_ck CHECK (state IN ('ready', 'approved', 'superseded')),
  CONSTRAINT workflow_document_versions_version_ck CHECK (version > 0),
  CONSTRAINT workflow_document_versions_hash_ck CHECK (sha256 ~ '^[0-9a-fA-F]{64}$')
);
CREATE UNIQUE INDEX workflow_document_versions_document_version_uq ON public.workflow_document_versions (document_id, version);
CREATE INDEX workflow_document_versions_organization_state_idx ON public.workflow_document_versions (organization_id, state);
ALTER TABLE public.workflow_document_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workflow_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  channel text NOT NULL DEFAULT 'email',
  direction text NOT NULL,
  idempotency_key uuid NOT NULL,
  correlation_id uuid NOT NULL,
  template_key text,
  recipient_references jsonb NOT NULL,
  association_references jsonb NOT NULL,
  consent text,
  delivery_state text NOT NULL DEFAULT 'queued',
  provider_message_id text,
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_communications_channel_ck CHECK (channel = 'email'),
  CONSTRAINT workflow_communications_direction_ck CHECK (direction IN ('outbound', 'inbound')),
  CONSTRAINT workflow_communications_delivery_ck CHECK (delivery_state IN ('queued', 'sent', 'delivered', 'failed', 'bounced', 'complained', 'opted_out'))
);
CREATE UNIQUE INDEX workflow_communications_organization_idempotency_uq ON public.workflow_communications (organization_id, idempotency_key);
CREATE INDEX workflow_communications_organization_state_idx ON public.workflow_communications (organization_id, delivery_state);
ALTER TABLE public.workflow_communications ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workflow_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  job_type text NOT NULL,
  correlation_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  payload_references jsonb NOT NULL,
  maximum_attempts integer NOT NULL DEFAULT 3,
  attempts_in_cycle integer NOT NULL DEFAULT 0,
  rerun_count integer NOT NULL DEFAULT 0,
  schedule_at timestamptz,
  next_attempt_at timestamptz,
  state text NOT NULL DEFAULT 'queued',
  last_failure jsonb,
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_jobs_type_ck CHECK (job_type IN ('rfp_distribution', 'inbound_email', 'document_scan', 'content_acquisition', 'communication_delivery')),
  CONSTRAINT workflow_jobs_state_ck CHECK (state IN ('queued', 'scheduled', 'running', 'retry_pending', 'needs_attention', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT workflow_jobs_attempts_ck CHECK (maximum_attempts BETWEEN 1 AND 10 AND attempts_in_cycle BETWEEN 0 AND maximum_attempts AND rerun_count >= 0)
);
CREATE UNIQUE INDEX workflow_jobs_organization_id_uq ON public.workflow_jobs (organization_id, id);
CREATE UNIQUE INDEX workflow_jobs_organization_idempotency_uq ON public.workflow_jobs (organization_id, idempotency_key);
CREATE INDEX workflow_jobs_organization_state_schedule_idx ON public.workflow_jobs (organization_id, state, schedule_at);
ALTER TABLE public.workflow_jobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workflow_job_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL,
  attempt_number integer NOT NULL,
  correlation_id uuid NOT NULL,
  trigger text NOT NULL,
  requested_by text,
  reason text,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  outcome text NOT NULL,
  failure jsonb,
  CONSTRAINT workflow_job_attempts_job_scope_fk FOREIGN KEY (organization_id, job_id) REFERENCES public.workflow_jobs (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT workflow_job_attempts_number_ck CHECK (attempt_number > 0),
  CONSTRAINT workflow_job_attempts_trigger_ck CHECK (trigger IN ('automatic', 'manual')),
  CONSTRAINT workflow_job_attempts_outcome_ck CHECK (outcome IN ('running', 'succeeded', 'failed'))
);
CREATE INDEX workflow_job_attempts_job_time_idx ON public.workflow_job_attempts (organization_id, job_id, started_at);
ALTER TABLE public.workflow_job_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rfp_versions, public.rfp_recipients, public.inbound_email_events,
  public.workflow_documents, public.workflow_document_versions,
  public.workflow_communications, public.workflow_jobs, public.workflow_job_attempts
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r1_deny_anon_authenticated_rfp_versions ON public.rfp_versions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_rfp_recipients ON public.rfp_recipients AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_inbound_email ON public.inbound_email_events AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_workflow_documents ON public.workflow_documents AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_workflow_document_versions ON public.workflow_document_versions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_workflow_communications ON public.workflow_communications AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_workflow_jobs ON public.workflow_jobs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_workflow_job_attempts ON public.workflow_job_attempts AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.rfp_versions IS 'R4 immutable organization-scoped RFP versions; distribution requires approval.';
COMMENT ON TABLE public.inbound_email_events IS 'R4 verified inbound email events with provider replay protection.';
COMMENT ON TABLE public.workflow_documents IS 'R4 immutable document aggregate with versioned storage references.';
COMMENT ON TABLE public.workflow_jobs IS 'R4 provider-neutral durable jobs with bounded attempts and idempotency.';
