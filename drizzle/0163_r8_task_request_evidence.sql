ALTER TABLE "deal_follow_up_events" ADD COLUMN "original_request" jsonb;--> statement-breakpoint
ALTER TABLE "deal_follow_up_events" ADD CONSTRAINT "deal_follow_up_events_request_ck" CHECK ("deal_follow_up_events"."original_request" is null or (jsonb_typeof("deal_follow_up_events"."original_request") = 'object' and octet_length("deal_follow_up_events"."original_request"::text) <= 100000));
--> statement-breakpoint
-- Scratch additive input. Generate original_request and its nullable constraint
-- from the accompanying Drizzle schema before appending this reviewed chunk.
-- Preserve earlier NULL requests. Never invent a request from old snapshots.
-- Recovery: revoke the task write RPC. Keep reads, events, receipts and objects.

CREATE FUNCTION mmhr_private.r8_task_assert_request_evidence(p_event public.deal_follow_up_events)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request jsonb:=p_event.original_request; v_receipt public.security_command_receipts%ROWTYPE;
  v_actor uuid; v_manager boolean; v_allowed text[]; v_required text[]; v_field text; v_value text;
  v_expected jsonb; v_due timestamptz; v_state text; v_revision integer;
BEGIN
  IF jsonb_typeof(v_request) IS DISTINCT FROM 'object' OR octet_length(v_request::text)>100000 THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request evidence is required'; END IF;
  SELECT * INTO v_receipt FROM public.security_command_receipts WHERE id=p_event.receipt_id;
  IF v_receipt.id IS NULL OR v_receipt.actor_identity_id IS DISTINCT FROM p_event.actor_identity_id
    OR v_receipt.command IS DISTINCT FROM 'r8.deal_follow_up' OR v_receipt.action IS DISTINCT FROM p_event.action
    OR v_receipt.entity_id IS DISTINCT FROM p_event.task_id OR v_receipt.created_at IS DISTINCT FROM p_event.occurred_at
    OR v_request->>'organizationId' IS DISTINCT FROM p_event.organization_id::text
    OR v_request->>'taskId' IS DISTINCT FROM p_event.task_id::text
    OR v_request->>'correlationId' IS DISTINCT FROM p_event.correlation_id::text
    OR v_request->>'idempotencyKey' IS DISTINCT FROM v_receipt.idempotency_key::text
    OR v_request->>'action' IS DISTINCT FROM p_event.action OR jsonb_typeof(v_request->'action') IS DISTINCT FROM 'string'
    OR v_request->>'reason' IS DISTINCT FROM p_event.reason
    OR v_receipt.request_digest IS DISTINCT FROM encode(sha256(convert_to(v_request::text,'UTF8')),'hex')
    OR NOT EXISTS(SELECT 1 FROM public.audit_events a WHERE a.id=v_receipt.audit_event_id
      AND a.actor_type='user' AND a.actor_identity_id=p_event.actor_identity_id AND a.organization_id=p_event.organization_id
      AND a.command=v_receipt.command AND a.action=p_event.action AND a.entity_type='task' AND a.entity_id=p_event.task_id::text
      AND a.reason=p_event.reason AND a.correlation_id=p_event.correlation_id AND a.idempotency_key=v_receipt.idempotency_key::text
      AND a.occurred_at=p_event.occurred_at
      AND a.before_summary IS NOT DISTINCT FROM (CASE WHEN p_event.before_snapshot IS NULL THEN NULL
        ELSE jsonb_build_object('task_state',p_event.before_snapshot->>'state','task_revision',p_event.revision-1) END)
      AND a.after_summary=jsonb_build_object('task_state',p_event.after_snapshot->>'state','task_revision',p_event.revision)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request evidence is required'; END IF;

  v_allowed:=ARRAY['organizationId','correlationId','idempotencyKey','taskId','action','reason'];v_required:=v_allowed;
  CASE p_event.action
    WHEN 'create' THEN v_allowed:=v_allowed||ARRAY['dealId','title','description','ownerIdentityId','assigneeIdentityId','dueAt','priority'];v_required:=v_allowed;
    WHEN 'edit' THEN v_allowed:=v_allowed||ARRAY['expectedRevision','title','description','dueAt','priority'];v_required:=v_required||ARRAY['expectedRevision'];
    WHEN 'reassign' THEN v_allowed:=v_allowed||ARRAY['expectedRevision','assigneeIdentityId'];v_required:=v_allowed;
    WHEN 'transfer_owner' THEN v_allowed:=v_allowed||ARRAY['expectedRevision','ownerIdentityId'];v_required:=v_allowed;
    WHEN 'block' THEN v_allowed:=v_allowed||ARRAY['expectedRevision','blockerReason'];v_required:=v_allowed;
    WHEN 'start','resume','complete','cancel' THEN v_allowed:=v_allowed||ARRAY['expectedRevision'];v_required:=v_allowed;
    ELSE RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request evidence is required';
  END CASE;
  BEGIN
    PERFORM mmhr_private.r8_task_validate(v_request,p_event.correlation_id,v_allowed,v_required);
    FOREACH v_field IN ARRAY ARRAY['title','description','reason','blockerReason'] LOOP
      IF v_request ? v_field AND v_request->v_field<>'null'::jsonb THEN
        v_value:=v_request->>v_field;
        IF jsonb_typeof(v_request->v_field) IS DISTINCT FROM 'string' OR v_value<>btrim(v_value) OR length(v_value)<1
          OR length(v_value)>(CASE WHEN v_field='title' THEN 200 ELSE 2000 END)
          OR regexp_replace(v_value,E'[\t\r\n]','','g') ~ '[[:cntrl:]]' THEN
          RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request evidence is required'; END IF;
      ELSIF v_request ? v_field AND v_field<>'description' THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request evidence is required'; END IF;
    END LOOP;
    IF v_request ? 'priority' AND (jsonb_typeof(v_request->'priority') IS DISTINCT FROM 'string'
        OR v_request->>'priority' NOT IN ('low','normal','high','urgent'))
      OR v_request ? 'dueAt' AND v_request->'dueAt'<>'null'::jsonb AND (jsonb_typeof(v_request->'dueAt') IS DISTINCT FROM 'string'
        OR v_request->>'dueAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$')
      OR v_request ? 'ownerIdentityId' AND v_request->'ownerIdentityId'='null'::jsonb
      OR p_event.action='create' AND v_request->'dealId'='null'::jsonb
      OR p_event.action='edit' AND NOT v_request ?| ARRAY['title','description','dueAt','priority'] THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request evidence is required'; END IF;
    IF v_request ? 'dueAt' THEN v_due:=(v_request->>'dueAt')::timestamptz; END IF;
    IF p_event.action<>'create' THEN
      IF jsonb_typeof(v_request->'expectedRevision') IS DISTINCT FROM 'number'
        OR v_request->>'expectedRevision' !~ '^[1-9][0-9]{0,9}$'
        OR (v_request->>'expectedRevision')::numeric>2147483646 THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request evidence is required'; END IF;
      v_revision:=(v_request->>'expectedRevision')::integer;
    END IF;
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '22007' OR SQLSTATE '22008' OR SQLSTATE '22P02' OR SQLSTATE '22003' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request evidence is required';
  END;

  v_actor:=mmhr_private.r8_task_actor(p_event.organization_id);
  IF v_actor IS DISTINCT FROM p_event.actor_identity_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request actor is not authorized'; END IF;
  v_manager:=coalesce(mmhr_private.r8_task_manager(v_actor,p_event.organization_id,clock_timestamp()),false);
  IF v_request ? 'ownerIdentityId' AND NOT coalesce(mmhr_private.r8_task_eligible((v_request->>'ownerIdentityId')::uuid,p_event.organization_id,clock_timestamp()),false)
    OR v_request ? 'assigneeIdentityId' AND v_request->'assigneeIdentityId'<>'null'::jsonb
      AND NOT coalesce(mmhr_private.r8_task_eligible((v_request->>'assigneeIdentityId')::uuid,p_event.organization_id,clock_timestamp()),false) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request assignment is not authorized'; END IF;
  IF p_event.action='create' THEN
    IF p_event.before_snapshot IS NOT NULL OR p_event.revision<>1
      OR v_request->>'ownerIdentityId' IS DISTINCT FROM v_actor::text AND NOT v_manager
      OR NOT EXISTS(SELECT 1 FROM public.deals d WHERE d.id=(v_request->>'dealId')::uuid AND d.organization_id=p_event.organization_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request evidence is required'; END IF;
    v_expected:=jsonb_build_object('taskId',p_event.task_id,'organizationId',p_event.organization_id,'dealId',v_request->'dealId',
      'title',v_request->'title','description',v_request->'description','createdByIdentityId',v_actor,'ownerIdentityId',v_request->'ownerIdentityId',
      'assigneeIdentityId',v_request->'assigneeIdentityId','dueAt',v_due,'priority',v_request->'priority','state','open','blockerReason',NULL,
      'revision',1,'createdAt',p_event.occurred_at,'updatedAt',p_event.occurred_at);
  ELSE
    IF jsonb_typeof(p_event.before_snapshot) IS DISTINCT FROM 'object' OR v_revision IS DISTINCT FROM p_event.revision-1
      OR p_event.before_snapshot->'revision' IS DISTINCT FROM to_jsonb(v_revision)
      OR (p_event.before_snapshot->>'ownerIdentityId'=v_actor::text OR v_manager
        OR p_event.action IN ('start','block','resume','complete') AND p_event.before_snapshot->>'assigneeIdentityId'=v_actor::text) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request evidence is required'; END IF;
    v_state:=p_event.before_snapshot->>'state';
    IF v_state IS NULL OR v_state IN ('completed','cancelled') OR v_state NOT IN ('open','in_progress','blocked')
      OR p_event.action='start' AND v_state<>'open' OR p_event.action='block' AND v_state NOT IN ('open','in_progress')
      OR p_event.action='resume' AND v_state<>'blocked' OR p_event.action='complete' AND v_state NOT IN ('open','in_progress') THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request transition is not authorized'; END IF;
    v_expected:=p_event.before_snapshot||jsonb_build_object('revision',p_event.revision,'updatedAt',p_event.occurred_at);
    CASE p_event.action
      WHEN 'edit' THEN
        FOREACH v_field IN ARRAY ARRAY['title','description','priority'] LOOP
          IF v_request ? v_field THEN v_expected:=v_expected||jsonb_build_object(v_field,v_request->v_field); END IF;
        END LOOP;
        IF v_request ? 'dueAt' THEN v_expected:=v_expected||jsonb_build_object('dueAt',v_due); END IF;
      WHEN 'reassign' THEN v_expected:=v_expected||jsonb_build_object('assigneeIdentityId',v_request->'assigneeIdentityId');
      WHEN 'transfer_owner' THEN v_expected:=v_expected||jsonb_build_object('ownerIdentityId',v_request->'ownerIdentityId');
      WHEN 'start' THEN v_expected:=v_expected||jsonb_build_object('state','in_progress','blockerReason',NULL);
      WHEN 'block' THEN v_expected:=v_expected||jsonb_build_object('state','blocked','blockerReason',v_request->'blockerReason');
      WHEN 'resume' THEN v_expected:=v_expected||jsonb_build_object('state','in_progress','blockerReason',NULL);
      WHEN 'complete' THEN v_expected:=v_expected||jsonb_build_object('state','completed','blockerReason',NULL);
      WHEN 'cancel' THEN v_expected:=v_expected||jsonb_build_object('state','cancelled','blockerReason',NULL);
      ELSE RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request evidence is required';
    END CASE;
    IF v_expected->>'state'<>'blocked' THEN v_expected:=v_expected||jsonb_build_object('blockerReason',NULL); END IF;
  END IF;
  IF p_event.after_snapshot IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task request effects do not match'; END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r8_task_assert_request_evidence(public.deal_follow_up_events)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
-- Patches retain function identity, owner, ACLs, volatility and empty search path.
DO $$
DECLARE v_definition text; v_marker text; v_replacement text; v_count integer;
BEGIN
  SELECT pg_get_functiondef('mmhr_private.r8_task_event_guard()'::regprocedure) INTO v_definition;
  v_marker:='SELECT * INTO t FROM public.crm_tasks WHERE id=NEW.task_id;';
  v_replacement:=E'PERFORM mmhr_private.r8_task_assert_request_evidence(NEW);\n  '||v_marker;
  v_count:=(length(v_definition)-length(replace(v_definition,v_marker,'')))/length(v_marker);
  IF v_count<>1 THEN RAISE EXCEPTION 'Task event guard baseline requires review'; END IF;
  EXECUTE replace(v_definition,v_marker,v_replacement);

  SELECT pg_get_functiondef('mmhr_private.r8_task_commit_guard()'::regprocedure) INTO v_definition;
  v_marker:='SELECT * INTO event FROM public.deal_follow_up_events WHERE deal_follow_up_events.task_id=v_task_id AND revision=t.revision;';
  v_replacement:=v_marker||E'\n  -- Earlier immutable events have no recoverable original request. New inserts cannot use NULL.\n  IF event.original_request IS NOT NULL THEN PERFORM mmhr_private.r8_task_assert_request_evidence(event); END IF;';
  v_count:=(length(v_definition)-length(replace(v_definition,v_marker,'')))/length(v_marker);
  IF v_count<>1 THEN RAISE EXCEPTION 'Task commit guard baseline requires review'; END IF;
  EXECUTE replace(v_definition,v_marker,v_replacement);

  SELECT pg_get_functiondef('public.mmhr_record_deal_follow_up(jsonb,uuid,uuid)'::regprocedure) INTO v_definition;
  v_marker:='original_result,receipt_id,occurred_at,correlation_id)';
  v_replacement:='original_result,receipt_id,occurred_at,correlation_id,original_request)';
  v_count:=(length(v_definition)-length(replace(v_definition,v_marker,'')))/length(v_marker);
  IF v_count<>1 THEN RAISE EXCEPTION 'Task request writer columns require review'; END IF;
  v_definition:=replace(v_definition,v_marker,v_replacement);
  v_marker:='result,(receipt->>''receipt_id'')::uuid,checked_at,correlation_id);';
  v_replacement:='result,(receipt->>''receipt_id'')::uuid,checked_at,correlation_id,payload);';
  v_count:=(length(v_definition)-length(replace(v_definition,v_marker,'')))/length(v_marker);
  IF v_count<>1 THEN RAISE EXCEPTION 'Task request writer values require review'; END IF;
  EXECUTE replace(v_definition,v_marker,v_replacement);
END $$;
