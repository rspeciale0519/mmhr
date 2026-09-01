-- R3 workspace persistence. Access remains deny-first until reviewed commands
-- and customer/internal isolation tests are available.
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  intake_id uuid NOT NULL,
  stage text NOT NULL DEFAULT 'intake',
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_intake_scope_fk FOREIGN KEY (organization_id, intake_id)
    REFERENCES public.intakes (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT workspaces_stage_ck CHECK (stage IN ('intake', 'matching', 'evaluation', 'selection', 'contracting', 'onboarding', 'closed')),
  CONSTRAINT workspaces_revision_ck CHECK (revision > 0),
  CONSTRAINT workspaces_updated_at_ck CHECK (updated_at >= created_at)
);
CREATE UNIQUE INDEX workspaces_organization_id_id_uq ON public.workspaces (organization_id, id);
CREATE UNIQUE INDEX workspaces_intake_uq ON public.workspaces (organization_id, intake_id);

CREATE TABLE public.workspace_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  stage text NOT NULL,
  candidate_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_task_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  approval_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  upcoming_event_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  recent_activity_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  captured_at timestamptz NOT NULL,
  revision integer NOT NULL,
  CONSTRAINT workspace_snapshots_workspace_scope_fk FOREIGN KEY (organization_id, workspace_id)
    REFERENCES public.workspaces (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT workspace_snapshots_stage_ck CHECK (stage IN ('intake', 'matching', 'evaluation', 'selection', 'contracting', 'onboarding', 'closed')),
  CONSTRAINT workspace_snapshots_revision_ck CHECK (revision > 0),
  CONSTRAINT workspace_snapshots_arrays_ck CHECK (
    jsonb_typeof(candidate_ids) = 'array'
    AND jsonb_typeof(open_task_ids) = 'array'
    AND jsonb_typeof(approval_ids) = 'array'
    AND jsonb_typeof(upcoming_event_references) = 'array'
    AND jsonb_typeof(recent_activity_ids) = 'array'
  )
);
CREATE UNIQUE INDEX workspace_snapshots_scope_revision_uq
  ON public.workspace_snapshots (organization_id, workspace_id, revision);
CREATE INDEX workspace_snapshots_scope_time_idx
  ON public.workspace_snapshots (organization_id, workspace_id, captured_at);

CREATE TABLE public.workspace_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'invited',
  invited_at timestamptz NOT NULL,
  joined_at timestamptz,
  removed_at timestamptz,
  CONSTRAINT workspace_participants_workspace_scope_fk FOREIGN KEY (organization_id, workspace_id)
    REFERENCES public.workspaces (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT workspace_participants_role_ck CHECK (role IN ('customer_member', 'customer_admin', 'mmhr_advisor', 'mmhr_reviewer')),
  CONSTRAINT workspace_participants_status_ck CHECK (status IN ('invited', 'active', 'removed')),
  CONSTRAINT workspace_participants_timestamps_ck CHECK (
    (status = 'active' AND joined_at IS NOT NULL AND removed_at IS NULL)
    OR (status = 'removed' AND removed_at IS NOT NULL)
    OR (status = 'invited' AND joined_at IS NULL AND removed_at IS NULL)
  )
);
CREATE UNIQUE INDEX workspace_participants_scope_identity_uq
  ON public.workspace_participants (organization_id, workspace_id, identity_id);

CREATE TABLE public.workspace_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  author_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  visibility text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  correlation_id uuid NOT NULL,
  CONSTRAINT workspace_comments_workspace_scope_fk FOREIGN KEY (organization_id, workspace_id)
    REFERENCES public.workspaces (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT workspace_comments_visibility_ck CHECK (visibility IN ('customer', 'internal')),
  CONSTRAINT workspace_comments_body_ck CHECK (length(btrim(body)) BETWEEN 1 AND 5000)
);
CREATE UNIQUE INDEX workspace_comments_organization_id_id_uq ON public.workspace_comments (organization_id, id);
CREATE INDEX workspace_comments_scope_time_idx ON public.workspace_comments (organization_id, workspace_id, created_at);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_comments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.workspaces, public.workspace_snapshots, public.workspace_participants,
  public.workspace_comments
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

CREATE POLICY r3_deny_anon_authenticated_workspaces ON public.workspaces
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r3_deny_anon_authenticated_workspace_snapshots ON public.workspace_snapshots
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r3_deny_anon_authenticated_workspace_participants ON public.workspace_participants
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r3_deny_anon_authenticated_workspace_comments ON public.workspace_comments
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.workspaces IS 'R3 organization-scoped collaboration workspaces linked to an intake.';
COMMENT ON TABLE public.workspace_snapshots IS 'R3 immutable workspace snapshots with bounded references and revisions.';
COMMENT ON TABLE public.workspace_participants IS 'R3 workspace participants with explicit customer or internal roles.';
COMMENT ON TABLE public.workspace_comments IS 'R3 immutable workspace comments; customer views must filter internal visibility.';
