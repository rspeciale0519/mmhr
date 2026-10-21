-- R3 scorecard persistence. Access remains deny-first until reviewed commands
-- and organization-isolation tests are available.
CREATE UNIQUE INDEX evaluation_candidates_organization_id_id_uq
  ON public.evaluation_candidates (organization_id, id);

CREATE TABLE public.scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  intake_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  configuration_id uuid NOT NULL,
  configuration_version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scorecards_intake_scope_fk FOREIGN KEY (organization_id, intake_id)
    REFERENCES public.intakes (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT scorecards_candidate_scope_fk FOREIGN KEY (organization_id, candidate_id)
    REFERENCES public.evaluation_candidates (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT scorecards_configuration_version_ck CHECK (configuration_version > 0),
  CONSTRAINT scorecards_status_ck CHECK (status IN ('draft', 'submitted', 'approved')),
  CONSTRAINT scorecards_revision_ck CHECK (revision > 0),
  CONSTRAINT scorecards_updated_at_ck CHECK (updated_at >= created_at)
);
CREATE UNIQUE INDEX scorecards_organization_id_id_uq ON public.scorecards (organization_id, id);
CREATE UNIQUE INDEX scorecards_candidate_uq ON public.scorecards (organization_id, intake_id, candidate_id);

CREATE TABLE public.scorecard_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  scorecard_id uuid NOT NULL,
  criterion_key text NOT NULL,
  weight integer NOT NULL,
  CONSTRAINT scorecard_criteria_scorecard_scope_fk FOREIGN KEY (organization_id, scorecard_id)
    REFERENCES public.scorecards (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT scorecard_criteria_key_ck CHECK (criterion_key ~ '^[a-z][a-z0-9_]{0,99}$'),
  CONSTRAINT scorecard_criteria_weight_ck CHECK (weight BETWEEN 1 AND 100)
);
CREATE UNIQUE INDEX scorecard_criteria_scope_key_uq
  ON public.scorecard_criteria (organization_id, scorecard_id, criterion_key);

CREATE TABLE public.scorecard_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  scorecard_id uuid NOT NULL,
  criterion_key text NOT NULL,
  scorer_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  value integer NOT NULL,
  comment text,
  evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  entered_at timestamptz NOT NULL,
  CONSTRAINT scorecard_entries_scorecard_scope_fk FOREIGN KEY (organization_id, scorecard_id)
    REFERENCES public.scorecards (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT scorecard_entries_criterion_scope_fk FOREIGN KEY (organization_id, scorecard_id, criterion_key)
    REFERENCES public.scorecard_criteria (organization_id, scorecard_id, criterion_key) ON DELETE RESTRICT,
  CONSTRAINT scorecard_entries_value_ck CHECK (value BETWEEN 0 AND 100),
  CONSTRAINT scorecard_entries_comment_ck CHECK (comment IS NULL OR length(comment) <= 1000),
  CONSTRAINT scorecard_entries_evidence_ck CHECK (jsonb_typeof(evidence_references) = 'array')
);
CREATE UNIQUE INDEX scorecard_entries_scorer_criterion_uq
  ON public.scorecard_entries (organization_id, scorecard_id, criterion_key, scorer_identity_id);

CREATE TABLE public.scorecard_entry_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  scorecard_id uuid NOT NULL,
  criterion_key text NOT NULL,
  scorer_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  value integer NOT NULL,
  comment text,
  evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  entered_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  correlation_id uuid NOT NULL,
  CONSTRAINT scorecard_entry_history_scorecard_scope_fk FOREIGN KEY (organization_id, scorecard_id)
    REFERENCES public.scorecards (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT scorecard_entry_history_criterion_scope_fk FOREIGN KEY (organization_id, scorecard_id, criterion_key)
    REFERENCES public.scorecard_criteria (organization_id, scorecard_id, criterion_key) ON DELETE RESTRICT,
  CONSTRAINT scorecard_entry_history_value_ck CHECK (value BETWEEN 0 AND 100),
  CONSTRAINT scorecard_entry_history_comment_ck CHECK (comment IS NULL OR length(comment) <= 1000),
  CONSTRAINT scorecard_entry_history_evidence_ck CHECK (jsonb_typeof(evidence_references) = 'array')
);
CREATE INDEX scorecard_entry_history_scope_time_idx
  ON public.scorecard_entry_history (organization_id, scorecard_id, recorded_at);

ALTER TABLE public.scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scorecard_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scorecard_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scorecard_entry_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.scorecards, public.scorecard_criteria, public.scorecard_entries,
  public.scorecard_entry_history
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

CREATE POLICY r3_deny_anon_authenticated_scorecards ON public.scorecards
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r3_deny_anon_authenticated_scorecard_criteria ON public.scorecard_criteria
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r3_deny_anon_authenticated_scorecard_entries ON public.scorecard_entries
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r3_deny_anon_authenticated_scorecard_entry_history ON public.scorecard_entry_history
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.scorecards IS 'R3 organization-scoped scorecard snapshots with approved configuration versions.';
COMMENT ON TABLE public.scorecard_criteria IS 'R3 weighted scorecard criteria; duplicate keys are denied within a scorecard.';
COMMENT ON TABLE public.scorecard_entries IS 'R3 current scorer entries; replacements require optimistic audited commands.';
COMMENT ON TABLE public.scorecard_entry_history IS 'R3 immutable scorer entry history; never update or delete approved entries.';
