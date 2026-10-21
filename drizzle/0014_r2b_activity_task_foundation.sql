-- R2B immutable CRM activity and task foundation. Access stays deny-first
-- until reviewed organization-scoped command functions are available.
CREATE TABLE public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  actor_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  kind text NOT NULL,
  occurred_at timestamptz NOT NULL,
  correlation_id uuid NOT NULL,
  summary text NOT NULL,
  CONSTRAINT crm_activities_subject_type_ck CHECK (subject_type IN ('customer', 'vendor', 'product', 'contact', 'deal', 'task')),
  CONSTRAINT crm_activities_kind_ck CHECK (kind IN ('call', 'email', 'meeting', 'note', 'status_change', 'task_completed')),
  CONSTRAINT crm_activities_summary_ck CHECK (length(btrim(summary)) BETWEEN 1 AND 500)
);
CREATE UNIQUE INDEX crm_activities_organization_id_id_uq ON public.crm_activities (organization_id, id);
CREATE INDEX crm_activities_organization_time_idx ON public.crm_activities (organization_id, occurred_at);
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  assignee_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  due_at timestamptz,
  state text NOT NULL DEFAULT 'open',
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_tasks_subject_type_ck CHECK (subject_type IN ('customer', 'vendor', 'product', 'contact', 'deal', 'task')),
  CONSTRAINT crm_tasks_title_ck CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT crm_tasks_description_ck CHECK (description IS NULL OR length(description) <= 2000),
  CONSTRAINT crm_tasks_state_ck CHECK (state IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')),
  CONSTRAINT crm_tasks_revision_ck CHECK (revision > 0)
);
CREATE UNIQUE INDEX crm_tasks_organization_id_id_uq ON public.crm_tasks (organization_id, id);
CREATE INDEX crm_tasks_organization_state_due_idx ON public.crm_tasks (organization_id, state, due_at);
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.crm_task_state_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL,
  from_state text NOT NULL,
  to_state text NOT NULL,
  expected_revision integer NOT NULL,
  actor_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL,
  reason text NOT NULL,
  correlation_id uuid NOT NULL,
  CONSTRAINT crm_task_state_history_task_scope_fk FOREIGN KEY (organization_id, task_id)
    REFERENCES public.crm_tasks (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT crm_task_state_history_revision_ck CHECK (expected_revision > 0),
  CONSTRAINT crm_task_state_history_reason_ck CHECK (length(btrim(reason)) BETWEEN 1 AND 2000)
);
CREATE INDEX crm_task_state_history_task_time_idx ON public.crm_task_state_history (organization_id, task_id, occurred_at);
ALTER TABLE public.crm_task_state_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.crm_activities, public.crm_tasks, public.crm_task_state_history
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r1_deny_anon_authenticated_crm_activities ON public.crm_activities
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_crm_tasks ON public.crm_tasks
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_crm_task_history ON public.crm_task_state_history
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.crm_activities IS 'R2B immutable organization-scoped activity records; writes require an audited command.';
COMMENT ON TABLE public.crm_tasks IS 'R2B organization-scoped task records with optimistic revisions.';
COMMENT ON TABLE public.crm_task_state_history IS 'R2B append-only task transition history coupled to task scope.';
