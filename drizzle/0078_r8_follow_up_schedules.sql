-- R8 audited customer-success follow-up schedules.
CREATE TABLE public.follow_up_schedules (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  interval_days integer NOT NULL,
  first_check_in_at timestamptz NOT NULL,
  next_check_in_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  revision integer NOT NULL DEFAULT 1,
  created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  approved_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  approval_reference text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT follow_up_schedules_subject_type_ck CHECK (subject_type IN ('vendor','customer','product','risk')),
  CONSTRAINT follow_up_schedules_interval_ck CHECK (interval_days BETWEEN 1 AND 3650),
  CONSTRAINT follow_up_schedules_status_ck CHECK (status IN ('draft','approved','paused','retired')),
  CONSTRAINT follow_up_schedules_revision_ck CHECK (revision > 0),
  CONSTRAINT follow_up_schedules_approval_ck CHECK ((status = 'draft' AND approved_by_identity_id IS NULL AND approved_at IS NULL AND approval_reference IS NULL) OR (status IN ('approved','paused','retired') AND approved_by_identity_id IS NOT NULL AND approved_at IS NOT NULL AND approval_reference IS NOT NULL)),
  CONSTRAINT follow_up_schedules_next_check_in_ck CHECK (next_check_in_at >= first_check_in_at)
);
CREATE UNIQUE INDEX follow_up_schedules_scope_subject_uq ON public.follow_up_schedules(organization_id,subject_type,subject_id);
CREATE INDEX follow_up_schedules_due_idx ON public.follow_up_schedules(organization_id,status,next_check_in_at);
ALTER TABLE public.follow_up_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY r8_deny_anon_authenticated_follow_up_schedules ON public.follow_up_schedules FOR ALL TO anon,authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.follow_up_schedules FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;

CREATE OR REPLACE FUNCTION public.mmhr_record_follow_up_schedule(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; item public.follow_up_schedules%ROWTYPE; v_org uuid; v_actor uuid; v_id uuid; v_action text; v_revision integer;
BEGIN
 IF jsonb_typeof(payload)<>'object' OR coalesce(payload->>'action','') NOT IN ('create','approve','pause','retire') OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'scheduleId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid follow-up schedule input'; END IF;
 v_org:=(payload->>'organizationId')::uuid; v_actor:=(payload->>'actorIdentityId')::uuid; v_id:=(payload->>'scheduleId')::uuid; v_action:=payload->>'action'; SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access',v_org,'Record follow-up schedule',correlation_id,idempotency_key); IF v_actor<>context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF; receipt:=mmhr_private.r1_checked_receipt(context.actor_identity_id,'r8.follow_up_schedule',idempotency_key,payload); IF receipt IS NOT NULL THEN RETURN jsonb_build_object('scheduleId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id); END IF;
 IF v_action='create' THEN
   IF payload->>'subjectType' NOT IN ('vendor','customer','product','risk') OR coalesce((payload->>'intervalDays')::integer,0) NOT BETWEEN 1 AND 3650 OR (payload->>'firstCheckInAt')::timestamptz IS NULL OR (payload->>'nextCheckInAt')::timestamptz IS NULL OR (payload->>'nextCheckInAt')::timestamptz < (payload->>'firstCheckInAt')::timestamptz OR coalesce(payload->>'subjectId','') !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid follow-up schedule'; END IF;
   INSERT INTO public.follow_up_schedules(id,organization_id,subject_type,subject_id,interval_days,first_check_in_at,next_check_in_at,created_by_identity_id) VALUES(v_id,v_org,payload->>'subjectType',(payload->>'subjectId')::uuid,(payload->>'intervalDays')::integer,(payload->>'firstCheckInAt')::timestamptz,(payload->>'nextCheckInAt')::timestamptz,v_actor) RETURNING * INTO item;
 ELSE
   v_revision:=(payload->>'expectedRevision')::integer; IF v_revision IS NULL OR v_revision<=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid follow-up schedule revision'; END IF; SELECT * INTO item FROM public.follow_up_schedules WHERE id=v_id AND organization_id=v_org FOR UPDATE; IF NOT FOUND OR item.revision<>v_revision THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Follow-up schedule is stale'; END IF;
   IF v_action='approve' THEN
     IF item.status<>'draft' OR item.created_by_identity_id=v_actor OR coalesce(payload->>'approvalReference','')='' OR (payload->>'approvedAt')::timestamptz IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Follow-up schedule approval denied'; END IF;
     UPDATE public.follow_up_schedules SET status='approved',revision=revision+1,approved_by_identity_id=v_actor,approved_at=(payload->>'approvedAt')::timestamptz,approval_reference=payload->>'approvalReference',updated_at=clock_timestamp() WHERE id=v_id AND organization_id=v_org RETURNING * INTO item;
   ELSIF v_action='pause' THEN
     IF item.status<>'approved' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Follow-up schedule pause denied'; END IF;
     UPDATE public.follow_up_schedules SET status='paused',revision=revision+1,updated_at=clock_timestamp() WHERE id=v_id AND organization_id=v_org RETURNING * INTO item;
   ELSE
     IF item.status NOT IN ('approved','paused') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Follow-up schedule retirement denied'; END IF;
     UPDATE public.follow_up_schedules SET status='retired',revision=revision+1,updated_at=clock_timestamp() WHERE id=v_id AND organization_id=v_org RETURNING * INTO item;
   END IF;
 END IF;
 PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r8.follow_up_schedule','follow_up_schedule.'||v_action,'follow_up_schedule',item.id,v_org,'Record follow-up schedule',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),context.authorization_time);
 RETURN jsonb_build_object('scheduleId',item.id,'organizationId',item.organization_id,'subjectType',item.subject_type,'status',item.status,'revision',item.revision,'nextCheckInAt',item.next_check_in_at,'outcomeCode','recorded','correlationId',correlation_id);
END; $$;
REVOKE ALL ON FUNCTION public.mmhr_record_follow_up_schedule(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker; GRANT EXECUTE ON FUNCTION public.mmhr_record_follow_up_schedule(jsonb,uuid,uuid) TO authenticated;
