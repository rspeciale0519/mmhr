-- R8 customer-success and operations persistence.
-- Snapshots retain failed work and allow projections to rebuild from source history.
CREATE TABLE public.onboarding_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  deal_id uuid NOT NULL,
  owner_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  target_go_live_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  revision integer NOT NULL DEFAULT 1,
  milestones jsonb NOT NULL,
  check_ins jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_reason text,
  reactivated_from_revision integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_plans_deal_scope_fk FOREIGN KEY (organization_id, deal_id)
    REFERENCES public.deals (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT onboarding_plans_status_ck CHECK (status IN ('planned', 'active', 'at_risk', 'failed', 'reactivated', 'completed', 'cancelled')),
  CONSTRAINT onboarding_plans_revision_ck CHECK (revision > 0),
  CONSTRAINT onboarding_plans_arrays_ck CHECK (jsonb_typeof(milestones) = 'array' AND jsonb_array_length(milestones) BETWEEN 1 AND 200 AND jsonb_typeof(check_ins) = 'array' AND jsonb_typeof(risks) = 'array'),
  CONSTRAINT onboarding_plans_failure_ck CHECK ((status IN ('failed', 'reactivated')) = (failure_reason IS NOT NULL)),
  CONSTRAINT onboarding_plans_updated_ck CHECK (updated_at >= created_at)
);
CREATE UNIQUE INDEX onboarding_plans_organization_id_uq ON public.onboarding_plans (organization_id, id);
CREATE INDEX onboarding_plans_status_go_live_idx ON public.onboarding_plans (organization_id, status, target_go_live_at);

CREATE TABLE public.onboarding_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  onboarding_id uuid NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  expected_revision integer NOT NULL,
  actor_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  approval_reference uuid,
  occurred_at timestamptz NOT NULL,
  correlation_id uuid NOT NULL,
  CONSTRAINT onboarding_history_scope_fk FOREIGN KEY (organization_id, onboarding_id)
    REFERENCES public.onboarding_plans (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT onboarding_history_revision_ck CHECK (expected_revision > 0),
  CONSTRAINT onboarding_history_reason_ck CHECK (length(btrim(reason)) BETWEEN 1 AND 2000)
);
CREATE INDEX onboarding_history_scope_time_idx ON public.onboarding_history (organization_id, onboarding_id, occurred_at);

CREATE TABLE public.project_plan_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  name text NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  approved_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  milestones jsonb NOT NULL,
  created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_plan_templates_version_ck CHECK (version > 0),
  CONSTRAINT project_plan_templates_approval_ck CHECK (approved = (approved_by_identity_id IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT project_plan_templates_milestones_ck CHECK (jsonb_typeof(milestones) = 'array' AND jsonb_array_length(milestones) BETWEEN 1 AND 200)
);
CREATE UNIQUE INDEX project_plan_templates_organization_name_version_uq ON public.project_plan_templates (organization_id, name, version);
CREATE UNIQUE INDEX project_plan_templates_organization_id_uq ON public.project_plan_templates (organization_id, id);

CREATE TABLE public.project_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  deal_id uuid NOT NULL,
  template_id uuid NOT NULL,
  template_version integer NOT NULL,
  target_go_live_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  milestones jsonb NOT NULL,
  created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_plans_deal_scope_fk FOREIGN KEY (organization_id, deal_id)
    REFERENCES public.deals (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT project_plans_template_scope_fk FOREIGN KEY (organization_id, template_id)
    REFERENCES public.project_plan_templates (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT project_plans_template_version_ck CHECK (template_version > 0),
  CONSTRAINT project_plans_revision_ck CHECK (revision > 0),
  CONSTRAINT project_plans_milestones_ck CHECK (jsonb_typeof(milestones) = 'array' AND jsonb_array_length(milestones) BETWEEN 1 AND 200)
);
CREATE UNIQUE INDEX project_plans_organization_id_uq ON public.project_plans (organization_id, id);

CREATE TABLE public.work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  queue text NOT NULL,
  assigned_role text NOT NULL,
  assignee_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  due_at timestamptz,
  reminder_at timestamptz,
  escalated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_items_queue_ck CHECK (queue IN ('approvals', 'follow_ups', 'scheduling', 'commissions', 'onboarding_risks')),
  CONSTRAINT work_items_role_ck CHECK (assigned_role IN ('super_admin', 'admin', 'advisor', 'sales', 'finance', 'operations', 'support')),
  CONSTRAINT work_items_status_ck CHECK (status IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')),
  CONSTRAINT work_items_priority_ck CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT work_items_reminder_ck CHECK (reminder_at IS NULL OR reminder_at >= created_at),
  CONSTRAINT work_items_escalation_ck CHECK (status NOT IN ('completed', 'cancelled') OR escalated = false),
  CONSTRAINT work_items_updated_ck CHECK (updated_at >= created_at)
);
CREATE UNIQUE INDEX work_items_organization_id_uq ON public.work_items (organization_id, id);
CREATE INDEX work_items_queue_status_due_idx ON public.work_items (organization_id, queue, status, due_at);

ALTER TABLE public.onboarding_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.onboarding_plans, public.onboarding_history, public.project_plan_templates,
  public.project_plans, public.work_items FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

CREATE POLICY r8_deny_anon_authenticated_onboarding_plans ON public.onboarding_plans AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r8_deny_anon_authenticated_onboarding_history ON public.onboarding_history AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r8_deny_anon_authenticated_project_plan_templates ON public.project_plan_templates AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r8_deny_anon_authenticated_project_plans ON public.project_plans AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r8_deny_anon_authenticated_work_items ON public.work_items AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.onboarding_plans IS 'R8 immutable customer-success snapshots; failed work remains retained for reactivation and audit.';
COMMENT ON TABLE public.work_items IS 'R8 role-scoped operational source items; overdue is a derived view.';
