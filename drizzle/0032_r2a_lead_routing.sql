-- R2A lead routing. Captured leads remain immutable in their source fields;
-- this command only assigns an organization, owner, and follow-up status.

CREATE OR REPLACE FUNCTION mmhr_private.r2a_lead_route_result(
  lead_id uuid, organization_id uuid, owner_identity_id uuid, status text,
  outcome_code text, correlation_id uuid
)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT jsonb_build_object(
  'leadId', $1, 'organizationId', $2, 'ownerIdentityId', $3,
  'status', $4, 'outcomeCode', $5, 'correlationId', $6) $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r2a_lead_route_result(uuid,uuid,uuid,text,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_route_lead(
  payload jsonb, correlation_id uuid, idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  context record;
  receipt jsonb;
  lead_id uuid;
  organization_id uuid;
  owner_identity_id uuid;
  status text;
  existing public.leads%ROWTYPE;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'leadId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'ownerIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR payload->>'status' NOT IN ('contacted','qualified','disqualified','converted','archived')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid lead routing input'; END IF;
  lead_id := (payload->>'leadId')::uuid;
  organization_id := (payload->>'organizationId')::uuid;
  owner_identity_id := (payload->>'ownerIdentityId')::uuid;
  status := payload->>'status';
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', organization_id, 'Route lead to CRM', correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'crm.lead.route', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO existing FROM public.leads l WHERE l.id = lead_id;
    RETURN mmhr_private.r2a_lead_route_result(lead_id, existing.organization_id, existing.routing_owner_identity_id, existing.status, 'replayed', correlation_id);
  END IF;
  SELECT * INTO existing FROM public.leads l WHERE l.id = lead_id FOR UPDATE;
  IF NOT FOUND OR (existing.organization_id IS NOT NULL AND existing.organization_id <> organization_id)
    OR NOT EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = organization_id AND m.identity_id = owner_identity_id
        AND m.revoked_at IS NULL
    )
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  IF existing.status IN ('converted','archived') AND existing.status <> status
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  UPDATE public.leads AS l SET
    organization_id = organization_id,
    routing_owner_identity_id = owner_identity_id,
    status = status
  WHERE l.id = lead_id;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'crm.lead.route', 'lead.route', 'lead', lead_id,
    organization_id, 'Route lead to CRM', correlation_id, idempotency_key, payload,
    jsonb_build_object('version', 1),
    jsonb_build_object('version', 1),
    context.authorization_time);
  RETURN mmhr_private.r2a_lead_route_result(lead_id, organization_id, owner_identity_id, status, 'routed', correlation_id);
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.mmhr_route_lead(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_route_lead(jsonb,uuid,uuid) TO authenticated;
