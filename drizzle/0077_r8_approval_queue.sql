-- R8 audited approval-queue request persistence.
CREATE TABLE public.approval_requests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  category text NOT NULL,
  resource_id uuid NOT NULL,
  requested_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  decision_reason text,
  revision integer NOT NULL DEFAULT 1,
  CONSTRAINT approval_requests_category_ck CHECK (category IN ('permission','workflow','finance','content','document','configuration')),
  CONSTRAINT approval_requests_status_ck CHECK (status IN ('pending','approved','rejected','expired')),
  CONSTRAINT approval_requests_revision_ck CHECK (revision > 0),
  CONSTRAINT approval_requests_decision_ck CHECK ((status='pending' AND reviewed_by_identity_id IS NULL AND reviewed_at IS NULL AND decision_reason IS NULL) OR (status<>'pending' AND reviewed_by_identity_id IS NOT NULL AND reviewed_at IS NOT NULL AND decision_reason IS NOT NULL))
);
CREATE INDEX approval_requests_queue_idx ON public.approval_requests(organization_id,status,requested_at);
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY r8_deny_anon_authenticated_approval_requests ON public.approval_requests FOR ALL TO anon,authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.approval_requests FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;

CREATE OR REPLACE FUNCTION public.mmhr_record_approval_request(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; item public.approval_requests%ROWTYPE; v_org uuid; v_actor uuid; v_id uuid; v_action text; v_from text; v_to text; v_revision integer;
BEGIN
 IF jsonb_typeof(payload)<>'object' OR coalesce(payload->>'action','') NOT IN ('create','transition') OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'requestId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid approval input'; END IF;
 v_org:=(payload->>'organizationId')::uuid; v_actor:=(payload->>'actorIdentityId')::uuid; v_id:=(payload->>'requestId')::uuid; v_action:=payload->>'action'; SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access',v_org,'Record approval request',correlation_id,idempotency_key); IF v_actor<>context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF; receipt:=mmhr_private.r1_checked_receipt(context.actor_identity_id,'r8.approval_request',idempotency_key,payload); IF receipt IS NOT NULL THEN RETURN jsonb_build_object('requestId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id); END IF;
 IF v_action='create' THEN
   IF payload->>'category' NOT IN ('permission','workflow','finance','content','document','configuration') OR coalesce(payload->>'resourceId','') !~ '^[0-9a-fA-F-]{36}$' OR (payload->>'requestedAt')::timestamptz IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid approval create'; END IF;
   INSERT INTO public.approval_requests(id,organization_id,category,resource_id,requested_by_identity_id,requested_at) VALUES(v_id,v_org,payload->>'category',(payload->>'resourceId')::uuid,v_actor,(payload->>'requestedAt')::timestamptz) RETURNING * INTO item;
 ELSE
   v_from:=payload->>'fromStatus'; v_to:=payload->>'toStatus'; v_revision:=(payload->>'expectedRevision')::integer; IF v_from<>'pending' OR v_to NOT IN ('approved','rejected','expired') OR coalesce(v_revision,0)<=0 OR (payload->>'occurredAt')::timestamptz IS NULL OR length(btrim(coalesce(payload->>'reason',''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid approval transition'; END IF;
   SELECT * INTO item FROM public.approval_requests WHERE id=v_id AND organization_id=v_org FOR UPDATE; IF NOT FOUND OR item.status<>v_from OR item.revision<>v_revision OR item.requested_by_identity_id=v_actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Approval transition denied'; END IF;
   UPDATE public.approval_requests SET status=v_to,revision=revision+1,reviewed_by_identity_id=v_actor,reviewed_at=(payload->>'occurredAt')::timestamptz,decision_reason=btrim(payload->>'reason') WHERE id=v_id AND organization_id=v_org RETURNING * INTO item;
 END IF;
 PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r8.approval_request','approval.'||v_action,'approval_request',item.id,v_org,'Record approval request',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),context.authorization_time);
 RETURN jsonb_build_object('requestId',item.id,'organizationId',item.organization_id,'status',item.status,'revision',item.revision,'outcomeCode','recorded','correlationId',correlation_id);
END; $$;
REVOKE ALL ON FUNCTION public.mmhr_record_approval_request(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker; GRANT EXECUTE ON FUNCTION public.mmhr_record_approval_request(jsonb,uuid,uuid) TO authenticated;
