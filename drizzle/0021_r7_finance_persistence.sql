-- R7 commission, invoice, payment, dispute, adjustment, and finance-handoff persistence.
-- All money uses integer minor units with an explicit currency.
CREATE TABLE public.commission_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  vendor_organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  calculation_type text NOT NULL,
  rate_basis_points integer,
  flat_amount_minor_units bigint,
  currency text NOT NULL,
  source_agreement_id uuid NOT NULL,
  revision integer NOT NULL,
  created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_structures_scope_ck CHECK (organization_id <> vendor_organization_id),
  CONSTRAINT commission_structures_type_ck CHECK (calculation_type IN ('contract_value_rate', 'flat_amount')),
  CONSTRAINT commission_structures_amount_ck CHECK ((calculation_type = 'contract_value_rate' AND rate_basis_points BETWEEN 0 AND 10000 AND flat_amount_minor_units IS NULL) OR (calculation_type = 'flat_amount' AND rate_basis_points IS NULL AND flat_amount_minor_units >= 0)),
  CONSTRAINT commission_structures_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT commission_structures_dates_ck CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT commission_structures_revision_ck CHECK (revision > 0)
);
CREATE UNIQUE INDEX commission_structures_organization_id_uq ON public.commission_structures (organization_id, id);
CREATE INDEX commission_structures_vendor_effective_idx ON public.commission_structures (organization_id, vendor_organization_id, effective_from);

