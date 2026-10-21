-- R6 demo, proposal, and contract-handoff persistence.
-- Legal terms and negotiation instructions are intentionally excluded.
CREATE TABLE public.demo_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  deal_id uuid NOT NULL,
  customer_organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  vendor_organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  requested_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  meeting_reference text,
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_rounds_deal_scope_fk FOREIGN KEY (organization_id, deal_id)
    REFERENCES public.deals (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT demo_rounds_scope_ck CHECK (organization_id = customer_organization_id AND customer_organization_id <> vendor_organization_id),
  CONSTRAINT demo_rounds_status_ck CHECK (status IN ('requested', 'scheduled', 'completed', 'cancelled', 'no_show')),
  CONSTRAINT demo_rounds_schedule_ck CHECK ((status = 'scheduled' AND scheduled_start_at IS NOT NULL AND scheduled_end_at IS NOT NULL AND meeting_reference IS NOT NULL) OR (status <> 'scheduled' AND scheduled_start_at IS NULL AND scheduled_end_at IS NULL AND meeting_reference IS NULL)),
  CONSTRAINT demo_rounds_time_ck CHECK (scheduled_end_at IS NULL OR scheduled_end_at > scheduled_start_at),
  CONSTRAINT demo_rounds_revision_ck CHECK (revision > 0),
  CONSTRAINT demo_rounds_updated_ck CHECK (updated_at >= created_at)
);
CREATE UNIQUE INDEX demo_rounds_organization_id_id_uq ON public.demo_rounds (organization_id, id);
CREATE INDEX demo_rounds_organization_status_idx ON public.demo_rounds (organization_id, status, requested_at);

CREATE TABLE public.demo_round_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  demo_id uuid NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  expected_revision integer NOT NULL,
  actor_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL,
  correlation_id uuid NOT NULL,
  CONSTRAINT demo_round_history_scope_fk FOREIGN KEY (organization_id, demo_id)
    REFERENCES public.demo_rounds (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT demo_round_history_revision_ck CHECK (expected_revision > 0),
  CONSTRAINT demo_round_history_reason_ck CHECK (length(btrim(reason)) BETWEEN 1 AND 2000)
);
CREATE INDEX demo_round_history_scope_time_idx ON public.demo_round_history (organization_id, demo_id, occurred_at);

CREATE TABLE public.demo_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  demo_id uuid NOT NULL,
  submitted_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  score integer NOT NULL,
  feedback text NOT NULL,
  evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_feedback_scope_fk FOREIGN KEY (organization_id, demo_id)
    REFERENCES public.demo_rounds (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT demo_feedback_score_ck CHECK (score BETWEEN 1 AND 5),
  CONSTRAINT demo_feedback_text_ck CHECK (length(btrim(feedback)) BETWEEN 1 AND 5000),
  CONSTRAINT demo_feedback_refs_ck CHECK (jsonb_typeof(evidence_references) = 'array')
);
CREATE INDEX demo_feedback_scope_time_idx ON public.demo_feedback (organization_id, demo_id, submitted_at);

CREATE TABLE public.proposal_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  deal_id uuid NOT NULL,
  vendor_organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'received',
  received_at timestamptz NOT NULL,
  source_references jsonb NOT NULL,
  pricing jsonb NOT NULL,
  created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_versions_deal_scope_fk FOREIGN KEY (organization_id, deal_id)
    REFERENCES public.deals (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT proposal_versions_status_ck CHECK (status IN ('received', 'under_review', 'revision_requested', 'approved_for_comparison', 'superseded', 'withdrawn')),
  CONSTRAINT proposal_versions_version_ck CHECK (version_number > 0),
  CONSTRAINT proposal_versions_refs_ck CHECK (jsonb_typeof(source_references) = 'array' AND jsonb_array_length(source_references) > 0),
  CONSTRAINT proposal_versions_pricing_ck CHECK (jsonb_typeof(pricing) = 'object')
);
CREATE UNIQUE INDEX proposal_versions_organization_deal_vendor_version_uq ON public.proposal_versions (organization_id, deal_id, vendor_organization_id, version_number);
CREATE UNIQUE INDEX proposal_versions_organization_id_uq ON public.proposal_versions (organization_id, id);

