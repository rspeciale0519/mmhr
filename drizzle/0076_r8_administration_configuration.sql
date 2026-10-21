-- R8 audited administration configuration versions.
CREATE TABLE public.administration_configurations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  category text NOT NULL,
  version integer NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  entries jsonb NOT NULL,
  created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  approved_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  approval_reference text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT administration_configurations_category_ck CHECK (category IN ('stage','questionnaire','scorecard','template','reminder','commission','ai_review','document_category','system')),
  CONSTRAINT administration_configurations_version_ck CHECK (version > 0 AND revision > 0),
  CONSTRAINT administration_configurations_status_ck CHECK (status IN ('draft','approved','retired')),
  CONSTRAINT administration_configurations_entries_ck CHECK (jsonb_typeof(entries) = 'array'),
  CONSTRAINT administration_configurations_approval_ck CHECK ((status = 'draft' AND approved_by_identity_id IS NULL AND approved_at IS NULL AND approval_reference IS NULL) OR (status IN ('approved','retired') AND approved_by_identity_id IS NOT NULL AND approved_at IS NOT NULL AND approval_reference IS NOT NULL))
);
CREATE UNIQUE INDEX administration_configurations_scope_version_uq ON public.administration_configurations(organization_id,category,version);
ALTER TABLE public.administration_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY r8_deny_anon_authenticated_administration_configurations ON public.administration_configurations FOR ALL TO anon,authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.administration_configurations FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;

CREATE OR REPLACE FUNCTION public.mmhr_record_administration_configuration(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; item public.administration_configurations%ROWTYPE; v_org uuid; v_actor uuid; v_id uuid; v_action text; v_revision integer;
BEGIN
 IF jsonb_typeof(payload)<>'object' OR coalesce(payload->>'action','') NOT IN ('create','approve','retire') OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'configurationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid administration configuration input'; END IF;
 v_org:=(payload->>'organizationId')::uuid; v_actor:=(payload->>'actorIdentityId')::uuid; v_id:=(payload->>'configurationId')::uuid; v_action:=payload->>'action'; SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access',v_org,'Record administration configuration',correlation_id,idempotency_key); IF v_actor<>context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF; receipt:=mmhr_private.r1_checked_receipt(context.actor_identity_id,'r8.administration_configuration',idempotency_key,payload); IF receipt IS NOT NULL THEN RETURN jsonb_build_object('configurationId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id); END IF;
 IF v_action='create' THEN
   IF payload->>'category' NOT IN ('stage','questionnaire','scorecard','template','reminder','commission','ai_review','document_category','system') OR coalesce((payload->>'version')::integer,0)<=0 OR jsonb_typeof(payload->'entries')<>'array' OR jsonb_array_length(payload->'entries') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid administration configuration'; END IF;
   INSERT INTO public.administration_configurations(id,organization_id,category,version,entries,created_by_identity_id) VALUES(v_id,v_org,payload->>'category',(payload->>'version')::integer,payload->'entries',v_actor) RETURNING * INTO item;
 ELSE
   v_revision:=(payload->>'expectedRevision')::integer; IF v_revision IS NULL OR v_revision<=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid administration revision'; END IF; SELECT * INTO item FROM public.administration_configurations WHERE id=v_id AND organization_id=v_org FOR UPDATE; IF NOT FOUND OR item.revision<>v_revision THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administration configuration is stale'; END IF;
   IF v_action='approve' THEN
     IF item.status<>'draft' OR item.created_by_identity_id=v_actor OR coalesce(payload->>'approvalReference','')='' OR (payload->>'approvedAt')::timestamptz IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administration approval denied'; END IF;
     UPDATE public.administration_configurations SET status='approved',revision=revision+1,approved_by_identity_id=v_actor,approved_at=(payload->>'approvedAt')::timestamptz,approval_reference=payload->>'approvalReference' WHERE id=v_id AND organization_id=v_org RETURNING * INTO item;
   ELSE
     IF item.status<>'approved' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administration retirement denied'; END IF;
     UPDATE public.administration_configurations SET status='retired',revision=revision+1 WHERE id=v_id AND organization_id=v_org RETURNING * INTO item;
   END IF;
 END IF;
 PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r8.administration_configuration','administration_configuration.'||v_action,'administration_configuration',item.id,v_org,'Record administration configuration',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),context.authorization_time);
 RETURN jsonb_build_object('configurationId',item.id,'organizationId',item.organization_id,'status',item.status,'revision',item.revision,'outcomeCode','recorded','correlationId',correlation_id);
END; $$;
REVOKE ALL ON FUNCTION public.mmhr_record_administration_configuration(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker; GRANT EXECUTE ON FUNCTION public.mmhr_record_administration_configuration(jsonb,uuid,uuid) TO authenticated;