CREATE TABLE public.commission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  contract_id uuid NOT NULL,
  deal_id uuid NOT NULL,
  vendor_organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  structure_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  signed_at timestamptz NOT NULL,
  currency text NOT NULL,
  contract_value_minor_units bigint NOT NULL,
  commission_amount_minor_units bigint NOT NULL,
  calculation_revision integer NOT NULL,
  state text NOT NULL DEFAULT 'pending_review',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_events_deal_scope_fk FOREIGN KEY (organization_id, deal_id)
    REFERENCES public.deals (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT commission_events_structure_scope_fk FOREIGN KEY (organization_id, structure_id)
    REFERENCES public.commission_structures (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT commission_events_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT commission_events_amount_ck CHECK (contract_value_minor_units >= 0 AND commission_amount_minor_units >= 0),
  CONSTRAINT commission_events_state_ck CHECK (state IN ('pending_review', 'approved', 'invoiced', 'partially_paid', 'paid', 'disputed', 'adjusted', 'voided', 'written_off')),
  CONSTRAINT commission_events_revision_ck CHECK (calculation_revision > 0)
);
CREATE UNIQUE INDEX commission_events_organization_id_uq ON public.commission_events (organization_id, id);
CREATE UNIQUE INDEX commission_events_idempotency_uq ON public.commission_events (organization_id, idempotency_key);

CREATE TABLE public.commission_event_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  commission_event_id uuid NOT NULL,
  from_state text NOT NULL,
  to_state text NOT NULL,
  actor_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL,
  correlation_id uuid NOT NULL,
  CONSTRAINT commission_event_history_scope_fk FOREIGN KEY (organization_id, commission_event_id)
    REFERENCES public.commission_events (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT commission_event_history_reason_ck CHECK (length(btrim(reason)) BETWEEN 1 AND 2000)
);
CREATE INDEX commission_event_history_scope_time_idx ON public.commission_event_history (organization_id, commission_event_id, occurred_at);

CREATE TABLE public.commission_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  commission_event_id uuid NOT NULL,
  amount_minor_units bigint NOT NULL,
  received_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'received',
  external_reference text,
  recorded_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  CONSTRAINT commission_payments_scope_fk FOREIGN KEY (organization_id, commission_event_id)
    REFERENCES public.commission_events (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT commission_payments_amount_ck CHECK (amount_minor_units > 0),
  CONSTRAINT commission_payments_state_ck CHECK (state IN ('received', 'reversed'))
);
CREATE UNIQUE INDEX commission_payments_organization_id_uq ON public.commission_payments (organization_id, id);

CREATE TABLE public.finance_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  commission_event_id uuid NOT NULL,
  vendor_organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  currency text NOT NULL,
  amount_minor_units bigint NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  invoice_number text,
  issue_date date,
  due_date date,
  supporting_document_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_invoices_scope_fk FOREIGN KEY (organization_id, commission_event_id)
    REFERENCES public.commission_events (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT finance_invoices_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT finance_invoices_amount_ck CHECK (amount_minor_units >= 0),
  CONSTRAINT finance_invoices_status_ck CHECK (status IN ('draft', 'ready', 'issued', 'voided')),
  CONSTRAINT finance_invoices_issue_ck CHECK ((status <> 'issued') OR (invoice_number IS NOT NULL AND issue_date IS NOT NULL AND due_date IS NOT NULL)),
  CONSTRAINT finance_invoices_dates_ck CHECK (due_date IS NULL OR issue_date IS NULL OR due_date >= issue_date),
  CONSTRAINT finance_invoices_refs_ck CHECK (jsonb_typeof(supporting_document_references) = 'array')
);
CREATE UNIQUE INDEX finance_invoices_organization_id_uq ON public.finance_invoices (organization_id, id);

CREATE TABLE public.finance_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  commission_event_id uuid NOT NULL,
  opened_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL,
  reason_code text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  resolved_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  resolution text,
  CONSTRAINT finance_disputes_scope_fk FOREIGN KEY (organization_id, commission_event_id)
    REFERENCES public.commission_events (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT finance_disputes_reason_code_ck CHECK (reason_code IN ('amount', 'eligibility', 'duplicate', 'payment', 'other')),
  CONSTRAINT finance_disputes_status_ck CHECK (status IN ('open', 'resolved', 'rejected')),
  CONSTRAINT finance_disputes_resolution_ck CHECK ((status = 'open' AND resolved_by_identity_id IS NULL AND resolved_at IS NULL AND resolution IS NULL) OR (status <> 'open' AND resolved_by_identity_id IS NOT NULL AND resolved_at IS NOT NULL AND resolution IS NOT NULL)),
  CONSTRAINT finance_disputes_time_ck CHECK (resolved_at IS NULL OR resolved_at >= opened_at)
);
CREATE UNIQUE INDEX finance_disputes_organization_id_uq ON public.finance_disputes (organization_id, id);

CREATE TABLE public.finance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  commission_event_id uuid NOT NULL,
  direction text NOT NULL,
  amount_minor_units bigint NOT NULL,
  reason text NOT NULL,
  approved_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_adjustments_scope_fk FOREIGN KEY (organization_id, commission_event_id)
    REFERENCES public.commission_events (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT finance_adjustments_direction_ck CHECK (direction IN ('increase', 'decrease')),
  CONSTRAINT finance_adjustments_amount_ck CHECK (amount_minor_units > 0),
  CONSTRAINT finance_adjustments_time_ck CHECK (approved_at >= created_at)
);
CREATE UNIQUE INDEX finance_adjustments_organization_id_uq ON public.finance_adjustments (organization_id, id);

CREATE TABLE public.finance_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  destination_reference text NOT NULL,
  source_event_ids jsonb NOT NULL,
  approved_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_handoffs_source_ck CHECK (jsonb_typeof(source_event_ids) = 'array' AND jsonb_array_length(source_event_ids) BETWEEN 1 AND 10000)
);
CREATE UNIQUE INDEX finance_handoffs_organization_id_uq ON public.finance_handoffs (organization_id, id);

ALTER TABLE public.commission_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_event_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_handoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commission_structures, public.commission_events, public.commission_event_history,
  public.commission_payments, public.finance_invoices, public.finance_disputes,
  public.finance_adjustments, public.finance_handoffs
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

CREATE POLICY r7_deny_anon_authenticated_commission_structures ON public.commission_structures AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r7_deny_anon_authenticated_commission_events ON public.commission_events AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r7_deny_anon_authenticated_commission_event_history ON public.commission_event_history AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r7_deny_anon_authenticated_commission_payments ON public.commission_payments AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r7_deny_anon_authenticated_finance_invoices ON public.finance_invoices AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r7_deny_anon_authenticated_finance_disputes ON public.finance_disputes AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r7_deny_anon_authenticated_finance_adjustments ON public.finance_adjustments AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r7_deny_anon_authenticated_finance_handoffs ON public.finance_handoffs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.commission_events IS 'R7 idempotent commission event; one eligible signed contract maps to one event.';
COMMENT ON TABLE public.finance_handoffs IS 'R7 approved finance export or handoff references only.';
