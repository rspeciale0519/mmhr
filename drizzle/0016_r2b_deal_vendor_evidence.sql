-- R2B deal, renewal, and vendor-evidence persistence. All tables remain
-- deny-first until reviewed command functions and isolation tests exist.
CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  vendor_organization_id uuid REFERENCES public.orgs(id) ON DELETE RESTRICT,
  product_id uuid,
  owner_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  stage text NOT NULL DEFAULT 'lead',
  status text NOT NULL DEFAULT 'open',
  candidate_id uuid,
  contract_id uuid,
  expected_close_at timestamptz,
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deals_product_vendor_scope_fk FOREIGN KEY (vendor_organization_id, product_id)
    REFERENCES public.products (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT deals_organization_vendor_ck CHECK (
    vendor_organization_id IS NULL OR vendor_organization_id <> organization_id
  ),
  CONSTRAINT deals_product_requires_vendor_ck CHECK (
    product_id IS NULL OR vendor_organization_id IS NOT NULL
  ),
  CONSTRAINT deals_stage_ck CHECK (
    stage IN ('lead', 'discovery', 'evaluation', 'proposal', 'selection', 'contracting', 'won', 'lost', 'archived')
  ),
  CONSTRAINT deals_status_ck CHECK (status IN ('open', 'won', 'lost', 'archived')),
  CONSTRAINT deals_stage_status_ck CHECK (
    (stage IN ('lead', 'discovery', 'evaluation', 'proposal', 'selection', 'contracting') AND status = 'open')
    OR (stage = 'won' AND status = 'won')
    OR (stage = 'lost' AND status = 'lost')
    OR (stage = 'archived' AND status = 'archived')
  ),
  CONSTRAINT deals_revision_ck CHECK (revision > 0),
  CONSTRAINT deals_updated_at_ck CHECK (updated_at >= created_at)
);
CREATE UNIQUE INDEX deals_organization_id_id_uq ON public.deals (organization_id, id);
CREATE INDEX deals_organization_stage_status_idx ON public.deals (organization_id, stage, status);
CREATE UNIQUE INDEX products_organization_vendor_id_uq
  ON public.products (organization_id, vendor_profile_id, id);

CREATE TABLE public.deal_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  deal_id uuid NOT NULL,
  from_stage text NOT NULL,
  to_stage text NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  expected_revision integer NOT NULL,
  actor_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL,
  reason text NOT NULL,
  correlation_id uuid NOT NULL,
  CONSTRAINT deal_stage_history_deal_scope_fk FOREIGN KEY (organization_id, deal_id)
    REFERENCES public.deals (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT deal_stage_history_revision_ck CHECK (expected_revision > 0),
  CONSTRAINT deal_stage_history_reason_ck CHECK (length(btrim(reason)) BETWEEN 1 AND 2000)
);
CREATE INDEX deal_stage_history_deal_time_idx ON public.deal_stage_history (organization_id, deal_id, occurred_at);

