CREATE TABLE "demo_coordination_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"demo_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"actor_identity_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"correlation_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_coordination_events_revision_ck" CHECK ("demo_coordination_events"."revision" > 0),
	CONSTRAINT "demo_coordination_events_action_ck" CHECK ("demo_coordination_events"."action" in ('create', 'customer_availability', 'vendor_availability', 'confirm', 'reopen', 'complete', 'cancel', 'no_show')),
	CONSTRAINT "demo_coordination_events_snapshot_ck" CHECK (jsonb_typeof("demo_coordination_events"."snapshot") = 'object')
);
--> statement-breakpoint
ALTER TABLE "demo_rounds" ADD COLUMN "portal_recipient_id" uuid;--> statement-breakpoint
ALTER TABLE "demo_rounds" ADD COLUMN "coordination" jsonb;--> statement-breakpoint
ALTER TABLE "demo_coordination_events" ADD CONSTRAINT "demo_coordination_events_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_coordination_events" ADD CONSTRAINT "demo_coordination_events_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_coordination_events" ADD CONSTRAINT "demo_coordination_events_scope_fk" FOREIGN KEY ("organization_id","demo_id") REFERENCES "public"."demo_rounds"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "demo_coordination_events_revision_uq" ON "demo_coordination_events" USING btree ("demo_id","revision");--> statement-breakpoint
ALTER TABLE "demo_rounds" ADD CONSTRAINT "demo_rounds_portal_recipient_fk" FOREIGN KEY ("organization_id","portal_recipient_id") REFERENCES "public"."rfp_recipients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_rounds" ADD CONSTRAINT "demo_rounds_coordination_ck" CHECK (("demo_rounds"."portal_recipient_id" is null and "demo_rounds"."coordination" is null) or ("demo_rounds"."portal_recipient_id" is not null and "demo_rounds"."coordination" is not null and jsonb_typeof("demo_rounds"."coordination") = 'object'));
--> statement-breakpoint
-- Coordinated demos use the existing commercial records and preserve every revision.
-- Legacy demos retain their existing shape. Recovery revokes the new RPCs and retains history.
ALTER TABLE public.demo_coordination_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.demo_coordination_events FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
CREATE POLICY r6_deny_raw_coordination_events ON public.demo_coordination_events AS RESTRICTIVE
  FOR ALL TO anon,authenticated,service_role,mmhr_worker USING(false) WITH CHECK(false);
CREATE TRIGGER demo_coordination_events_append_only BEFORE UPDATE OR DELETE ON public.demo_coordination_events
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER demo_coordination_events_no_truncate BEFORE TRUNCATE ON public.demo_coordination_events
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint

