-- R8 audited project-plan template, generation, and revision persistence.
CREATE OR REPLACE FUNCTION public.mmhr_record_project_plan(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; template public.project_plan_templates%ROWTYPE; plan public.project_plans%ROWTYPE; v_org uuid; v_actor uuid; v_id uuid; v_action text; v_revision integer;
BEGIN
 IF jsonb_typeof(payload)<>'object' OR coalesce(payload->>'action','') NOT IN ('create_template','approve_template','generate','edit') OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid project-plan input'; END IF;
 v_org:=(payload->>'organizationId')::uuid; v_actor:=(payload->>'actorIdentityId')::uuid; v_action:=payload->>'action'; SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access',v_org,'Record project plan',correlation_id,idempotency_key); IF v_actor<>context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF;
 receipt:=mmhr_private.r1_checked_receipt(context.actor_identity_id,'r8.project_plan',idempotency_key,payload); IF receipt IS NOT NULL THEN RETURN jsonb_build_object('entityId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id); END IF;
 IF v_action='create_template' THEN
   v_id:=(payload->>'templateId')::uuid; IF coalesce(payload->>'name','')='' OR coalesce((payload->>'version')::integer,0)<=0 OR jsonb_typeof(payload->'milestones')<>'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid project-plan template'; END IF;
   INSERT INTO public.project_plan_templates(id,organization_id,version,name,approved,milestones,created_by_identity_id,created_at) VALUES(v_id,v_org,(payload->>'version')::integer,btrim(payload->>'name'),false,payload->'milestones',v_actor,clock_timestamp()) RETURNING * INTO template;
 ELSIF v_action='approve_template' THEN
   v_id:=(payload->>'templateId')::uuid; SELECT * INTO template FROM public.project_plan_templates WHERE id=v_id AND organization_id=v_org FOR UPDATE; IF NOT FOUND OR template.approved THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Project-plan template approval denied'; END IF;
   UPDATE public.project_plan_templates SET approved=true,approved_by_identity_id=v_actor,approved_at=clock_timestamp() WHERE id=v_id AND organization_id=v_org RETURNING * INTO template;
 ELSE
   v_id:=(payload->>'planId')::uuid; IF v_action='generate' THEN
     IF coalesce(payload->>'dealId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'templateId','') !~ '^[0-9a-fA-F-]{36}$' OR (payload->>'targetGoLiveAt')::timestamptz IS NULL OR jsonb_typeof(payload->'milestones')<>'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid project-plan generation'; END IF;
     IF NOT EXISTS(SELECT 1 FROM public.deals WHERE id=(payload->>'dealId')::uuid AND organization_id=v_org) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Project-plan deal denied'; END IF;
     SELECT * INTO template FROM public.project_plan_templates WHERE id=(payload->>'templateId')::uuid AND organization_id=v_org AND approved FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Project-plan template denied'; END IF;
     INSERT INTO public.project_plans(id,organization_id,deal_id,template_id,template_version,target_go_live_at,revision,milestones,created_by_identity_id,created_at) VALUES(v_id,v_org,(payload->>'dealId')::uuid,template.id,template.version,(payload->>'targetGoLiveAt')::timestamptz,1,payload->'milestones',v_actor,clock_timestamp()) RETURNING * INTO plan;
   ELSE
     IF coalesce(payload->>'milestoneId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce((payload->>'expectedRevision')::integer,0)<=0 OR jsonb_typeof(payload->'milestones')<>'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid project-plan edit'; END IF;
     v_revision:=(payload->>'expectedRevision')::integer; SELECT * INTO plan FROM public.project_plans WHERE id=v_id AND organization_id=v_org FOR UPDATE; IF NOT FOUND OR plan.revision<>v_revision THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Project-plan edit denied'; END IF;
     UPDATE public.project_plans SET revision=revision+1,milestones=payload->'milestones' WHERE id=v_id AND organization_id=v_org RETURNING * INTO plan;
   END IF;
 END IF;
 PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r8.project_plan','project_plan.'||v_action,CASE WHEN v_action IN ('create_template','approve_template') THEN 'project_plan_template' ELSE 'project_plan' END,CASE WHEN v_action IN ('create_template','approve_template') THEN template.id ELSE plan.id END,v_org,'Record project plan',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),context.authorization_time);
 RETURN jsonb_build_object('entityId',CASE WHEN v_action IN ('create_template','approve_template') THEN template.id ELSE plan.id END,'organizationId',v_org,'status','completed','outcomeCode','recorded','correlationId',correlation_id);
END; $$;
REVOKE ALL ON FUNCTION public.mmhr_record_project_plan(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker; GRANT EXECUTE ON FUNCTION public.mmhr_record_project_plan(jsonb,uuid,uuid) TO authenticated;
