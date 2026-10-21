-- R3 intake and deterministic matching foundation.
-- All tables remain deny-by-default until audited commands and policies exist.

CREATE TABLE public.intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft',
  company_context jsonb,
  current_systems jsonb,
  compliance_needs jsonb,
  budget jsonb,
  timeline jsonb,
  stakeholders jsonb,
  decision_process jsonb,
  submitted_at timestamptz,
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  updated_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intakes_organization_id_id_uq UNIQUE (organization_id, id),
  CONSTRAINT intakes_status_ck CHECK (status IN ('draft', 'in_progress', 'submitted', 'under_review', 'completed', 'archived')),
  CONSTRAINT intakes_revision_ck CHECK (revision > 0),
  CONSTRAINT intakes_submission_ck CHECK (status IN ('draft', 'in_progress') OR submitted_at IS NOT NULL)
);
CREATE INDEX intakes_organization_status_idx ON public.intakes (organization_id, status);
ALTER TABLE public.intakes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.intake_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  intake_id uuid NOT NULL,
  stable_key text NOT NULL,
  label text NOT NULL,
  importance text NOT NULL DEFAULT 'nice',
  weight integer NOT NULL DEFAULT 1,
  owner_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  response jsonb,
  status text NOT NULL DEFAULT 'active',
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  updated_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intake_requirements_intake_scope_fk FOREIGN KEY (organization_id, intake_id)
    REFERENCES public.intakes (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT intake_requirements_intake_key_uq UNIQUE (intake_id, stable_key),
  CONSTRAINT intake_requirements_key_ck CHECK (stable_key ~ '^[a-z][a-z0-9_]{0,99}$'),
  CONSTRAINT intake_requirements_label_ck CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  CONSTRAINT intake_requirements_importance_ck CHECK (importance IN ('must', 'nice', 'not_applicable')),
  CONSTRAINT intake_requirements_weight_ck CHECK (weight BETWEEN 1 AND 100),
  CONSTRAINT intake_requirements_status_ck CHECK (status IN ('active', 'archived')),
  CONSTRAINT intake_requirements_revision_ck CHECK (revision > 0)
);
CREATE INDEX intake_requirements_organization_idx ON public.intake_requirements (organization_id, status);
ALTER TABLE public.intake_requirements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.evaluation_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  intake_id uuid NOT NULL,
  product_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'initial',
  state text NOT NULL DEFAULT 'proposed',
  eligibility text NOT NULL DEFAULT 'unknown',
  deterministic_score integer,
  scoring_configuration_version integer,
  fit_reasons jsonb,
  limitations jsonb,
  evidence_fresh_at timestamptz,
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  updated_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evaluation_candidates_intake_scope_fk FOREIGN KEY (organization_id, intake_id)
    REFERENCES public.intakes (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT evaluation_candidates_product_scope_fk FOREIGN KEY (organization_id, product_id)
    REFERENCES public.products (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT evaluation_candidates_intake_product_uq UNIQUE (intake_id, product_id),
  CONSTRAINT evaluation_candidates_source_ck CHECK (source IN ('initial', 'review_addition')),
  CONSTRAINT evaluation_candidates_state_ck CHECK (state IN ('proposed', 'active', 'paused', 'eliminated', 'selected', 'archived')),
  CONSTRAINT evaluation_candidates_eligibility_ck CHECK (eligibility IN ('unknown', 'eligible', 'ineligible')),
  CONSTRAINT evaluation_candidates_score_ck CHECK (deterministic_score IS NULL OR deterministic_score BETWEEN 0 AND 10000),
  CONSTRAINT evaluation_candidates_config_version_ck CHECK (scoring_configuration_version IS NULL OR scoring_configuration_version > 0),
  CONSTRAINT evaluation_candidates_revision_ck CHECK (revision > 0)
);
CREATE INDEX evaluation_candidates_organization_state_idx ON public.evaluation_candidates (organization_id, state);
ALTER TABLE public.evaluation_candidates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.intakes, public.intake_requirements, public.evaluation_candidates
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r1_deny_anon_authenticated_intakes ON public.intakes
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_intake_requirements ON public.intake_requirements
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_evaluation_candidates ON public.evaluation_candidates
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.intakes IS 'R3 organization-scoped intake. Access requires an audited command.';
COMMENT ON TABLE public.intake_requirements IS 'R3 versioned intake requirements. Requirements drive deterministic matching.';
COMMENT ON TABLE public.evaluation_candidates IS 'R3 candidate state and deterministic result fields. Candidate state is separate from deal state.';