CREATE TABLE public.renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  contract_id uuid NOT NULL,
  source_deal_id uuid NOT NULL,
  owner_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  contract_start_at timestamptz NOT NULL,
  contract_end_at timestamptz NOT NULL,
  renewal_window_start_at timestamptz NOT NULL,
  renewal_window_end_at timestamptz NOT NULL,
  linked_follow_on_deal_id uuid,
  next_action_at timestamptz,
  status text NOT NULL DEFAULT 'upcoming',
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT renewals_source_deal_scope_fk FOREIGN KEY (organization_id, source_deal_id)
    REFERENCES public.deals (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT renewals_follow_on_deal_scope_fk FOREIGN KEY (organization_id, linked_follow_on_deal_id)
    REFERENCES public.deals (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT renewals_dates_ck CHECK (contract_end_at >= contract_start_at),
  CONSTRAINT renewals_window_ck CHECK (
    renewal_window_end_at >= renewal_window_start_at
    AND renewal_window_start_at >= contract_start_at
    AND renewal_window_end_at <= contract_end_at
  ),
  CONSTRAINT renewals_status_ck CHECK (status IN ('upcoming', 'in_review', 'at_risk', 'renewed', 'replaced', 'expanded', 'cancelled')),
  CONSTRAINT renewals_terminal_action_ck CHECK (
    status NOT IN ('renewed', 'replaced', 'expanded', 'cancelled') OR next_action_at IS NULL
  ),
  CONSTRAINT renewals_completed_deal_ck CHECK (
    status NOT IN ('renewed', 'replaced', 'expanded') OR linked_follow_on_deal_id IS NOT NULL
  ),
  CONSTRAINT renewals_revision_ck CHECK (revision > 0),
  CONSTRAINT renewals_updated_at_ck CHECK (updated_at >= created_at)
);
CREATE UNIQUE INDEX renewals_organization_id_id_uq ON public.renewals (organization_id, id);
CREATE INDEX renewals_organization_status_action_idx ON public.renewals (organization_id, status, next_action_at);

CREATE TABLE public.vendor_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  vendor_profile_id uuid NOT NULL,
  uri text NOT NULL,
  source_type text NOT NULL,
  license_note text,
  captured_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_sources_vendor_scope_fk FOREIGN KEY (organization_id, vendor_profile_id)
    REFERENCES public.vendor_profiles (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT vendor_sources_uri_ck CHECK (uri ~ '^https://'),
  CONSTRAINT vendor_sources_type_ck CHECK (source_type IN ('vendor_owned', 'licensed', 'manual')),
  CONSTRAINT vendor_sources_license_ck CHECK (license_note IS NULL OR length(license_note) <= 500)
);
CREATE UNIQUE INDEX vendor_sources_organization_id_id_uq ON public.vendor_sources (organization_id, id);

CREATE TABLE public.vendor_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  vendor_profile_id uuid NOT NULL,
  product_id uuid,
  field_key text NOT NULL,
  value text NOT NULL,
  observed_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_facts_vendor_scope_fk FOREIGN KEY (organization_id, vendor_profile_id)
    REFERENCES public.vendor_profiles (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT vendor_facts_product_scope_fk FOREIGN KEY (organization_id, vendor_profile_id, product_id)
    REFERENCES public.products (organization_id, vendor_profile_id, id) ON DELETE RESTRICT,
  CONSTRAINT vendor_facts_field_key_ck CHECK (field_key ~ '^[a-z][a-z0-9_]{0,99}$'),
  CONSTRAINT vendor_facts_value_ck CHECK (length(btrim(value)) BETWEEN 1 AND 2000),
  CONSTRAINT vendor_facts_product_vendor_ck CHECK (product_id IS NULL OR vendor_profile_id IS NOT NULL),
  CONSTRAINT vendor_facts_status_ck CHECK (status IN ('draft', 'published', 'archived'))
);
CREATE UNIQUE INDEX vendor_facts_organization_id_id_uq ON public.vendor_facts (organization_id, id);
CREATE UNIQUE INDEX vendor_facts_organization_field_uq ON public.vendor_facts (organization_id, vendor_profile_id, field_key)
  WHERE status <> 'archived';

CREATE TABLE public.vendor_evidence_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  fact_id uuid NOT NULL,
  source_id uuid NOT NULL,
  version integer NOT NULL,
  content_hash text NOT NULL,
  captured_at timestamptz NOT NULL,
  fresh_until timestamptz NOT NULL,
  citation text NOT NULL,
  CONSTRAINT vendor_evidence_fact_scope_fk FOREIGN KEY (organization_id, fact_id)
    REFERENCES public.vendor_facts (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT vendor_evidence_source_scope_fk FOREIGN KEY (organization_id, source_id)
    REFERENCES public.vendor_sources (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT vendor_evidence_version_ck CHECK (version > 0),
  CONSTRAINT vendor_evidence_hash_ck CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT vendor_evidence_freshness_ck CHECK (fresh_until >= captured_at),
  CONSTRAINT vendor_evidence_citation_ck CHECK (length(btrim(citation)) BETWEEN 1 AND 1000)
);
CREATE UNIQUE INDEX vendor_evidence_organization_fact_version_uq
  ON public.vendor_evidence_versions (organization_id, fact_id, version);
CREATE UNIQUE INDEX vendor_evidence_organization_id_id_uq ON public.vendor_evidence_versions (organization_id, id);

CREATE TABLE public.vendor_fact_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  evidence_id uuid NOT NULL,
  reviewer_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  decision text NOT NULL,
  decided_at timestamptz NOT NULL,
  reason text,
  CONSTRAINT vendor_fact_reviews_evidence_scope_fk FOREIGN KEY (organization_id, evidence_id)
    REFERENCES public.vendor_evidence_versions (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT vendor_fact_reviews_decision_ck CHECK (decision IN ('approved', 'rejected')),
  CONSTRAINT vendor_fact_reviews_reason_ck CHECK (reason IS NULL OR length(reason) <= 500)
);
CREATE UNIQUE INDEX vendor_fact_reviews_organization_id_id_uq ON public.vendor_fact_reviews (organization_id, id);

CREATE TABLE public.vendor_fact_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  fact_id uuid NOT NULL,
  value text NOT NULL,
  approved_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  reason text NOT NULL,
  CONSTRAINT vendor_fact_overrides_fact_scope_fk FOREIGN KEY (organization_id, fact_id)
    REFERENCES public.vendor_facts (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT vendor_fact_overrides_value_ck CHECK (length(btrim(value)) BETWEEN 1 AND 2000),
  CONSTRAINT vendor_fact_overrides_dates_ck CHECK (expires_at >= approved_at),
  CONSTRAINT vendor_fact_overrides_reason_ck CHECK (length(btrim(reason)) BETWEEN 1 AND 500)
);
CREATE UNIQUE INDEX vendor_fact_overrides_organization_id_id_uq ON public.vendor_fact_overrides (organization_id, id);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_evidence_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_fact_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_fact_overrides ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.deals, public.deal_stage_history, public.renewals, public.vendor_sources,
  public.vendor_facts, public.vendor_evidence_versions, public.vendor_fact_reviews,
  public.vendor_fact_overrides
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

CREATE POLICY r2b_deny_anon_authenticated_deals ON public.deals
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r2b_deny_anon_authenticated_deal_stage_history ON public.deal_stage_history
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r2b_deny_anon_authenticated_renewals ON public.renewals
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r2b_deny_anon_authenticated_vendor_sources ON public.vendor_sources
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r2b_deny_anon_authenticated_vendor_facts ON public.vendor_facts
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r2b_deny_anon_authenticated_vendor_evidence ON public.vendor_evidence_versions
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r2b_deny_anon_authenticated_vendor_fact_reviews ON public.vendor_fact_reviews
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r2b_deny_anon_authenticated_vendor_fact_overrides ON public.vendor_fact_overrides
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.deals IS 'R2B organization-scoped deal snapshots; transitions require audited commands.';
COMMENT ON TABLE public.deal_stage_history IS 'R2B immutable deal stage history; never update or delete approved events.';
COMMENT ON TABLE public.renewals IS 'R8 renewal snapshots linked to scoped source and follow-on deals.';
COMMENT ON TABLE public.vendor_sources IS 'R2B permitted vendor source registry with licensing and capture metadata.';
COMMENT ON TABLE public.vendor_facts IS 'R2B vendor facts remain non-customer-visible until approved evidence exists.';
COMMENT ON TABLE public.vendor_evidence_versions IS 'R2B immutable evidence versions with hash, citation, and freshness.';
COMMENT ON TABLE public.vendor_fact_reviews IS 'R2B immutable evidence approval decisions.';
COMMENT ON TABLE public.vendor_fact_overrides IS 'R2B audited, expiring vendor-fact overrides.';