CREATE FUNCTION mmhr_private.r6_demo_json_is_valid(kind text,value jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE keys text[]; item jsonb; k text; start_time timestamptz; end_time timestamptz;
BEGIN
  keys:=CASE kind
    WHEN 'plan' THEN ARRAY['round','audience','purpose','format','participants','requiredTopics']
    WHEN 'availability' THEN ARRAY['timeZone','windows','note']
    WHEN 'window' THEN ARRAY['startAt','endAt']
    WHEN 'schedule' THEN ARRAY['window','timeZone','location','reminderAt','confirmationNote']
    WHEN 'outcome' THEN ARRAY['attendance','feedback','score','commitments','requestedChanges','nextAction','nextActionAt','evidenceVersionIds']
    ELSE NULL END;
  IF keys IS NULL OR value IS NULL OR jsonb_typeof(value) IS DISTINCT FROM 'object'
    OR NOT(value ?& keys) OR EXISTS(SELECT 1 FROM jsonb_object_keys(value) field WHERE NOT(field=ANY(keys))) THEN RETURN false; END IF;
  IF kind IN ('availability','schedule') THEN
    IF jsonb_typeof(value->'timeZone') IS DISTINCT FROM 'string' OR length(value->>'timeZone')>100
      OR (value->>'timeZone') !~ '^(UTC|[A-Za-z_+-]+(/[A-Za-z0-9_+-]+)+)$'
      OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=value->>'timeZone') THEN RETURN false; END IF;
  END IF;
  IF kind='window' THEN
    FOR k IN SELECT unnest(keys) LOOP
      IF jsonb_typeof(value->k) IS DISTINCT FROM 'string'
        OR (value->>k) !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' THEN RETURN false; END IF;
    END LOOP;
    start_time:=(value->>'startAt')::timestamptz; end_time:=(value->>'endAt')::timestamptz;
    RETURN isfinite(start_time) AND isfinite(end_time) AND end_time-start_time BETWEEN interval '15 minutes' AND interval '8 hours';
  ELSIF kind='plan' THEN
    IF jsonb_typeof(value->'round') IS DISTINCT FROM 'number' OR (value->>'round') !~ '^([1-9]|1[0-9]|20)$'
      OR value->>'format' NOT IN ('remote','onsite','hybrid') OR jsonb_typeof(value->'format') IS DISTINCT FROM 'string'
      OR NOT mmhr_private.r4_clarification_text_is_valid(value->>'audience',500)
      OR NOT mmhr_private.r4_clarification_text_is_valid(value->>'purpose',2000)
      OR jsonb_typeof(value->'audience') IS DISTINCT FROM 'string' OR jsonb_typeof(value->'purpose') IS DISTINCT FROM 'string'
      OR jsonb_typeof(value->'participants') IS DISTINCT FROM 'array' OR jsonb_array_length(value->'participants') NOT BETWEEN 1 AND 30
      OR jsonb_typeof(value->'requiredTopics') IS DISTINCT FROM 'array' OR jsonb_array_length(value->'requiredTopics') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(value->'participants') LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT(item ?& ARRAY['name','role','organization'])
        OR (SELECT count(*) FROM jsonb_object_keys(item))<>3
        OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'role') IS DISTINCT FROM 'string'
        OR NOT mmhr_private.r4_clarification_text_is_valid(item->>'name',200)
        OR NOT mmhr_private.r4_clarification_text_is_valid(item->>'role',200)
        OR coalesce(item->>'organization','') NOT IN ('customer','vendor','mmhr') THEN RETURN false; END IF;
    END LOOP;
    FOR item IN SELECT * FROM jsonb_array_elements(value->'requiredTopics') LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR NOT mmhr_private.r4_clarification_text_is_valid(item#>>'{}',500) THEN RETURN false; END IF;
    END LOOP;
  ELSIF kind='availability' THEN
    IF jsonb_typeof(value->'windows') IS DISTINCT FROM 'array' OR jsonb_array_length(value->'windows') NOT BETWEEN 1 AND 10
      OR (value->'note'<>'null'::jsonb AND (jsonb_typeof(value->'note') IS DISTINCT FROM 'string'
        OR NOT mmhr_private.r4_clarification_text_is_valid(value->>'note',2000))) THEN RETURN false; END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(value->'windows') LOOP
      IF NOT mmhr_private.r6_demo_json_is_valid('window',item) THEN RETURN false; END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(value->'windows') WITH ORDINALITY a(item,pos)
      JOIN jsonb_array_elements(value->'windows') WITH ORDINALITY b(item,pos) ON a.pos<b.pos
      WHERE (a.item->>'startAt')::timestamptz<(b.item->>'endAt')::timestamptz
        AND (b.item->>'startAt')::timestamptz<(a.item->>'endAt')::timestamptz) THEN RETURN false; END IF;
  ELSIF kind='schedule' THEN
    IF NOT mmhr_private.r6_demo_json_is_valid('window',value->'window')
      OR jsonb_typeof(value->'location') IS DISTINCT FROM 'string' OR jsonb_typeof(value->'confirmationNote') IS DISTINCT FROM 'string'
      OR NOT mmhr_private.r4_clarification_text_is_valid(value->>'location',500)
      OR NOT mmhr_private.r4_clarification_text_is_valid(value->>'confirmationNote',2000)
      OR jsonb_typeof(value->'reminderAt') IS DISTINCT FROM 'string'
      OR (value->>'reminderAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
      OR NOT isfinite((value->>'reminderAt')::timestamptz)
      OR (value->>'reminderAt')::timestamptz>=(value->'window'->>'startAt')::timestamptz THEN RETURN false; END IF;
  ELSE
    IF jsonb_typeof(value->'attendance') IS DISTINCT FROM 'array' OR jsonb_array_length(value->'attendance') NOT BETWEEN 1 AND 30
      OR jsonb_typeof(value->'score') IS DISTINCT FROM 'number' OR (value->>'score') !~ '^[1-5]$'
      OR jsonb_typeof(value->'feedback') IS DISTINCT FROM 'string' OR jsonb_typeof(value->'nextAction') IS DISTINCT FROM 'string'
      OR NOT mmhr_private.r4_clarification_text_is_valid(value->>'feedback',5000)
      OR NOT mmhr_private.r4_clarification_text_is_valid(value->>'nextAction',2000)
      OR jsonb_typeof(value->'nextActionAt') IS DISTINCT FROM 'string'
      OR (value->>'nextActionAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
      OR NOT isfinite((value->>'nextActionAt')::timestamptz) THEN RETURN false; END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(value->'attendance') LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT(item ?& ARRAY['name','attended'])
        OR (SELECT count(*) FROM jsonb_object_keys(item))<>2 OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string'
        OR jsonb_typeof(item->'attended') IS DISTINCT FROM 'boolean' OR NOT mmhr_private.r4_clarification_text_is_valid(item->>'name',200) THEN RETURN false; END IF;
    END LOOP;
    FOREACH k IN ARRAY ARRAY['commitments','requestedChanges','evidenceVersionIds'] LOOP
      IF jsonb_typeof(value->k) IS DISTINCT FROM 'array' OR jsonb_array_length(value->k)>20 THEN RETURN false; END IF;
      FOR item IN SELECT * FROM jsonb_array_elements(value->k) LOOP
        IF jsonb_typeof(item) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
        IF k='evidenceVersionIds' THEN
          IF (item#>>'{}') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN RETURN false; END IF;
        ELSIF NOT mmhr_private.r4_clarification_text_is_valid(item#>>'{}',1000) THEN RETURN false; END IF;
      END LOOP;
    END LOOP;
  END IF;
  RETURN true;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_demo_json_is_valid(text,jsonb) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
--> statement-breakpoint

CREATE FUNCTION mmhr_private.r6_guard_demo_coordination()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state jsonb;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.portal_recipient_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Demo history is immutable'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.portal_recipient_id IS NULL THEN
    IF TG_OP='UPDATE' AND OLD.portal_recipient_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Demo association is immutable'; END IF;
    RETURN NEW;
  END IF;
  state:=NEW.coordination;
  IF NOT EXISTS(SELECT 1 FROM public.rfp_recipients rr JOIN public.deals d ON d.organization_id=rr.organization_id AND d.id=NEW.deal_id
    WHERE rr.id=NEW.portal_recipient_id AND rr.organization_id=NEW.organization_id
      AND rr.vendor_organization_id=NEW.vendor_organization_id AND d.vendor_organization_id=NEW.vendor_organization_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Demo recipient and deal scope denied'; END IF;
  IF TG_OP='UPDATE' AND (NEW.portal_recipient_id IS DISTINCT FROM OLD.portal_recipient_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.deal_id IS DISTINCT FROM OLD.deal_id
    OR NEW.customer_organization_id IS DISTINCT FROM OLD.customer_organization_id
    OR NEW.vendor_organization_id IS DISTINCT FROM OLD.vendor_organization_id
    OR NEW.requested_by_identity_id IS DISTINCT FROM OLD.requested_by_identity_id
    OR NEW.requested_at IS DISTINCT FROM OLD.requested_at OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.revision<>OLD.revision+1 OR NEW.coordination->'plan' IS DISTINCT FROM OLD.coordination->'plan') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Demo association and plan are immutable'; END IF;
  IF state IS NULL OR jsonb_typeof(state) IS DISTINCT FROM 'object'
    OR NOT(state ?& ARRAY['plan','customerAvailability','vendorAvailability','schedule','outcome','reason'])
    OR (SELECT count(*) FROM jsonb_object_keys(state))<>6
    OR NOT mmhr_private.r6_demo_json_is_valid('plan',state->'plan')
    OR (state->'customerAvailability'<>'null'::jsonb AND NOT mmhr_private.r6_demo_json_is_valid('availability',state->'customerAvailability'))
    OR (state->'vendorAvailability'<>'null'::jsonb AND NOT mmhr_private.r6_demo_json_is_valid('availability',state->'vendorAvailability'))
    OR (state->'schedule'<>'null'::jsonb AND NOT mmhr_private.r6_demo_json_is_valid('schedule',state->'schedule'))
    OR (state->'outcome'<>'null'::jsonb AND NOT mmhr_private.r6_demo_json_is_valid('outcome',state->'outcome'))
    OR (state->'reason'<>'null'::jsonb AND NOT mmhr_private.r4_clarification_text_is_valid(state->>'reason',2000))
    OR (NEW.status='scheduled' AND state->'schedule'='null'::jsonb)
    OR (NEW.status IN ('completed','no_show') AND state->'outcome'='null'::jsonb) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid demo coordination state'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r6_guard_demo_coordination() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
CREATE TRIGGER demo_coordination_guard BEFORE INSERT OR UPDATE OR DELETE ON public.demo_rounds
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r6_guard_demo_coordination();
CREATE TRIGGER demo_coordination_no_truncate BEFORE TRUNCATE ON public.demo_rounds
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint

-- Preserve the legacy public interface while preventing it from changing a coordinated demo.
ALTER FUNCTION public.mmhr_record_demo_round(jsonb,uuid,uuid) RENAME TO mmhr_record_legacy_demo_round;
REVOKE ALL ON FUNCTION public.mmhr_record_legacy_demo_round(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
CREATE FUNCTION public.mmhr_record_demo_round(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.demo_rounds d WHERE d.id=(payload->>'demoId')::uuid AND d.portal_recipient_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Use the coordinated demo workflow'; END IF;
  RETURN public.mmhr_record_legacy_demo_round(payload,correlation_id,idempotency_key);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_record_demo_round(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_demo_round(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint

CREATE FUNCTION public.mmhr_record_demo_coordination(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE action text; keys text[]; org_id uuid; actor uuid; checked_at timestamptz; receipt jsonb;
  demo public.demo_rounds%ROWTYPE; recipient public.rfp_recipients%ROWTYPE; candidate public.evaluation_candidates%ROWTYPE;
  state jsonb; old_status text; start_time timestamptz; end_time timestamptz; permission text; target_deal uuid;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL OR idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid demo command'; END IF;
  action:=payload->>'action';
  keys:=CASE action
    WHEN 'create' THEN ARRAY['action','organizationId','candidateId','recipientId','plan']
    WHEN 'customer_availability' THEN ARRAY['action','organizationId','demoId','expectedRevision','availability']
    WHEN 'vendor_availability' THEN ARRAY['action','organizationId','demoId','expectedRevision','availability']
    WHEN 'confirm' THEN ARRAY['action','organizationId','demoId','expectedRevision','schedule','reason']
    WHEN 'complete' THEN ARRAY['action','organizationId','demoId','expectedRevision','outcome','reason']
    WHEN 'no_show' THEN ARRAY['action','organizationId','demoId','expectedRevision','outcome','reason']
    WHEN 'reopen' THEN ARRAY['action','organizationId','demoId','expectedRevision','reason']
    WHEN 'cancel' THEN ARRAY['action','organizationId','demoId','expectedRevision','reason'] ELSE NULL END;
  IF keys IS NULL OR NOT(payload ?& keys) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE NOT(field=ANY(keys))) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid demo fields'; END IF;
  org_id:=(payload->>'organizationId')::uuid;
  permission:=CASE action WHEN 'customer_availability' THEN 'portal.customer.access' WHEN 'vendor_availability' THEN 'portal.vendor.access' ELSE 'rfp.approve' END;
  checked_at:=mmhr_private.r1_lock_security(); actor:=mmhr_private.r1_request_identity_id();
  IF actor IS NULL OR NOT mmhr_private.r1_verified_identity(actor,false)
    OR NOT mmhr_private.r1_request_has_permission(permission,org_id)
    OR (permission='rfp.approve' AND NOT mmhr_private.r1_request_has_permission('admin.access',NULL))
    OR EXISTS(SELECT 1 FROM public.identities WHERE status='recovery_pending') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Demo access denied'; END IF;
  receipt:=mmhr_private.r1_checked_receipt(actor,'r6.demo.coordination.'||action,idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO demo FROM public.demo_rounds d WHERE d.id=(receipt->>'entity_id')::uuid AND d.portal_recipient_id IS NOT NULL
      AND CASE WHEN action='vendor_availability' THEN d.vendor_organization_id=org_id ELSE d.organization_id=org_id END;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Demo replay denied'; END IF;
  ELSE
    IF action='create' THEN
      IF NOT mmhr_private.r6_demo_json_is_valid('plan',payload->'plan') THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid demo plan'; END IF;
      SELECT * INTO recipient FROM public.rfp_recipients rr WHERE rr.id=(payload->>'recipientId')::uuid AND rr.organization_id=org_id FOR UPDATE;
      IF NOT FOUND OR recipient.state NOT IN ('distributed','acknowledged','responded') THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Demo recipient denied'; END IF;
      SELECT c.* INTO candidate FROM public.evaluation_candidates c JOIN public.rfp_versions r ON r.id=recipient.rfp_version_id AND r.organization_id=c.organization_id
        JOIN public.products p ON p.id=c.product_id AND p.organization_id=c.vendor_organization_id AND p.vendor_profile_id=recipient.vendor_profile_id AND p.status='active'
        JOIN public.vendor_profiles vp ON vp.id=recipient.vendor_profile_id AND vp.organization_id=c.vendor_organization_id AND vp.status='active'
        JOIN public.orgs vendor ON vendor.id=c.vendor_organization_id AND vendor.type='vendor' AND vendor.status='active'
        JOIN public.orgs customer ON customer.id=c.organization_id AND customer.type='customer' AND customer.status='active'
        WHERE c.organization_id=org_id AND c.id=(payload->>'candidateId')::uuid AND c.intake_id=r.source_intake_id
          AND c.vendor_organization_id=recipient.vendor_organization_id AND c.state IN ('proposed','active','selected')
          AND r.status IN ('distributed','closed') AND EXISTS(SELECT 1 FROM public.evaluation_disclosures e
            WHERE e.organization_id=c.organization_id AND e.candidate_id=c.id AND e.vendor_organization_id=c.vendor_organization_id AND e.product_id=c.product_id);
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Demo candidate denied'; END IF;
      SELECT id INTO target_deal FROM public.deals d WHERE d.organization_id=org_id AND d.candidate_id=candidate.id
        AND d.vendor_organization_id=candidate.vendor_organization_id AND d.product_id=candidate.product_id AND d.status='open' ORDER BY d.created_at LIMIT 1 FOR UPDATE;
      IF target_deal IS NULL THEN
        INSERT INTO public.deals(organization_id,vendor_organization_id,product_id,candidate_id,owner_identity_id,stage,status,correlation_id)
          VALUES(org_id,candidate.vendor_organization_id,candidate.product_id,candidate.id,actor,'evaluation','open',correlation_id) RETURNING id INTO target_deal;
        PERFORM mmhr_private.r1_finish_security_command(actor,'r6.demo.deal','demo.deal.create','deal',target_deal,org_id,
          'Create deal for disclosed demo candidate',correlation_id,idempotency_key,payload,NULL,jsonb_build_object('state','completed'),checked_at);
      END IF;
      state:=jsonb_build_object('plan',payload->'plan','customerAvailability',NULL,'vendorAvailability',NULL,'schedule',NULL,'outcome',NULL,'reason',NULL);
      INSERT INTO public.demo_rounds(organization_id,deal_id,customer_organization_id,vendor_organization_id,requested_by_identity_id,
        requested_at,status,revision,portal_recipient_id,coordination,correlation_id)
        VALUES(org_id,target_deal,org_id,candidate.vendor_organization_id,actor,clock_timestamp(),'requested',1,recipient.id,state,correlation_id) RETURNING * INTO demo;
    ELSE
      IF coalesce(payload->>'expectedRevision','') !~ '^[1-9][0-9]{0,3}$' OR jsonb_typeof(payload->'expectedRevision') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid demo revision'; END IF;
      SELECT * INTO demo FROM public.demo_rounds d WHERE d.id=(payload->>'demoId')::uuid AND d.portal_recipient_id IS NOT NULL
        AND CASE WHEN action='vendor_availability' THEN d.vendor_organization_id=org_id ELSE d.organization_id=org_id END FOR UPDATE;
      IF NOT FOUND OR demo.revision<>(payload->>'expectedRevision')::integer OR demo.status IN ('completed','cancelled','no_show') THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Demo revision or state denied'; END IF;
      state:=demo.coordination; old_status:=demo.status;
      IF action IN ('customer_availability','vendor_availability','confirm') AND NOT EXISTS(
        SELECT 1 FROM public.rfp_recipients rr JOIN public.vendor_profiles vp ON vp.id=rr.vendor_profile_id AND vp.organization_id=rr.vendor_organization_id AND vp.status='active'
          JOIN public.orgs vendor ON vendor.id=rr.vendor_organization_id AND vendor.status='active'
        WHERE rr.id=demo.portal_recipient_id AND rr.organization_id=demo.organization_id AND rr.vendor_organization_id=demo.vendor_organization_id
          AND rr.state IN ('distributed','acknowledged','responded')) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Demo recipient is no longer active'; END IF;
      IF action IN ('customer_availability','vendor_availability') THEN
        IF demo.status<>'requested' OR NOT mmhr_private.r6_demo_json_is_valid('availability',payload->'availability') THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid demo availability'; END IF;
        IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'availability'->'windows') w
          WHERE (w->>'startAt')::timestamptz<=clock_timestamp() OR (w->>'endAt')::timestamptz>clock_timestamp()+interval '1 year') THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Demo availability must be in the future'; END IF;
        state:=jsonb_set(state,CASE action WHEN 'customer_availability' THEN ARRAY['customerAvailability'] ELSE ARRAY['vendorAvailability'] END,payload->'availability');
      ELSE
        IF jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string' OR NOT mmhr_private.r4_clarification_text_is_valid(payload->>'reason',2000) THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid demo reason'; END IF;
        state:=jsonb_set(state,ARRAY['reason'],payload->'reason');
        IF action='confirm' THEN
          IF demo.status<>'requested' OR NOT mmhr_private.r6_demo_json_is_valid('schedule',payload->'schedule')
            OR state->'customerAvailability'='null'::jsonb OR state->'vendorAvailability'='null'::jsonb THEN
            RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Demo confirmation requires both availabilities'; END IF;
          start_time:=(payload->'schedule'->'window'->>'startAt')::timestamptz; end_time:=(payload->'schedule'->'window'->>'endAt')::timestamptz;
          IF start_time<=clock_timestamp() OR (payload->'schedule'->>'reminderAt')::timestamptz<=clock_timestamp()
            OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(state->'customerAvailability'->'windows') w WHERE (w->>'startAt')::timestamptz<=start_time AND (w->>'endAt')::timestamptz>=end_time)
            OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(state->'vendorAvailability'->'windows') w WHERE (w->>'startAt')::timestamptz<=start_time AND (w->>'endAt')::timestamptz>=end_time) THEN
            RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Demo time does not fit accepted availability'; END IF;
          IF EXISTS(SELECT 1 FROM public.demo_rounds other WHERE other.id<>demo.id AND other.status='scheduled'
            AND (other.customer_organization_id=demo.customer_organization_id OR other.vendor_organization_id=demo.vendor_organization_id)
            AND other.scheduled_start_at<end_time AND other.scheduled_end_at>start_time) THEN
            RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Demo schedule conflicts with a confirmed meeting'; END IF;
          state:=jsonb_set(state,ARRAY['schedule'],payload->'schedule'); demo.status:='scheduled';
        ELSIF action='reopen' THEN
          IF demo.status<>'scheduled' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Only confirmed demos can reopen'; END IF;
          state:=jsonb_set(state,ARRAY['schedule'],'null'::jsonb); demo.status:='requested';
        ELSIF action IN ('complete','no_show') THEN
          IF demo.status<>'scheduled' OR demo.scheduled_end_at>clock_timestamp() OR NOT mmhr_private.r6_demo_json_is_valid('outcome',payload->'outcome') THEN
            RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Demo outcome requires a finished meeting'; END IF;
          IF (payload->'outcome'->>'nextActionAt')::timestamptz<=clock_timestamp() OR EXISTS(
            SELECT 1 FROM jsonb_array_elements_text(payload->'outcome'->'evidenceVersionIds') evidence
            WHERE NOT EXISTS(SELECT 1 FROM public.workflow_document_versions v JOIN public.workflow_documents d ON d.id=v.document_id AND d.organization_id=v.organization_id
              WHERE v.id=evidence::uuid AND v.organization_id=demo.organization_id AND v.scan_state='clean' AND v.state='approved' AND d.state='active')) THEN
            RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Demo outcome evidence or next action denied'; END IF;
          IF jsonb_array_length(payload->'outcome'->'attendance')<>jsonb_array_length(state->'plan'->'participants') OR EXISTS(
            SELECT 1 FROM jsonb_array_elements(payload->'outcome'->'attendance') WITH ORDINALITY a(item,pos)
            WHERE a.item->>'name' IS DISTINCT FROM state->'plan'->'participants'->(a.pos::integer-1)->>'name') THEN
            RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Record attendance for the planned participants'; END IF;
          state:=jsonb_set(state,ARRAY['outcome'],payload->'outcome'); demo.status:=CASE action WHEN 'complete' THEN 'completed' ELSE 'no_show' END;
        ELSE demo.status:='cancelled'; END IF;
      END IF;
      UPDATE public.demo_rounds SET coordination=state,status=demo.status,revision=revision+1,updated_at=clock_timestamp(),
        scheduled_start_at=CASE WHEN demo.status='scheduled' THEN (state->'schedule'->'window'->>'startAt')::timestamptz ELSE NULL END,
        scheduled_end_at=CASE WHEN demo.status='scheduled' THEN (state->'schedule'->'window'->>'endAt')::timestamptz ELSE NULL END,
        meeting_reference=CASE WHEN demo.status='scheduled' THEN 'demo:'||demo.id::text ELSE NULL END
        WHERE id=demo.id RETURNING * INTO demo;
      IF old_status<>demo.status THEN
        INSERT INTO public.demo_round_history(organization_id,demo_id,from_status,to_status,expected_revision,actor_identity_id,reason,occurred_at,correlation_id)
          VALUES(demo.organization_id,demo.id,old_status,demo.status,demo.revision-1,actor,payload->>'reason',clock_timestamp(),correlation_id);
      END IF;
    END IF;
    INSERT INTO public.demo_coordination_events(organization_id,demo_id,revision,action,actor_identity_id,snapshot,correlation_id)
      VALUES(demo.organization_id,demo.id,demo.revision,action,actor,jsonb_build_object('status',demo.status,'coordination',demo.coordination),correlation_id);
    PERFORM mmhr_private.r1_finish_security_command(actor,'r6.demo.coordination.'||action,'demo.coordination.'||action,'demo_round',demo.id,org_id,
      'Record coordinated demo',correlation_id,idempotency_key,payload,NULL,jsonb_build_object('state','completed','version',demo.revision),checked_at);
  END IF;
  RETURN jsonb_build_object('organizationId',org_id,'correlationId',correlation_id,'demoId',demo.id,'revision',demo.revision,'status',demo.status,
    'outcomeCode',CASE WHEN receipt IS NULL THEN 'recorded' ELSE 'replayed' END);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_record_demo_coordination(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_demo_coordination(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint

CREATE FUNCTION public.mmhr_get_demo_coordination(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE org_id uuid; view_name text; after_id uuid; after_candidate uuid; after_recipient uuid;
  rows jsonb; choices jsonb:='[]'::jsonb; cursor_id uuid; choice_cursor jsonb:='null'::jsonb;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL
    OR NOT(payload ?& ARRAY['organizationId','view']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('organizationId','view','afterId','afterChoice'))
    OR coalesce(payload->>'view','') NOT IN ('staff','customer','vendor') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid demo read'; END IF;
  org_id:=(payload->>'organizationId')::uuid; view_name:=payload->>'view'; after_id:=(payload->>'afterId')::uuid;
  IF payload ? 'afterChoice' THEN
    IF view_name<>'staff' OR jsonb_typeof(payload->'afterChoice') IS DISTINCT FROM 'object'
      OR NOT(payload->'afterChoice' ?& ARRAY['candidateId','recipientId'])
      OR (SELECT count(*) FROM jsonb_object_keys(payload->'afterChoice'))<>2 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid demo choice cursor'; END IF;
    after_candidate:=(payload->'afterChoice'->>'candidateId')::uuid; after_recipient:=(payload->'afterChoice'->>'recipientId')::uuid;
    IF after_candidate IS NULL OR after_recipient IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid demo choice cursor'; END IF;
  END IF;
  PERFORM mmhr_private.r1_lock_security();
  IF NOT mmhr_private.r1_request_has_permission(CASE view_name WHEN 'customer' THEN 'portal.customer.access' WHEN 'vendor' THEN 'portal.vendor.access' ELSE 'rfp.approve' END,org_id)
    OR (view_name='staff' AND NOT mmhr_private.r1_request_has_permission('admin.access',NULL)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Demo read denied'; END IF;
  SELECT coalesce(jsonb_agg(p.item ORDER BY p.id),'[]'::jsonb) INTO rows FROM (
    SELECT d.id,jsonb_build_object('demoId',d.id,'revision',d.revision,'status',d.status,'coordination',d.coordination,
      'customerName',customer.name,'vendorName',vendor.name,'updatedAt',d.updated_at) item
    FROM public.demo_rounds d JOIN public.rfp_recipients rr ON rr.id=d.portal_recipient_id AND rr.organization_id=d.organization_id
      JOIN public.vendor_profiles vp ON vp.id=rr.vendor_profile_id AND vp.organization_id=rr.vendor_organization_id
      JOIN public.orgs customer ON customer.id=d.customer_organization_id AND customer.status='active'
      JOIN public.orgs vendor ON vendor.id=d.vendor_organization_id AND vendor.status='active'
    WHERE d.portal_recipient_id IS NOT NULL AND (after_id IS NULL OR d.id>after_id)
      AND (view_name='staff' OR (rr.state IN ('distributed','acknowledged','responded') AND vp.status='active'))
      AND CASE WHEN view_name='vendor' THEN d.vendor_organization_id=org_id ELSE d.organization_id=org_id END ORDER BY d.id LIMIT 26) p;
  IF jsonb_array_length(rows)>25 THEN rows:=rows-25; cursor_id:=(rows->24->>'demoId')::uuid; END IF;
  IF view_name='staff' THEN
    SELECT coalesce(jsonb_agg(p.item ORDER BY p.candidate_id,p.recipient_id),'[]'::jsonb) INTO choices FROM (
      SELECT c.id candidate_id,rr.id recipient_id,jsonb_build_object('candidateId',c.id,'recipientId',rr.id,'providerName',vendor.name,'productName',product.name,'requestTitle',r.title) item
      FROM public.evaluation_candidates c JOIN public.rfp_versions r ON r.source_intake_id=c.intake_id AND r.organization_id=c.organization_id AND r.status IN ('distributed','closed')
      JOIN public.rfp_recipients rr ON rr.rfp_version_id=r.id AND rr.organization_id=c.organization_id AND rr.vendor_organization_id=c.vendor_organization_id AND rr.state IN ('distributed','acknowledged','responded')
      JOIN public.products product ON product.id=c.product_id AND product.organization_id=c.vendor_organization_id AND product.vendor_profile_id=rr.vendor_profile_id AND product.status='active'
      JOIN public.vendor_profiles vp ON vp.id=rr.vendor_profile_id AND vp.organization_id=rr.vendor_organization_id AND vp.status='active'
      JOIN public.orgs vendor ON vendor.id=c.vendor_organization_id AND vendor.status='active'
      WHERE c.organization_id=org_id AND c.state IN ('proposed','active','selected')
      AND (after_candidate IS NULL OR (c.id,rr.id)>(after_candidate,after_recipient))
      AND EXISTS(SELECT 1 FROM public.evaluation_disclosures e WHERE e.organization_id=c.organization_id AND e.candidate_id=c.id AND e.product_id=c.product_id AND e.vendor_organization_id=c.vendor_organization_id)
      ORDER BY c.id,rr.id LIMIT 26) p;
    IF jsonb_array_length(choices)>25 THEN
      choices:=choices-25; choice_cursor:=jsonb_build_object('candidateId',choices->24->>'candidateId','recipientId',choices->24->>'recipientId');
    END IF;
  END IF;
  RETURN jsonb_build_object('organizationId',org_id,'correlationId',correlation_id,'items',rows,'choices',choices,'nextCursor',cursor_id,'nextChoiceCursor',choice_cursor);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_demo_coordination(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_demo_coordination(jsonb,uuid) TO authenticated;
--> statement-breakpoint

CREATE FUNCTION public.mmhr_get_demo_coordination_history(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE org_id uuid; view_name text; target_demo_id uuid; after_revision integer; rows jsonb; next_revision integer;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL
    OR NOT(payload ?& ARRAY['organizationId','view','demoId','afterRevision'])
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('organizationId','view','demoId','afterRevision'))
    OR coalesce(payload->>'view','') NOT IN ('staff','customer','vendor')
    OR jsonb_typeof(payload->'afterRevision') IS DISTINCT FROM 'number'
    OR (payload->>'afterRevision') !~ '^[0-9]{1,4}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid demo history read'; END IF;
  org_id:=(payload->>'organizationId')::uuid; target_demo_id:=(payload->>'demoId')::uuid;
  view_name:=payload->>'view'; after_revision:=(payload->>'afterRevision')::integer;
  PERFORM mmhr_private.r1_lock_security();
  IF NOT mmhr_private.r1_request_has_permission(CASE view_name WHEN 'customer' THEN 'portal.customer.access' WHEN 'vendor' THEN 'portal.vendor.access' ELSE 'rfp.approve' END,org_id)
    OR (view_name='staff' AND NOT mmhr_private.r1_request_has_permission('admin.access',NULL))
    OR NOT EXISTS(SELECT 1 FROM public.demo_rounds d
      JOIN public.rfp_recipients rr ON rr.id=d.portal_recipient_id AND rr.organization_id=d.organization_id
      JOIN public.vendor_profiles vp ON vp.id=rr.vendor_profile_id AND vp.organization_id=rr.vendor_organization_id
      JOIN public.orgs customer ON customer.id=d.customer_organization_id AND customer.status='active'
      JOIN public.orgs vendor ON vendor.id=d.vendor_organization_id AND vendor.status='active'
      WHERE d.id=target_demo_id AND d.coordination IS NOT NULL
        AND CASE WHEN view_name='vendor' THEN d.vendor_organization_id=org_id ELSE d.organization_id=org_id END
        AND (view_name='staff' OR (rr.state IN ('distributed','acknowledged','responded') AND vp.status='active'))) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Demo history denied'; END IF;
  SELECT coalesce(jsonb_agg(p.item ORDER BY p.revision),'[]'::jsonb) INTO rows FROM (
    SELECT e.revision,jsonb_build_object('revision',e.revision,'action',e.action,'status',e.snapshot->'status',
      'coordination',e.snapshot->'coordination','occurredAt',e.occurred_at) item
    FROM public.demo_coordination_events e WHERE e.demo_id=target_demo_id AND e.revision>after_revision ORDER BY e.revision LIMIT 26) p;
  IF jsonb_array_length(rows)>25 THEN rows:=rows-25; next_revision:=(rows->24->>'revision')::integer; END IF;
  RETURN jsonb_build_object('organizationId',org_id,'correlationId',correlation_id,'demoId',target_demo_id,'items',rows,'nextRevision',next_revision);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_demo_coordination_history(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_demo_coordination_history(jsonb,uuid) TO authenticated;

