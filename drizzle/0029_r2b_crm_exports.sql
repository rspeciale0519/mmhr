-- R2B controlled export requests and decisions. Raw tables stay closed;
-- fixed commands own scope, permission, approval, audit, and replay rules.

CREATE TABLE public.crm_export_requests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  requested_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  resource text NOT NULL,
  fields jsonb NOT NULL,
  purpose text NOT NULL,
  requested_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  decision_id uuid,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_export_requests_resource_ck CHECK (resource IN ('customer','vendor','product','contact','deal','activity','task')),
  CONSTRAINT crm_export_requests_fields_ck CHECK (jsonb_typeof(fields) = 'array' AND jsonb_array_length(fields) BETWEEN 1 AND 20),
  CONSTRAINT crm_export_requests_purpose_ck CHECK (length(btrim(purpose)) BETWEEN 1 AND 300),
  CONSTRAINT crm_export_requests_state_ck CHECK (state IN ('pending','approved','denied')),
  CONSTRAINT crm_export_requests_identity_scope_uq UNIQUE (organization_id, id)
);--> statement-breakpoint

CREATE TABLE public.crm_export_decisions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  export_id uuid NOT NULL,
  reviewer_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  decision text NOT NULL,
  decided_at timestamptz NOT NULL,
  reason text,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_export_decisions_decision_ck CHECK (decision IN ('approved','denied')),
  CONSTRAINT crm_export_decisions_reason_ck CHECK (reason IS NULL OR length(reason) <= 500),
  CONSTRAINT crm_export_decisions_identity_scope_uq UNIQUE (organization_id, id),
  CONSTRAINT crm_export_decisions_export_uq UNIQUE (organization_id, export_id),
  CONSTRAINT crm_export_decisions_export_fk FOREIGN KEY (organization_id, export_id)
    REFERENCES public.crm_export_requests(organization_id, id) ON DELETE RESTRICT
);--> statement-breakpoint

CREATE INDEX crm_export_requests_org_state_idx
  ON public.crm_export_requests (organization_id, state, requested_at);--> statement-breakpoint
CREATE INDEX crm_export_decisions_org_time_idx
  ON public.crm_export_decisions (organization_id, decided_at);--> statement-breakpoint

ALTER TABLE public.crm_export_requests ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.crm_export_decisions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY crm_export_requests_deny_all ON public.crm_export_requests
  AS RESTRICTIVE FOR ALL TO anon, authenticated, service_role, mmhr_worker USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY crm_export_decisions_deny_all ON public.crm_export_decisions
  AS RESTRICTIVE FOR ALL TO anon, authenticated, service_role, mmhr_worker USING (false) WITH CHECK (false);--> statement-breakpoint