CREATE TABLE public.proposal_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  deal_id uuid NOT NULL,
  proposal_version_ids jsonb NOT NULL,
  approved_by_identity_ids jsonb NOT NULL,
  approved_at timestamptz NOT NULL,
  created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL,
  CONSTRAINT proposal_comparisons_deal_scope_fk FOREIGN KEY (organization_id, deal_id)
    REFERENCES public.deals (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT proposal_comparisons_versions_ck CHECK (jsonb_typeof(proposal_version_ids) = 'array' AND jsonb_array_length(proposal_version_ids) BETWEEN 2 AND 50),
  CONSTRAINT proposal_comparisons_approvers_ck CHECK (jsonb_typeof(approved_by_identity_ids) = 'array' AND jsonb_array_length(approved_by_identity_ids) BETWEEN 1 AND 10)
);
CREATE UNIQUE INDEX proposal_comparisons_organization_id_uq ON public.proposal_comparisons (organization_id, id);

CREATE TABLE public.contract_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  deal_id uuid NOT NULL,
  customer_organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  vendor_organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  selection_reasons jsonb NOT NULL,
  remaining_risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_by_identity_ids jsonb NOT NULL,
  approved_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'introduction_pending',
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_handoffs_deal_scope_fk FOREIGN KEY (organization_id, deal_id)
    REFERENCES public.deals (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT contract_handoffs_scope_ck CHECK (organization_id = customer_organization_id AND customer_organization_id <> vendor_organization_id),
  CONSTRAINT contract_handoffs_status_ck CHECK (status IN ('introduction_pending', 'introduced', 'negotiating', 'stalled', 'signed', 'not_signed', 'cancelled')),
  CONSTRAINT contract_handoffs_reasons_ck CHECK (jsonb_typeof(selection_reasons) = 'array' AND jsonb_array_length(selection_reasons) BETWEEN 1 AND 10),
  CONSTRAINT contract_handoffs_risks_ck CHECK (jsonb_typeof(remaining_risks) = 'array'),
  CONSTRAINT contract_handoffs_approvers_ck CHECK (jsonb_typeof(approved_by_identity_ids) = 'array' AND jsonb_array_length(approved_by_identity_ids) BETWEEN 1 AND 10),
  CONSTRAINT contract_handoffs_revision_ck CHECK (revision > 0)
);
CREATE UNIQUE INDEX contract_handoffs_organization_id_uq ON public.contract_handoffs (organization_id, id);

CREATE TABLE public.contract_handoff_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  handoff_id uuid NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  actor_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL,
  correlation_id uuid NOT NULL,
  CONSTRAINT contract_handoff_history_scope_fk FOREIGN KEY (organization_id, handoff_id)
    REFERENCES public.contract_handoffs (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT contract_handoff_history_reason_ck CHECK (length(btrim(reason)) BETWEEN 1 AND 2000)
);
CREATE INDEX contract_handoff_history_scope_time_idx ON public.contract_handoff_history (organization_id, handoff_id, occurred_at);

ALTER TABLE public.demo_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_round_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_handoff_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.demo_rounds, public.demo_round_history, public.demo_feedback,
  public.proposal_versions, public.proposal_comparisons, public.contract_handoffs,
  public.contract_handoff_history FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

CREATE POLICY r6_deny_anon_authenticated_demo_rounds ON public.demo_rounds AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r6_deny_anon_authenticated_demo_round_history ON public.demo_round_history AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r6_deny_anon_authenticated_demo_feedback ON public.demo_feedback AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r6_deny_anon_authenticated_proposal_versions ON public.proposal_versions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r6_deny_anon_authenticated_proposal_comparisons ON public.proposal_comparisons AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r6_deny_anon_authenticated_contract_handoffs ON public.contract_handoffs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r6_deny_anon_authenticated_contract_handoff_history ON public.contract_handoff_history AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.demo_rounds IS 'R6 scheduled demo rounds with bounded shared meeting metadata.';
COMMENT ON TABLE public.proposal_versions IS 'R6 immutable proposal and pricing versions; source references are required.';
COMMENT ON TABLE public.contract_handoffs IS 'R6 shared handoff status only; legal negotiation remains between customer and vendor.';
