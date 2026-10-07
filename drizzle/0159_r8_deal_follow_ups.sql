CREATE TABLE "deal_follow_up_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"actor_identity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"before_snapshot" jsonb,
	"after_snapshot" jsonb NOT NULL,
	"original_result" jsonb NOT NULL,
	"receipt_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"correlation_id" uuid NOT NULL,
	CONSTRAINT "deal_follow_up_events_revision_ck" CHECK ("deal_follow_up_events"."revision" > 0),
	CONSTRAINT "deal_follow_up_events_action_ck" CHECK ("deal_follow_up_events"."action" in ('create','edit','reassign','transfer_owner','start','block','resume','complete','cancel')),
	CONSTRAINT "deal_follow_up_events_reason_ck" CHECK (length(btrim("deal_follow_up_events"."reason")) between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "deal_follow_up_queue_versions" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "deal_follow_up_queue_versions_revision_ck" CHECK ("deal_follow_up_queue_versions"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "deal_follow_ups" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"created_by_identity_id" uuid NOT NULL,
	"owner_identity_id" uuid NOT NULL,
	"priority" text NOT NULL,
	"blocker_reason" text,
	CONSTRAINT "deal_follow_ups_priority_ck" CHECK ("deal_follow_ups"."priority" in ('low','normal','high','urgent')),
	CONSTRAINT "deal_follow_ups_blocker_ck" CHECK ("deal_follow_ups"."blocker_reason" is null or length(btrim("deal_follow_ups"."blocker_reason")) between 1 and 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "deal_follow_ups_scope_uq" ON "deal_follow_ups" USING btree ("organization_id","task_id");
--> statement-breakpoint
ALTER TABLE "deal_follow_up_events" ADD CONSTRAINT "deal_follow_up_events_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_follow_up_events" ADD CONSTRAINT "deal_follow_up_events_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_follow_up_events" ADD CONSTRAINT "deal_follow_up_events_scope_fk" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."deal_follow_ups"("organization_id","task_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_follow_up_queue_versions" ADD CONSTRAINT "deal_follow_up_queue_versions_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_follow_ups" ADD CONSTRAINT "deal_follow_ups_created_by_identity_id_identities_id_fk" FOREIGN KEY ("created_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_follow_ups" ADD CONSTRAINT "deal_follow_ups_owner_identity_id_identities_id_fk" FOREIGN KEY ("owner_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_follow_ups" ADD CONSTRAINT "deal_follow_ups_task_scope_fk" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."crm_tasks"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_follow_ups" ADD CONSTRAINT "deal_follow_ups_deal_scope_fk" FOREIGN KEY ("organization_id","deal_id") REFERENCES "public"."deals"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_follow_up_events_revision_uq" ON "deal_follow_up_events" USING btree ("task_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_follow_up_events_receipt_uq" ON "deal_follow_up_events" USING btree ("receipt_id");--> statement-breakpoint
--> statement-breakpoint
-- Additive task authority and evidence guards follow the generated table SQL.
-- Recovery: revoke the new public RPCs. Retain all task rows and immutable history.

CREATE FUNCTION mmhr_private.r8_task_actor(requested_org uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE claims jsonb:=auth.jwt(); checked_at timestamptz; actor uuid; request_session uuid;
BEGIN
  checked_at:=mmhr_private.r1_lock_security();
  IF requested_org IS NULL OR claims->>'role' IS DISTINCT FROM 'authenticated' OR claims->>'aal' IS DISTINCT FROM 'aal2'
    OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$' OR coalesce(claims->>'iat','') !~ '^[0-9]{1,12}$'
    OR lower(coalesce(claims->>'sub','')) IS DISTINCT FROM lower(auth.uid()::text)
    OR coalesce(claims->>'session_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request is not authorized'; END IF;
  request_session:=(claims->>'session_id')::uuid;
  IF (claims->>'exp')::numeric<=extract(epoch FROM checked_at)
    OR (claims->>'iat')::numeric>floor(extract(epoch FROM checked_at)) OR (claims->>'iat')::numeric>=(claims->>'exp')::numeric
    OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=request_session AND s.user_id=auth.uid()
      AND (s.not_after IS NULL OR s.not_after>checked_at))
    OR NOT mmhr_private.r1_session_is_aal2(auth.uid(),request_session,checked_at)
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request is not authorized'; END IF;
  actor:=mmhr_private.r1_request_identity_id();
  IF actor IS NULL OR NOT mmhr_private.r1_verified_identity(actor,false)
    OR NOT mmhr_private.r1_evaluate_permission(actor,'admin.access',NULL,'aal2',checked_at,false)
    OR NOT mmhr_private.r1_evaluate_permission(actor,'workspace.access',requested_org,'aal2',checked_at,false)
    OR NOT EXISTS(SELECT 1 FROM public.orgs WHERE id=requested_org AND type='customer' AND status='active' AND NOT migration_review_required)
    OR EXISTS(SELECT 1 FROM public.identities WHERE status='recovery_pending')
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request is not authorized'; END IF;
  RETURN actor;
END $$;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_eligible(identity_id uuid,org_id uuid,checked_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT $1 IS NOT NULL AND mmhr_private.r1_verified_identity($1,false)
    AND mmhr_private.r1_evaluate_permission($1,'admin.access',NULL,'aal2',$3,false)
    AND mmhr_private.r1_evaluate_permission($1,'workspace.access',$2,'aal2',$3,false)
$$;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_manager(identity_id uuid,org_id uuid,checked_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT mmhr_private.r8_task_eligible($1,$2,$3) AND EXISTS(
    SELECT 1 FROM public.platform_role_assignments a JOIN public.role_definitions r
      ON r.stable_key=a.role_key AND r.kind='platform' AND r.state='active'
    WHERE a.identity_id=$1 AND a.state='active' AND a.role_key IN ('admin','super_admin')
      AND mmhr_private.r1_assignment_authority_allows(a.id,'admin.access',NULL,$3,false)
      AND mmhr_private.r1_role_authority_allows(mmhr_private.r1_current_role_authority(r.id),'admin.access',NULL,'allow',$3,false))
$$;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_validate(payload jsonb,correlation_id uuid,allowed text[],required text[])
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE field text;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL
    OR payload->>'correlationId' IS DISTINCT FROM correlation_id::text
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) key WHERE NOT key=ANY(allowed))
    OR EXISTS(SELECT 1 FROM unnest(required) key WHERE NOT payload ? key)
    THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task input'; END IF;
  FOREACH field IN ARRAY ARRAY['organizationId','correlationId','idempotencyKey','taskId','dealId','ownerIdentityId','assigneeIdentityId','afterId'] LOOP
    IF payload ? field AND payload->field<>'null'::jsonb AND (jsonb_typeof(payload->field)<>'string'
      OR payload->>field !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
      THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task input'; END IF;
  END LOOP;
  IF payload->'organizationId'='null'::jsonb OR payload->'correlationId'='null'::jsonb
    THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task input'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_snapshot(task_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('taskId',t.id,'organizationId',t.organization_id,'dealId',b.deal_id,'title',t.title,
    'description',t.description,'createdByIdentityId',b.created_by_identity_id,'ownerIdentityId',b.owner_identity_id,
    'assigneeIdentityId',t.assignee_identity_id,'dueAt',t.due_at,'priority',b.priority,'state',t.state,
    'blockerReason',b.blocker_reason,'revision',t.revision,'createdAt',t.created_at,'updatedAt',t.updated_at)
  FROM public.crm_tasks t JOIN public.deal_follow_ups b ON b.task_id=t.id AND b.organization_id=t.organization_id WHERE t.id=$1
$$;
--> statement-breakpoint
-- Historical identities remain visible only through an authorized task projection.
-- This lookup does not require the historical identity to retain current access.
CREATE FUNCTION mmhr_private.r8_task_identity_label(identity_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce((SELECT normalized_email FROM public.identities WHERE id=$1 AND email_verified_at IS NOT NULL),'Staff account unavailable')
$$;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_deal_label(deal_id uuid,org_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT concat_ws(' · ',customer.name,vendor.name,product.name,replace(d.stage,'_',' '))
  FROM public.deals d JOIN public.orgs customer ON customer.id=d.organization_id
    LEFT JOIN public.orgs vendor ON vendor.id=d.vendor_organization_id
    LEFT JOIN public.products product ON product.id=d.product_id AND product.organization_id=d.vendor_organization_id
  WHERE d.id=$1 AND d.organization_id=$2
$$;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_display_snapshot(snapshot jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE WHEN $1 IS NULL THEN NULL ELSE $1||jsonb_build_object(
    'dealLabel',mmhr_private.r8_task_deal_label(($1->>'dealId')::uuid,($1->>'organizationId')::uuid),
    'createdByLabel',mmhr_private.r8_task_identity_label(($1->>'createdByIdentityId')::uuid),
    'ownerLabel',mmhr_private.r8_task_identity_label(($1->>'ownerIdentityId')::uuid),
    'assigneeLabel',CASE WHEN $1->>'assigneeIdentityId' IS NULL THEN NULL ELSE mmhr_private.r8_task_identity_label(($1->>'assigneeIdentityId')::uuid) END) END
$$;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_item(task_id uuid,actor uuid,checked_at timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT mmhr_private.r8_task_display_snapshot(mmhr_private.r8_task_snapshot(t.id))||jsonb_build_object(
    'ownerAvailable',mmhr_private.r8_task_eligible(b.owner_identity_id,t.organization_id,$3),
    'assigneeAvailable',CASE WHEN t.assignee_identity_id IS NULL THEN NULL ELSE mmhr_private.r8_task_eligible(t.assignee_identity_id,t.organization_id,$3) END,
    'canManage',t.state NOT IN ('completed','cancelled') AND (b.owner_identity_id=$2 OR mmhr_private.r8_task_manager($2,t.organization_id,$3)),
    'canProgress',t.state NOT IN ('completed','cancelled') AND (b.owner_identity_id=$2 OR t.assignee_identity_id=$2 OR mmhr_private.r8_task_manager($2,t.organization_id,$3)))
  FROM public.crm_tasks t JOIN public.deal_follow_ups b ON b.task_id=t.id WHERE t.id=$1
$$;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_binding_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (NEW.task_id<>OLD.task_id OR NEW.organization_id<>OLD.organization_id
    OR NEW.deal_id<>OLD.deal_id OR NEW.created_by_identity_id<>OLD.created_by_identity_id))
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task association is immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_commit_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_task_id uuid; t public.crm_tasks%ROWTYPE; b public.deal_follow_ups%ROWTYPE; event public.deal_follow_up_events%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='crm_tasks' THEN v_task_id:=NEW.id; ELSE v_task_id:=NEW.task_id; END IF;
  SELECT * INTO b FROM public.deal_follow_ups WHERE deal_follow_ups.task_id=v_task_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO t FROM public.crm_tasks WHERE id=v_task_id;
  SELECT * INTO event FROM public.deal_follow_up_events WHERE deal_follow_up_events.task_id=v_task_id AND revision=t.revision;
  IF event.id IS NULL OR t.subject_type<>'deal' OR t.subject_id<>b.deal_id OR t.organization_id<>b.organization_id
    OR event.after_snapshot IS DISTINCT FROM mmhr_private.r8_task_snapshot(t.id)
    OR (t.state='blocked') IS DISTINCT FROM (b.blocker_reason IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM public.security_command_receipts r JOIN public.audit_events a ON a.id=r.audit_event_id
      WHERE r.id=event.receipt_id AND r.entity_id=t.id AND r.actor_identity_id=event.actor_identity_id
        AND r.command='r8.deal_follow_up' AND r.action=event.action AND a.organization_id=t.organization_id
        AND a.correlation_id=event.correlation_id AND a.command=r.command AND a.entity_id=t.id::text
        AND a.actor_type='user' AND a.actor_identity_id=event.actor_identity_id AND a.action=event.action AND a.entity_type='task'
        AND a.reason=btrim(event.reason) AND a.idempotency_key=r.idempotency_key::text
        AND a.occurred_at=event.occurred_at AND r.created_at=event.occurred_at
        AND a.before_summary IS NOT DISTINCT FROM (CASE WHEN event.before_snapshot IS NULL THEN NULL
          ELSE jsonb_build_object('task_state',event.before_snapshot->>'state','task_revision',event.revision-1) END)
        AND a.after_summary=jsonb_build_object('task_state',t.state,'task_revision',t.revision))
    OR event.original_result IS DISTINCT FROM jsonb_build_object('taskId',t.id,'organizationId',t.organization_id,
      'action',event.action,'state',t.state,'revision',t.revision,'outcomeCode','recorded','correlationId',event.correlation_id)
    OR event.correlation_id IS DISTINCT FROM t.correlation_id
    OR (t.revision=1 AND (event.action<>'create' OR event.before_snapshot IS NOT NULL OR t.state<>'open'
      OR b.created_by_identity_id<>event.actor_identity_id))
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task evidence is required'; END IF;
  IF t.revision>1 AND NOT EXISTS(SELECT 1 FROM public.deal_follow_up_events prior WHERE prior.task_id=t.id AND prior.revision=t.revision-1
    AND prior.after_snapshot=event.before_snapshot AND prior.after_snapshot->>'state' NOT IN ('completed','cancelled'))
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task history is required'; END IF;
  IF event.before_snapshot IS NOT NULL AND event.before_snapshot->>'state'<>t.state AND NOT EXISTS(
    SELECT 1 FROM public.crm_task_state_history h WHERE h.task_id=t.id AND h.organization_id=t.organization_id
      AND h.expected_revision=t.revision-1 AND h.from_state=event.before_snapshot->>'state' AND h.to_state=t.state
      AND h.actor_identity_id=event.actor_identity_id AND h.correlation_id=event.correlation_id AND h.reason=event.reason
      AND h.occurred_at=event.occurred_at)
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task state history is required'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_delete_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='TRUNCATE' THEN
    IF EXISTS(SELECT 1 FROM public.deal_follow_ups) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed tasks are immutable'; END IF;
    RETURN NULL;
  END IF;
  IF EXISTS(SELECT 1 FROM public.deal_follow_ups WHERE task_id=OLD.id)
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Managed tasks are immutable'; END IF;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_event_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.crm_tasks%ROWTYPE; b public.deal_follow_ups%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.crm_tasks WHERE id=NEW.task_id;
  SELECT * INTO b FROM public.deal_follow_ups WHERE task_id=NEW.task_id;
  IF t.id IS NULL OR b.task_id IS NULL OR NEW.organization_id<>t.organization_id OR NEW.revision<>t.revision
    OR NEW.after_snapshot IS DISTINCT FROM mmhr_private.r8_task_snapshot(t.id)
    OR NEW.correlation_id<>t.correlation_id
    OR NEW.original_result IS DISTINCT FROM jsonb_build_object('taskId',t.id,'organizationId',t.organization_id,
      'action',NEW.action,'state',t.state,'revision',t.revision,'outcomeCode','recorded','correlationId',NEW.correlation_id)
    OR NOT EXISTS(SELECT 1 FROM public.security_command_receipts r JOIN public.audit_events a ON a.id=r.audit_event_id
      WHERE r.id=NEW.receipt_id AND r.entity_id=t.id AND r.actor_identity_id=NEW.actor_identity_id
        AND r.command='r8.deal_follow_up' AND r.action=NEW.action AND a.organization_id=t.organization_id
        AND a.correlation_id=NEW.correlation_id AND a.command=r.command AND a.entity_id=t.id::text
        AND a.actor_type='user' AND a.actor_identity_id=NEW.actor_identity_id AND a.action=NEW.action AND a.entity_type='task'
        AND a.reason=btrim(NEW.reason) AND a.idempotency_key=r.idempotency_key::text
        AND a.occurred_at=NEW.occurred_at AND r.created_at=NEW.occurred_at
        AND a.before_summary IS NOT DISTINCT FROM (CASE WHEN NEW.before_snapshot IS NULL THEN NULL
          ELSE jsonb_build_object('task_state',NEW.before_snapshot->>'state','task_revision',NEW.revision-1) END)
        AND a.after_summary=jsonb_build_object('task_state',t.state,'task_revision',t.revision))
    OR (t.revision=1 AND (NEW.action<>'create' OR NEW.before_snapshot IS NOT NULL OR t.state<>'open'
      OR b.created_by_identity_id<>NEW.actor_identity_id))
    OR (t.revision>1 AND NOT EXISTS(SELECT 1 FROM public.deal_follow_up_events prior WHERE prior.task_id=t.id
      AND prior.revision=t.revision-1 AND prior.after_snapshot=NEW.before_snapshot
      AND prior.after_snapshot->>'state' NOT IN ('completed','cancelled')))
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task event evidence is required'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
ALTER TABLE public.deal_follow_ups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.deal_follow_up_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.deal_follow_up_queue_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.deal_follow_ups,public.deal_follow_up_events,public.deal_follow_up_queue_versions
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE POLICY r8_deny_raw_follow_ups ON public.deal_follow_ups AS RESTRICTIVE FOR ALL
  TO anon,authenticated,service_role,mmhr_worker,mmhr_document_worker USING(false) WITH CHECK(false);
--> statement-breakpoint
CREATE POLICY r8_deny_raw_follow_up_events ON public.deal_follow_up_events AS RESTRICTIVE FOR ALL
  TO anon,authenticated,service_role,mmhr_worker,mmhr_document_worker USING(false) WITH CHECK(false);
--> statement-breakpoint
CREATE POLICY r8_deny_raw_follow_up_queue ON public.deal_follow_up_queue_versions AS RESTRICTIVE FOR ALL
  TO anon,authenticated,service_role,mmhr_worker,mmhr_document_worker USING(false) WITH CHECK(false);
--> statement-breakpoint
CREATE TRIGGER deal_follow_ups_binding_guard BEFORE UPDATE OR DELETE ON public.deal_follow_ups
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r8_task_binding_guard();
--> statement-breakpoint
CREATE TRIGGER deal_follow_ups_no_truncate BEFORE TRUNCATE ON public.deal_follow_ups
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint
CREATE TRIGGER deal_follow_up_events_append_only BEFORE UPDATE OR DELETE ON public.deal_follow_up_events
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint
CREATE TRIGGER deal_follow_up_events_insert_guard BEFORE INSERT ON public.deal_follow_up_events
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r8_task_event_guard();
--> statement-breakpoint
CREATE TRIGGER deal_follow_up_events_no_truncate BEFORE TRUNCATE ON public.deal_follow_up_events
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER deal_follow_ups_commit_guard AFTER INSERT OR UPDATE ON public.deal_follow_ups
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mmhr_private.r8_task_commit_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER crm_follow_ups_commit_guard AFTER INSERT OR UPDATE ON public.crm_tasks
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mmhr_private.r8_task_commit_guard();
--> statement-breakpoint
CREATE TRIGGER crm_follow_ups_delete_guard BEFORE DELETE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r8_task_delete_guard();
--> statement-breakpoint
CREATE TRIGGER crm_follow_ups_truncate_guard BEFORE TRUNCATE ON public.crm_tasks
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r8_task_delete_guard();
--> statement-breakpoint
CREATE TRIGGER crm_task_state_history_append_only BEFORE UPDATE OR DELETE ON public.crm_task_state_history
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint
CREATE TRIGGER crm_task_state_history_no_truncate BEFORE TRUNCATE ON public.crm_task_state_history
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r8_task_actor(uuid),mmhr_private.r8_task_eligible(uuid,uuid,timestamptz),
  mmhr_private.r8_task_manager(uuid,uuid,timestamptz),mmhr_private.r8_task_validate(jsonb,uuid,text[],text[]),
  mmhr_private.r8_task_snapshot(uuid),mmhr_private.r8_task_item(uuid,uuid,timestamptz),mmhr_private.r8_task_binding_guard(),
  mmhr_private.r8_task_commit_guard(),mmhr_private.r8_task_delete_guard(),mmhr_private.r8_task_event_guard(),
  mmhr_private.r8_task_identity_label(uuid),mmhr_private.r8_task_deal_label(uuid,uuid),mmhr_private.r8_task_display_snapshot(jsonb)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
DO $$
DECLARE definition text;
  marker constant text := $marker$WHEN e.key = 'version' THEN$marker$;
  task_rule constant text := $rule$WHEN e.key = 'task_state' THEN NOT (jsonb_typeof(e.item) = 'string'
        AND e.item #>> '{}' IN ('open','in_progress','blocked','completed','cancelled'))
      WHEN e.key = 'task_revision' THEN NOT (jsonb_typeof(e.item) = 'number'
        AND e.item #>> '{}' ~ '^[1-9][0-9]{0,9}$'
        AND CASE WHEN e.item #>> '{}' ~ '^[1-9][0-9]{0,9}$' THEN (e.item #>> '{}')::numeric <= 2147483647 ELSE false END)
      WHEN e.key = 'version' THEN$rule$;
BEGIN
  SELECT pg_get_functiondef('mmhr_private.r1_audit_summary_is_safe(jsonb)'::regprocedure) INTO definition;
  IF (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 THEN
    RAISE EXCEPTION 'Task audit summary baseline requires review';
  END IF;
  EXECUTE replace(definition,marker,task_rule);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_record_deal_follow_up(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org_id uuid; actor uuid; target_id uuid; checked_at timestamptz; requested_action text; allowed text[];
  required text[]; t public.crm_tasks%ROWTYPE; b public.deal_follow_ups%ROWTYPE; receipt jsonb; original jsonb;
  before_snapshot jsonb; result jsonb; next_state text; manager boolean; field text; value text; expected_revision integer;
BEGIN
  requested_action:=payload->>'action';
  allowed:=ARRAY['organizationId','correlationId','idempotencyKey','taskId','action','reason']; required:=allowed;
  CASE requested_action
    WHEN 'create' THEN allowed:=allowed||ARRAY['dealId','title','description','ownerIdentityId','assigneeIdentityId','dueAt','priority']; required:=allowed;
    WHEN 'edit' THEN allowed:=allowed||ARRAY['expectedRevision','title','description','dueAt','priority']; required:=required||ARRAY['expectedRevision'];
    WHEN 'reassign' THEN allowed:=allowed||ARRAY['expectedRevision','assigneeIdentityId']; required:=allowed;
    WHEN 'transfer_owner' THEN allowed:=allowed||ARRAY['expectedRevision','ownerIdentityId']; required:=allowed;
    WHEN 'block' THEN allowed:=allowed||ARRAY['expectedRevision','blockerReason']; required:=allowed;
    WHEN 'start','resume','complete','cancel' THEN allowed:=allowed||ARRAY['expectedRevision']; required:=allowed;
    ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task input';
  END CASE;
  PERFORM mmhr_private.r8_task_validate(payload,correlation_id,allowed,required);
  IF idempotency_key IS NULL OR payload->>'idempotencyKey' IS DISTINCT FROM idempotency_key::text
    OR payload->'taskId'='null'::jsonb OR payload->'idempotencyKey'='null'::jsonb
    THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task input'; END IF;
  FOREACH field IN ARRAY ARRAY['title','description','reason','blockerReason'] LOOP
    IF payload ? field AND payload->field<>'null'::jsonb THEN
      value:=payload->>field;
      IF jsonb_typeof(payload->field)<>'string' OR value<>btrim(value) OR length(value)<1
        OR length(value)>(CASE WHEN field='title' THEN 200 ELSE 2000 END)
        OR regexp_replace(value,E'[\t\r\n]','','g') ~ '[[:cntrl:]]'
        THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task input'; END IF;
    ELSIF payload ? field AND field<>'description' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task input'; END IF;
  END LOOP;
  IF payload ? 'priority' AND (jsonb_typeof(payload->'priority')<>'string' OR payload->>'priority' NOT IN ('low','normal','high','urgent'))
    OR payload ? 'dueAt' AND payload->'dueAt'<>'null'::jsonb AND (jsonb_typeof(payload->'dueAt')<>'string'
      OR payload->>'dueAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$')
    OR payload ? 'ownerIdentityId' AND payload->'ownerIdentityId'='null'::jsonb
    OR requested_action='create' AND payload->'dealId'='null'::jsonb
    OR requested_action='edit' AND NOT payload ?| ARRAY['title','description','dueAt','priority']
    THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task input'; END IF;
  IF requested_action<>'create' THEN
    IF jsonb_typeof(payload->'expectedRevision')<>'number' OR payload->>'expectedRevision' !~ '^[1-9][0-9]{0,9}$'
      OR (payload->>'expectedRevision')::numeric>2147483646 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task input'; END IF;
    expected_revision:=(payload->>'expectedRevision')::integer;
  END IF;
  org_id:=(payload->>'organizationId')::uuid; target_id:=(payload->>'taskId')::uuid;
  actor:=mmhr_private.r8_task_actor(org_id); checked_at:=clock_timestamp();
  manager:=mmhr_private.r8_task_manager(actor,org_id,checked_at);
  -- Authority and scope precede replay. Historical creators never authorize a task.
  IF requested_action='create' THEN
    IF (payload->>'ownerIdentityId')::uuid<>actor AND NOT manager
      THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request is not authorized'; END IF;
    SELECT * INTO b FROM public.deal_follow_ups WHERE task_id=target_id FOR UPDATE;
    IF b.task_id IS NOT NULL AND (b.organization_id<>org_id OR NOT (manager OR b.owner_identity_id=actor))
      THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request is not authorized'; END IF;
  ELSE
    SELECT * INTO t FROM public.crm_tasks WHERE id=target_id AND organization_id=org_id FOR UPDATE;
    SELECT * INTO b FROM public.deal_follow_ups WHERE task_id=target_id AND organization_id=org_id FOR UPDATE;
    IF t.id IS NULL OR b.task_id IS NULL OR NOT (manager OR b.owner_identity_id=actor
      OR (requested_action IN ('start','block','resume','complete') AND t.assignee_identity_id=actor))
      THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request is not authorized'; END IF;
  END IF;
  receipt:=mmhr_private.r1_checked_receipt(actor,'r8.deal_follow_up',idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    SELECT original_result INTO original FROM public.deal_follow_up_events WHERE receipt_id=(receipt->>'receipt_id')::uuid
      AND organization_id=org_id AND task_id=target_id AND actor_identity_id=actor AND action=requested_action;
    IF original IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task receipt is incomplete'; END IF;
    RETURN original||jsonb_build_object('outcomeCode','replayed');
  END IF;
  IF payload ? 'ownerIdentityId' AND NOT mmhr_private.r8_task_eligible((payload->>'ownerIdentityId')::uuid,org_id,checked_at)
    OR payload ? 'assigneeIdentityId' AND payload->'assigneeIdentityId'<>'null'::jsonb
      AND NOT mmhr_private.r8_task_eligible((payload->>'assigneeIdentityId')::uuid,org_id,checked_at)
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task assignment is not authorized'; END IF;
  IF requested_action='create' THEN
    IF NOT EXISTS(SELECT 1 FROM public.deals WHERE id=(payload->>'dealId')::uuid AND organization_id=org_id)
      THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request is not authorized'; END IF;
    INSERT INTO public.crm_tasks(id,organization_id,subject_type,subject_id,title,description,assignee_identity_id,due_at,state,revision,correlation_id,created_at,updated_at)
      VALUES(target_id,org_id,'deal',(payload->>'dealId')::uuid,payload->>'title',payload->>'description',
        (payload->>'assigneeIdentityId')::uuid,(payload->>'dueAt')::timestamptz,'open',1,correlation_id,checked_at,checked_at) RETURNING * INTO t;
    INSERT INTO public.deal_follow_ups(task_id,organization_id,deal_id,created_by_identity_id,owner_identity_id,priority)
      VALUES(target_id,org_id,t.subject_id,actor,(payload->>'ownerIdentityId')::uuid,payload->>'priority');
  ELSE
    IF t.revision<>expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Task revision changed'; END IF;
    IF t.state IN ('completed','cancelled') OR requested_action='start' AND t.state<>'open'
      OR requested_action='block' AND t.state NOT IN ('open','in_progress')
      OR requested_action='resume' AND t.state<>'blocked'
      OR requested_action='complete' AND t.state NOT IN ('open','in_progress')
      THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task transition'; END IF;
    before_snapshot:=mmhr_private.r8_task_snapshot(target_id);
    next_state:=CASE requested_action WHEN 'start' THEN 'in_progress' WHEN 'block' THEN 'blocked'
      WHEN 'resume' THEN 'in_progress' WHEN 'complete' THEN 'completed' WHEN 'cancel' THEN 'cancelled' ELSE t.state END;
    UPDATE public.crm_tasks SET title=CASE WHEN payload ? 'title' THEN payload->>'title' ELSE title END,
      description=CASE WHEN payload ? 'description' THEN payload->>'description' ELSE description END,
      due_at=CASE WHEN payload ? 'dueAt' THEN (payload->>'dueAt')::timestamptz ELSE due_at END,
      assignee_identity_id=CASE WHEN requested_action='reassign' THEN (payload->>'assigneeIdentityId')::uuid ELSE assignee_identity_id END,
      state=next_state,revision=revision+1,correlation_id=mmhr_record_deal_follow_up.correlation_id,updated_at=checked_at
      WHERE id=target_id;
    UPDATE public.deal_follow_ups SET priority=CASE WHEN payload ? 'priority' THEN payload->>'priority' ELSE priority END,
      owner_identity_id=CASE WHEN requested_action='transfer_owner' THEN (payload->>'ownerIdentityId')::uuid ELSE owner_identity_id END,
      blocker_reason=CASE WHEN requested_action='block' THEN payload->>'blockerReason' WHEN next_state<>'blocked' THEN NULL ELSE blocker_reason END
      WHERE task_id=target_id;
    IF next_state<>t.state THEN INSERT INTO public.crm_task_state_history(organization_id,task_id,from_state,to_state,expected_revision,
      actor_identity_id,occurred_at,reason,correlation_id) VALUES(org_id,target_id,t.state,next_state,t.revision,actor,checked_at,payload->>'reason',correlation_id); END IF;
    SELECT * INTO t FROM public.crm_tasks WHERE id=target_id;
  END IF;
  result:=jsonb_build_object('taskId',target_id,'organizationId',org_id,'action',requested_action,'state',t.state,
    'revision',t.revision,'outcomeCode','recorded','correlationId',correlation_id);
  receipt:=mmhr_private.r1_finish_security_command(actor,'r8.deal_follow_up',requested_action,'task',target_id,org_id,payload->>'reason',
    correlation_id,idempotency_key,payload,CASE WHEN before_snapshot IS NULL THEN NULL ELSE jsonb_build_object('task_state',before_snapshot->>'state','task_revision',t.revision-1) END,
    jsonb_build_object('task_state',t.state,'task_revision',t.revision),checked_at);
  INSERT INTO public.deal_follow_up_events(organization_id,task_id,revision,actor_identity_id,action,reason,before_snapshot,after_snapshot,original_result,receipt_id,occurred_at,correlation_id)
    VALUES(org_id,target_id,t.revision,actor,requested_action,payload->>'reason',before_snapshot,mmhr_private.r8_task_snapshot(target_id),result,(receipt->>'receipt_id')::uuid,checked_at,correlation_id);
  INSERT INTO public.deal_follow_up_queue_versions(organization_id,revision) VALUES(org_id,1)
    ON CONFLICT(organization_id) DO UPDATE SET revision=deal_follow_up_queue_versions.revision+1;
  RETURN result;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_record_deal_follow_up(jsonb,uuid,uuid) FROM PUBLIC,anon,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_record_deal_follow_up(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_in_queue(queue text,actor uuid,owner_id uuid,assignee_id uuid,state text,due_at timestamptz,as_of timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT CASE $1 WHEN 'all' THEN true WHEN 'owned' THEN $3=$2 AND $5 NOT IN ('completed','cancelled')
    WHEN 'assigned' THEN $4=$2 AND $5 NOT IN ('completed','cancelled')
    WHEN 'blocked' THEN $5='blocked' WHEN 'overdue' THEN $5 NOT IN ('completed','cancelled') AND $6<$7
    WHEN 'completed' THEN $5='completed' ELSE false END
$$;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_read(payload jsonb,correlation_id uuid,view_name text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed text[]:=ARRAY['organizationId','correlationId']; required text[]:=allowed; org_id uuid; actor uuid;
  checked_at timestamptz; as_of timestamptz; v_task_id uuid; requested_queue text; current_version integer; after_id uuid; items jsonb;
  item jsonb; counts jsonb; next_cursor jsonb; before_revision integer; events jsonb; last_revision integer; kind text;
BEGIN
  CASE view_name
    WHEN 'queue' THEN allowed:=allowed||ARRAY['queue','cursor']; required:=required||ARRAY['queue'];
    WHEN 'detail' THEN allowed:=allowed||ARRAY['taskId']; required:=allowed;
    WHEN 'history' THEN allowed:=allowed||ARRAY['taskId','beforeRevision']; required:=required||ARRAY['taskId'];
    WHEN 'choices' THEN allowed:=allowed||ARRAY['kind','afterId']; required:=required||ARRAY['kind'];
    ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task read';
  END CASE;
  PERFORM mmhr_private.r8_task_validate(payload,correlation_id,allowed,required);
  org_id:=(payload->>'organizationId')::uuid; actor:=mmhr_private.r8_task_actor(org_id); checked_at:=clock_timestamp();
  IF view_name='queue' THEN
    as_of:=date_trunc('milliseconds',checked_at);
    requested_queue:=payload->>'queue';
    IF jsonb_typeof(payload->'queue')<>'string' OR requested_queue NOT IN ('all','owned','assigned','blocked','overdue','completed')
      THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task queue'; END IF;
    SELECT coalesce((SELECT revision FROM public.deal_follow_up_queue_versions WHERE organization_id=org_id),0) INTO current_version;
    IF payload ? 'cursor' THEN
      IF jsonb_typeof(payload->'cursor') IS DISTINCT FROM 'object'
        OR NOT (payload->'cursor' ?& ARRAY['version','afterId','organizationId','actorIdentityId','queue','asOf'])
        OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload->'cursor') key WHERE key NOT IN ('version','afterId','organizationId','actorIdentityId','queue','asOf'))
        OR jsonb_typeof(payload->'cursor'->'version') IS DISTINCT FROM 'number'
        OR coalesce(payload->'cursor'->>'version','') !~ '^(0|[1-9][0-9]{0,9})$'
        OR coalesce(payload->'cursor'->>'afterId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        OR payload->'cursor'->>'organizationId' IS DISTINCT FROM org_id::text
        OR payload->'cursor'->>'actorIdentityId' IS DISTINCT FROM actor::text
        OR payload->'cursor'->>'queue' IS DISTINCT FROM requested_queue
        OR jsonb_typeof(payload->'cursor'->'asOf') IS DISTINCT FROM 'string'
        OR coalesce(payload->'cursor'->>'asOf','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
        THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task cursor'; END IF;
      IF (payload->'cursor'->>'version')::numeric<>current_version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Task queue changed'; END IF;
      after_id:=(payload->'cursor'->>'afterId')::uuid;
      as_of:=(payload->'cursor'->>'asOf')::timestamptz;
      IF as_of>checked_at OR as_of<checked_at-interval '15 minutes' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Task queue observation expired'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.crm_tasks t JOIN public.deal_follow_ups b ON b.task_id=t.id
        WHERE t.id=after_id AND t.organization_id=org_id
          AND mmhr_private.r8_task_in_queue(requested_queue,actor,b.owner_identity_id,t.assignee_identity_id,t.state,t.due_at,as_of))
        THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task cursor'; END IF;
    END IF;
    SELECT jsonb_build_object('owned',count(*) FILTER(WHERE b.owner_identity_id=actor AND t.state NOT IN ('completed','cancelled')),
      'assigned',count(*) FILTER(WHERE t.assignee_identity_id=actor AND t.state NOT IN ('completed','cancelled')),'blocked',count(*) FILTER(WHERE t.state='blocked'),
      'overdue',count(*) FILTER(WHERE t.state NOT IN ('completed','cancelled') AND t.due_at<as_of),
      'completed',count(*) FILTER(WHERE t.state='completed')) INTO counts
      FROM public.crm_tasks t JOIN public.deal_follow_ups b ON b.task_id=t.id WHERE t.organization_id=org_id;
    SELECT coalesce(jsonb_agg(mmhr_private.r8_task_item(rows.id,actor,checked_at) ORDER BY rows.id),'[]'::jsonb) INTO items FROM (
      SELECT t.id FROM public.crm_tasks t JOIN public.deal_follow_ups b ON b.task_id=t.id WHERE t.organization_id=org_id
        AND (after_id IS NULL OR t.id>after_id)
        AND mmhr_private.r8_task_in_queue(requested_queue,actor,b.owner_identity_id,t.assignee_identity_id,t.state,t.due_at,as_of)
      ORDER BY t.id LIMIT 26) rows;
    IF jsonb_array_length(items)>25 THEN
      items:=items-25; next_cursor:=jsonb_build_object('version',current_version,'afterId',items->24->>'taskId',
        'organizationId',org_id,'actorIdentityId',actor,'queue',requested_queue,'asOf',as_of);
    END IF;
    RETURN jsonb_build_object('organizationId',org_id,'correlationId',correlation_id,'queue',requested_queue,'version',current_version,
      'asOf',as_of,'counts',counts,'items',items,'nextCursor',next_cursor);
  ELSIF view_name IN ('detail','history') THEN
    v_task_id:=(payload->>'taskId')::uuid;
    IF v_task_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.deal_follow_ups WHERE deal_follow_ups.task_id=v_task_id AND organization_id=org_id)
      THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request is not authorized'; END IF;
    IF view_name='detail' THEN RETURN jsonb_build_object('organizationId',org_id,'correlationId',correlation_id,
      'item',mmhr_private.r8_task_item(v_task_id,actor,checked_at)); END IF;
    IF payload ? 'beforeRevision' THEN
      IF jsonb_typeof(payload->'beforeRevision') IS DISTINCT FROM 'number' OR coalesce(payload->>'beforeRevision','') !~ '^[1-9][0-9]{0,9}$'
        OR (payload->>'beforeRevision')::numeric>2147483647 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task history cursor'; END IF;
      before_revision:=(payload->>'beforeRevision')::integer;
      IF NOT EXISTS(SELECT 1 FROM public.deal_follow_up_events e WHERE e.task_id=v_task_id AND e.organization_id=org_id AND e.revision=before_revision)
        THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task history cursor'; END IF;
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('eventId',e.id,'revision',e.revision,'action',e.action,'actorIdentityId',e.actor_identity_id,
      'actorLabel',mmhr_private.r8_task_identity_label(e.actor_identity_id),'occurredAt',e.occurred_at,'reason',e.reason,
      'before',mmhr_private.r8_task_display_snapshot(e.before_snapshot),'after',mmhr_private.r8_task_display_snapshot(e.after_snapshot)) ORDER BY e.revision DESC),'[]'::jsonb) INTO events
      FROM (SELECT * FROM public.deal_follow_up_events WHERE deal_follow_up_events.task_id=v_task_id AND organization_id=org_id
        AND (before_revision IS NULL OR revision<before_revision) ORDER BY revision DESC LIMIT 26) e;
    IF jsonb_array_length(events)>25 THEN events:=events-25; last_revision:=(events->24->>'revision')::integer; END IF;
    RETURN jsonb_build_object('organizationId',org_id,'correlationId',correlation_id,'taskId',v_task_id,'events',events,'nextRevision',last_revision);
  ELSE
    kind:=payload->>'kind'; after_id:=(payload->>'afterId')::uuid;
    IF jsonb_typeof(payload->'kind') IS DISTINCT FROM 'string' OR kind NOT IN ('deals','people')
      OR payload ? 'afterId' AND payload->'afterId'='null'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task choices'; END IF;
    IF kind='deals' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'label',mmhr_private.r8_task_deal_label(d.id,org_id)) ORDER BY d.id),'[]'::jsonb) INTO items
        FROM (SELECT id,stage FROM public.deals WHERE organization_id=org_id AND (after_id IS NULL OR id>after_id) ORDER BY id LIMIT 26) d;
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'label',i.normalized_email) ORDER BY i.id),'[]'::jsonb) INTO items
        FROM (SELECT id,normalized_email FROM public.identities WHERE (after_id IS NULL OR id>after_id)
          AND mmhr_private.r8_task_eligible(id,org_id,checked_at) ORDER BY id LIMIT 26) i;
    END IF;
    IF jsonb_array_length(items)>25 THEN items:=items-25; next_cursor:=to_jsonb(items->24->>'id'); END IF;
    RETURN jsonb_build_object('organizationId',org_id,'correlationId',correlation_id,'kind',kind,'items',items,'nextCursor',next_cursor);
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_deal_follow_up_queue(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$ SELECT mmhr_private.r8_task_read($1,$2,'queue') $$;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_deal_follow_up(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$ SELECT mmhr_private.r8_task_read($1,$2,'detail') $$;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_deal_follow_up_history(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$ SELECT mmhr_private.r8_task_read($1,$2,'history') $$;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_deal_follow_up_choices(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$ SELECT mmhr_private.r8_task_read($1,$2,'choices') $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r8_task_read(jsonb,uuid,text),mmhr_private.r8_task_in_queue(text,uuid,uuid,uuid,text,timestamptz,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_deal_follow_up_queue(jsonb,uuid),public.mmhr_get_deal_follow_up(jsonb,uuid),
  public.mmhr_get_deal_follow_up_history(jsonb,uuid),public.mmhr_get_deal_follow_up_choices(jsonb,uuid)
  FROM PUBLIC,anon,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_get_deal_follow_up_queue(jsonb,uuid),public.mmhr_get_deal_follow_up(jsonb,uuid),
  public.mmhr_get_deal_follow_up_history(jsonb,uuid),public.mmhr_get_deal_follow_up_choices(jsonb,uuid) TO authenticated;
--> statement-breakpoint
-- Defer insert evidence checks because the command records state history before
-- its event. Legacy tasks without a managed binding retain their prior path.
CREATE FUNCTION mmhr_private.r8_task_state_history_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.deal_follow_ups WHERE task_id=NEW.task_id) THEN RETURN NULL; END IF;
  IF (SELECT count(*) FROM public.crm_task_state_history WHERE task_id=NEW.task_id
      AND expected_revision=NEW.expected_revision) <> 1
    OR NOT EXISTS(SELECT 1 FROM public.deal_follow_up_events e
      WHERE e.task_id=NEW.task_id AND e.organization_id=NEW.organization_id AND e.revision=NEW.expected_revision+1
        AND e.before_snapshot IS NOT NULL AND e.before_snapshot->>'state'=NEW.from_state
        AND e.after_snapshot->>'state'=NEW.to_state AND NEW.from_state<>NEW.to_state
        AND e.actor_identity_id=NEW.actor_identity_id AND e.reason=NEW.reason
        AND e.occurred_at=NEW.occurred_at AND e.correlation_id=NEW.correlation_id)
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task state history evidence is required'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER crm_follow_up_state_insert_guard AFTER INSERT ON public.crm_task_state_history
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mmhr_private.r8_task_state_history_guard();
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_queue_update_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.organization_id<>OLD.organization_id OR NEW.revision<>OLD.revision+1
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task queue version is monotonic'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r8_task_queue_commit_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_revision integer; event_count bigint;
BEGIN
  SELECT revision INTO current_revision FROM public.deal_follow_up_queue_versions WHERE organization_id=NEW.organization_id;
  SELECT count(*) INTO event_count FROM public.deal_follow_up_events WHERE organization_id=NEW.organization_id;
  IF current_revision IS NULL OR current_revision<1 OR current_revision<>event_count
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task queue event evidence is required'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER deal_follow_up_queue_update_guard BEFORE UPDATE ON public.deal_follow_up_queue_versions
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r8_task_queue_update_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER deal_follow_up_queue_commit_guard AFTER INSERT OR UPDATE ON public.deal_follow_up_queue_versions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mmhr_private.r8_task_queue_commit_guard();
--> statement-breakpoint
CREATE TRIGGER deal_follow_up_queue_no_delete BEFORE DELETE ON public.deal_follow_up_queue_versions
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint
CREATE TRIGGER deal_follow_up_queue_no_truncate BEFORE TRUNCATE ON public.deal_follow_up_queue_versions
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r8_task_state_history_guard(),mmhr_private.r8_task_queue_update_guard(),
  mmhr_private.r8_task_queue_commit_guard() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