REVOKE ALL ON TABLE public.crm_export_requests, public.crm_export_decisions
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r2b_export_result(
  export_id uuid, organization_id uuid, state text, decision_id uuid,
  outcome_code text, correlation_id uuid
)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT jsonb_build_object(
  'exportId', $1, 'organizationId', $2, 'state', $3,
  'decisionId', $4, 'outcomeCode', $5, 'correlationId', $6) $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r2b_export_result(uuid,uuid,text,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_create_crm_export_request(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  request public.crm_export_requests%ROWTYPE;
  receipt jsonb;
  export_id uuid;
  organization_id uuid;
  requester_id uuid;
  resource text;
  fields jsonb;
  purpose text;
  requested_at timestamptz;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'exportId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'requestedByIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'resource','') NOT IN ('customer','vendor','product','contact','deal','activity','task')
    OR jsonb_typeof(payload->'fields') <> 'array'
    OR jsonb_array_length(payload->'fields') NOT BETWEEN 1 AND 20
    OR coalesce(payload->>'purpose','') = ''
    OR coalesce(payload->>'requestedAt','') = ''
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM export input'; END IF;
  export_id := (payload->>'exportId')::uuid;
  organization_id := (payload->>'organizationId')::uuid;
  requester_id := (payload->>'requestedByIdentityId')::uuid;
  resource := payload->>'resource'; fields := payload->'fields'; purpose := btrim(payload->>'purpose');
  requested_at := (payload->>'requestedAt')::timestamptz;
  IF length(purpose) > 300 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(fields) AS f
    WHERE jsonb_typeof(f) <> 'string' OR length(btrim(f #>> '{}')) NOT BETWEEN 1 AND 40
  ) OR jsonb_array_length(fields) <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(fields) AS value)
  OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(fields) AS value
    WHERE NOT (
      (resource = 'customer' AND value IN ('recordId','status','createdAt','updatedAt'))
      OR (resource = 'vendor' AND value IN ('recordId','status','createdAt','updatedAt'))
      OR (resource = 'product' AND value IN ('recordId','status','createdAt','updatedAt'))
      OR (resource = 'contact' AND value IN ('recordId','status','title'))
      OR (resource = 'deal' AND value IN ('recordId','stage','createdAt','updatedAt'))
      OR (resource = 'activity' AND value IN ('recordId','kind','occurredAt'))
      OR (resource = 'task' AND value IN ('recordId','state','dueAt'))
    )
  ) OR requested_at IS NULL
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM export input'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', organization_id, 'Create CRM export request', correlation_id, idempotency_key);
  IF requester_id <> context.actor_identity_id
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'crm.export.request', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO request FROM public.crm_export_requests r
    WHERE r.id = (receipt->>'entity_id')::uuid AND r.organization_id = organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    RETURN mmhr_private.r2b_export_result(request.id, request.organization_id, request.state,
      request.decision_id, 'replayed', correlation_id);
  END IF;
  INSERT INTO public.crm_export_requests (
    id, organization_id, requested_by_identity_id, resource, fields, purpose,
    requested_at, correlation_id
  ) VALUES (
    export_id, organization_id, requester_id, resource, fields, purpose, requested_at, correlation_id
  ) RETURNING * INTO request;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'crm.export.request', 'crm.export.request', 'crm_export_request',
    request.id, organization_id, 'Create CRM export request', correlation_id, idempotency_key,
    payload, NULL, jsonb_build_object('state', request.state),
    context.authorization_time);
  RETURN mmhr_private.r2b_export_result(request.id, organization_id, request.state, NULL, 'created', correlation_id);
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_decide_crm_export(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  request public.crm_export_requests%ROWTYPE;
  decision_row public.crm_export_decisions%ROWTYPE;
  receipt jsonb;
  export_id uuid;
  organization_id uuid;
  decision_id uuid;
  reviewer_id uuid;
  decision text;
  reason text;
  decided_at timestamptz;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'decisionId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'exportId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'reviewerIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'decision','') NOT IN ('approved','denied')
    OR coalesce(payload->>'decidedAt','') = ''
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM export decision'; END IF;
  export_id := (payload->>'exportId')::uuid; organization_id := (payload->>'organizationId')::uuid;
  decision_id := (payload->>'decisionId')::uuid; reviewer_id := (payload->>'reviewerIdentityId')::uuid;
  decision := payload->>'decision'; reason := CASE WHEN payload ? 'reason' AND jsonb_typeof(payload->'reason') <> 'null' THEN btrim(payload->>'reason') ELSE NULL END;
  decided_at := (payload->>'decidedAt')::timestamptz;
  IF reviewer_id IS NULL OR (reason IS NOT NULL AND length(reason) > 500) OR decided_at IS NULL
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM export decision'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'audit.export', organization_id, 'Decide CRM export request', correlation_id, idempotency_key);
  IF reviewer_id <> context.actor_identity_id
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'crm.export.decision', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO decision_row FROM public.crm_export_decisions d
    WHERE d.id = (receipt->>'entity_id')::uuid AND d.organization_id = organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    RETURN mmhr_private.r2b_export_result(decision_row.export_id, organization_id, decision_row.decision,
      decision_row.id, 'replayed', correlation_id);
  END IF;
  SELECT * INTO request FROM public.crm_export_requests r
  WHERE r.id = export_id AND r.organization_id = organization_id FOR UPDATE;
  IF NOT FOUND OR request.state <> 'pending' OR request.requested_by_identity_id = reviewer_id
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  INSERT INTO public.crm_export_decisions (
    id, organization_id, export_id, reviewer_identity_id, decision, decided_at, reason, correlation_id
  ) VALUES (
    decision_id, organization_id, export_id, reviewer_id, decision, decided_at, reason, correlation_id
  ) RETURNING * INTO decision_row;
  UPDATE public.crm_export_requests AS r SET state = decision, decision_id = decision_row.id
  WHERE r.id = export_id AND r.organization_id = organization_id;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'crm.export.decision', 'crm.export.decision', 'crm_export_decision',
    decision_row.id, organization_id, 'Decide CRM export request', correlation_id, idempotency_key,
    payload, jsonb_build_object('state', request.state), jsonb_build_object('state', decision),
    context.authorization_time);
  RETURN mmhr_private.r2b_export_result(export_id, organization_id, decision, decision_row.id, 'decided', correlation_id);
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.mmhr_create_crm_export_request(jsonb,uuid,uuid),
  public.mmhr_decide_crm_export(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_create_crm_export_request(jsonb,uuid,uuid),
  public.mmhr_decide_crm_export(jsonb,uuid,uuid) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.mmhr_create_crm_export_request(jsonb,uuid,uuid)
  IS 'R2B organization-scoped audited CRM export request command.';--> statement-breakpoint
COMMENT ON FUNCTION public.mmhr_decide_crm_export(jsonb,uuid,uuid)
  IS 'R2B AAL2 audited CRM export approval decision command.';
