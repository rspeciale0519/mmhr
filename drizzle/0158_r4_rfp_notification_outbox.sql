CREATE TABLE "mmhr_private"."rfp_notification_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"token" text NOT NULL,
	"outcome" text DEFAULT 'leased' NOT NULL,
	"failure_code" text,
	"provider_message_id" text,
	"result_digest" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "rfp_notification_attempt_number_ck" CHECK ("mmhr_private"."rfp_notification_attempts"."number" between 1 and 3),
	CONSTRAINT "rfp_notification_attempt_token_ck" CHECK ("mmhr_private"."rfp_notification_attempts"."token" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "rfp_notification_attempt_outcome_ck" CHECK ("mmhr_private"."rfp_notification_attempts"."outcome" in ('leased','accepted','failed','needs_attention')),
	CONSTRAINT "rfp_notification_attempt_expiry_ck" CHECK ("mmhr_private"."rfp_notification_attempts"."expires_at" = "mmhr_private"."rfp_notification_attempts"."started_at" + interval '60 seconds'),
	CONSTRAINT "rfp_notification_attempt_finished_ck" CHECK (("mmhr_private"."rfp_notification_attempts"."outcome" = 'leased' and "mmhr_private"."rfp_notification_attempts"."finished_at" is null) or ("mmhr_private"."rfp_notification_attempts"."outcome" <> 'leased' and "mmhr_private"."rfp_notification_attempts"."finished_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_notification_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mmhr_private"."rfp_notification_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"rfp_version_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"vendor_organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"recipient_identity_id" uuid NOT NULL,
	"recipient_email" text NOT NULL,
	"source_digest" text NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"provider_message_id" text,
	"failure_code" text,
	"created_by_identity_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfp_notification_digest_ck" CHECK ("mmhr_private"."rfp_notification_outbox"."source_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "rfp_notification_state_ck" CHECK ("mmhr_private"."rfp_notification_outbox"."state" in ('queued','leased','accepted','failed','needs_attention')),
	CONSTRAINT "rfp_notification_revision_ck" CHECK ("mmhr_private"."rfp_notification_outbox"."revision" between 1 and 2147483646),
	CONSTRAINT "rfp_notification_attempt_count_ck" CHECK ("mmhr_private"."rfp_notification_outbox"."attempt_count" between 0 and 3),
	CONSTRAINT "rfp_notification_email_ck" CHECK ("mmhr_private"."rfp_notification_outbox"."recipient_email" = lower(btrim("mmhr_private"."rfp_notification_outbox"."recipient_email")) and length("mmhr_private"."rfp_notification_outbox"."recipient_email") between 3 and 320)
);
--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_notification_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mmhr_private"."rfp_notification_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_identity_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_digest" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfp_notification_receipt_digest_ck" CHECK ("mmhr_private"."rfp_notification_receipts"."request_digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_notification_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_notification_attempts" ADD CONSTRAINT "rfp_notification_attempts_notification_id_rfp_notification_outbox_id_fk" FOREIGN KEY ("notification_id") REFERENCES "mmhr_private"."rfp_notification_outbox"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_notification_outbox" ADD CONSTRAINT "rfp_notification_outbox_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_notification_outbox" ADD CONSTRAINT "rfp_notification_outbox_vendor_organization_id_orgs_id_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_notification_outbox" ADD CONSTRAINT "rfp_notification_outbox_membership_id_org_members_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."org_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_notification_outbox" ADD CONSTRAINT "rfp_notification_outbox_recipient_identity_id_identities_id_fk" FOREIGN KEY ("recipient_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_notification_outbox" ADD CONSTRAINT "rfp_notification_outbox_created_by_identity_id_identities_id_fk" FOREIGN KEY ("created_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_notification_outbox" ADD CONSTRAINT "rfp_notification_recipient_scope_fk" FOREIGN KEY ("organization_id","recipient_id") REFERENCES "public"."rfp_recipients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_notification_outbox" ADD CONSTRAINT "rfp_notification_version_scope_fk" FOREIGN KEY ("organization_id","rfp_version_id") REFERENCES "public"."rfp_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_notification_receipts" ADD CONSTRAINT "rfp_notification_receipts_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_notification_attempt_number_uq" ON "mmhr_private"."rfp_notification_attempts" USING btree ("notification_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_notification_active_lease_uq" ON "mmhr_private"."rfp_notification_attempts" USING btree ("notification_id") WHERE "mmhr_private"."rfp_notification_attempts"."outcome" = 'leased';--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_notification_participant_uq" ON "mmhr_private"."rfp_notification_outbox" USING btree ("recipient_id","membership_id");--> statement-breakpoint
CREATE INDEX "rfp_notification_organization_state_idx" ON "mmhr_private"."rfp_notification_outbox" USING btree ("organization_id","state","id");--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_notification_receipt_actor_key_uq" ON "mmhr_private"."rfp_notification_receipts" USING btree ("actor_identity_id","idempotency_key");
--> statement-breakpoint
-- Additive, disabled email foundation. No provider, worker login, or job is activated.
-- Recovery: revoke these RPCs and keep immutable notification history for a forward correction.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mmhr_rfp_notification_worker') THEN
    CREATE ROLE mmhr_rfp_notification_worker NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mmhr_rfp_notification_worker'
    AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Notification worker role is not restricted';
  END IF;
END $$;
GRANT USAGE ON SCHEMA mmhr_private TO mmhr_rfp_notification_worker;
REVOKE ALL ON mmhr_private.rfp_notification_outbox,mmhr_private.rfp_notification_attempts,
  mmhr_private.rfp_notification_receipts FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_rfp_notification_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_notification_immutable_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' OR TG_TABLE_NAME='rfp_notification_receipts' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Notification history is immutable'; END IF;
  IF TG_TABLE_NAME='rfp_notification_outbox' THEN
    IF (to_jsonb(NEW)-ARRAY['state','revision','attempt_count','provider_message_id','failure_code','updated_at'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','attempt_count','provider_message_id','failure_code','updated_at'])
      OR NEW.revision<>OLD.revision+1 OR NEW.attempt_count<OLD.attempt_count
      OR NOT ((OLD.state='queued' AND NEW.state IN ('leased','needs_attention'))
        OR (OLD.state='leased' AND NEW.state IN ('accepted','failed','needs_attention'))
        OR (OLD.state='failed' AND NEW.state='queued')) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Notification snapshot or transition changed'; END IF;
  ELSE
    IF OLD.outcome<>'leased' OR NEW.outcome NOT IN ('accepted','failed','needs_attention')
      OR (to_jsonb(NEW)-ARRAY['outcome','failure_code','provider_message_id','result_digest','finished_at'])
        IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['outcome','failure_code','provider_message_id','result_digest','finished_at']) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Notification attempt is immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_notification_immutable_guard() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_rfp_notification_worker;
CREATE TRIGGER r4_notification_snapshot_guard BEFORE UPDATE OR DELETE ON mmhr_private.rfp_notification_outbox
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_notification_immutable_guard();
CREATE TRIGGER r4_notification_attempt_guard BEFORE UPDATE OR DELETE ON mmhr_private.rfp_notification_attempts
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_notification_immutable_guard();
CREATE TRIGGER r4_notification_receipt_guard BEFORE UPDATE OR DELETE ON mmhr_private.rfp_notification_receipts
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_notification_immutable_guard();
CREATE TRIGGER r4_notification_outbox_no_truncate BEFORE TRUNCATE ON mmhr_private.rfp_notification_outbox
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER r4_notification_attempts_no_truncate BEFORE TRUNCATE ON mmhr_private.rfp_notification_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER r4_notification_receipts_no_truncate BEFORE TRUNCATE ON mmhr_private.rfp_notification_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_rfp_notification_source(scope_org_id uuid,rfp_id uuid,rfp_version integer,recipient_id uuid,membership_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT jsonb_build_object('organizationId',r.organization_id,'rfpVersionId',r.id,'rfpId',r.rfp_id,'version',r.version,
    'recipientId',rr.id,'vendorProfileId',rr.vendor_profile_id,'vendorOrganizationId',rr.vendor_organization_id,
    'deliveryReference',rr.delivery_reference,'sentAt',rr.sent_at,'deadlineAt',rr.deadline_at,
    'membershipId',m.id,'recipientIdentityId',i.id,'recipientEmail',i.normalized_email,
    'approvedByIdentityId',r.approved_by_identity_id,'approvedAt',r.approved_at,'approvalReference',r.approval_reference,
    'contentDigest',encode(sha256(convert_to(jsonb_build_object('title',r.title,'sections',r.sections)::text,'UTF8')),'hex'))
  FROM public.rfp_versions r JOIN public.rfp_recipients rr ON rr.rfp_version_id=r.id AND rr.organization_id=r.organization_id
  JOIN public.orgs customer_org ON customer_org.id=r.organization_id AND customer_org.type='customer'
    AND customer_org.status='active' AND NOT customer_org.migration_review_required
  JOIN public.vendor_profiles vp ON vp.id=rr.vendor_profile_id AND vp.organization_id=rr.vendor_organization_id AND vp.status='active'
  JOIN public.orgs org ON org.id=rr.vendor_organization_id AND org.type='vendor' AND org.status='active' AND NOT org.migration_review_required
  JOIN public.org_members m ON m.org_id=org.id AND m.id=$5 AND m.status='active' AND NOT m.migration_review_required
  JOIN public.identities i ON i.id=m.identity_id
  WHERE r.organization_id=$1 AND r.rfp_id=$2 AND r.version=$3 AND rr.id=$4
    AND r.status='distributed' AND r.sections->0->>'sectionKey'='questionnaire'
    AND rr.state IN ('distributed','acknowledged','responded') AND rr.sent_at IS NOT NULL
    AND rr.delivery_reference ~ '^portal:[0-9a-f-]{36}$' AND rr.deadline_at>clock_timestamp()
    AND mmhr_private.r4_has_mmhr_rfp_approval(r.id,r.organization_id,r.approved_by_identity_id)
    AND mmhr_private.r1_verified_identity(i.id,false)
    AND mmhr_private.r1_evaluate_permission(i.id,'portal.vendor.access',org.id,'aal1',clock_timestamp(),false)
    AND NOT EXISTS(SELECT 1 FROM public.identities WHERE status='recovery_pending')
$$;
REVOKE ALL ON FUNCTION mmhr_private.r4_rfp_notification_source(uuid,uuid,integer,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_rfp_notification_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_notification_actor_is_current(actor_id uuid,organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT mmhr_private.r1_verified_identity($1,true)
    AND mmhr_private.r1_evaluate_permission($1,'admin.access',NULL,'aal2',clock_timestamp(),false)
    AND mmhr_private.r1_evaluate_permission($1,'rfp.distribute',$2,'aal2',clock_timestamp(),false)
$$;
REVOKE ALL ON FUNCTION mmhr_private.r4_notification_actor_is_current(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_rfp_notification_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_notification_staff_scope(payload jsonb,correlation_id uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE scope_org_id uuid;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR correlation_id IS NULL
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'rfpId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'version','') !~ '^[1-9][0-9]{0,4}$' OR (payload->>'version')::integer>10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid notification request'; END IF;
  scope_org_id:=(payload->>'organizationId')::uuid;
  PERFORM mmhr_private.r1_lock_security();
  IF NOT mmhr_private.r1_request_has_permission('rfp.distribute',scope_org_id)
    OR NOT mmhr_private.r1_request_has_permission('admin.access',NULL) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Notification staff access denied'; END IF;
  RETURN scope_org_id;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_notification_staff_scope(jsonb,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_rfp_notification_worker;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_rfp_notification_recipients(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE scope_org_id uuid; items jsonb;
BEGIN
  scope_org_id:=mmhr_private.r4_notification_staff_scope(payload,correlation_id);
  IF (SELECT count(*) FROM jsonb_object_keys(payload))<>3 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid notification read'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('recipientId',source->>'recipientId','membershipId',source->>'membershipId',
    'recipientIdentityId',source->>'recipientIdentityId','vendorOrganizationId',source->>'vendorOrganizationId',
    'recipientEmail',source->>'recipientEmail','deadlineAt',source->>'deadlineAt',
    'sourceDigest',encode(sha256(convert_to(source::text,'UTF8')),'hex')) ORDER BY source->>'recipientId',source->>'membershipId'),'[]'::jsonb)
    INTO items FROM (SELECT resolved.source FROM public.rfp_versions r
      JOIN public.rfp_recipients rr ON rr.organization_id=r.organization_id AND rr.rfp_version_id=r.id
      JOIN public.org_members m ON m.org_id=rr.vendor_organization_id AND m.status='active'
      CROSS JOIN LATERAL (SELECT mmhr_private.r4_rfp_notification_source(scope_org_id,(payload->>'rfpId')::uuid,
        (payload->>'version')::integer,rr.id,m.id) source) resolved
      WHERE r.organization_id=scope_org_id AND r.rfp_id=(payload->>'rfpId')::uuid AND r.version=(payload->>'version')::integer
        AND resolved.source IS NOT NULL ORDER BY rr.id,m.id LIMIT 101) candidates;
  IF jsonb_array_length(items)>100 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Notification recipient limit reached'; END IF;
  RETURN jsonb_build_object('organizationId',scope_org_id,'rfpId',payload->>'rfpId','version',(payload->>'version')::integer,
    'correlationId',correlation_id,'items',items);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_rfp_notification_recipients(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_rfp_notification_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_rfp_notification_recipients(jsonb,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_queue_rfp_notification(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE scope_org_id uuid;ctx record;source jsonb;request_digest text;old_receipt mmhr_private.rfp_notification_receipts%ROWTYPE;result jsonb;
BEGIN
  scope_org_id:=mmhr_private.r4_notification_staff_scope(payload,correlation_id);
  IF idempotency_key IS NULL OR (SELECT count(*) FROM jsonb_object_keys(payload))<>7
    OR NOT(payload ?& ARRAY['organizationId','rfpId','version','recipientId','membershipId','notificationId','expectedSourceDigest'])
    OR coalesce(payload->>'expectedSourceDigest','') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid notification queue'; END IF;
  SELECT * INTO ctx FROM mmhr_private.r1_start_security_command('rfp.distribute',scope_org_id,'Queue an RFP portal notification',correlation_id,idempotency_key);
  request_digest:=encode(sha256(convert_to(jsonb_build_object('action','queue','payload',payload,'correlationId',correlation_id)::text,'UTF8')),'hex');
  SELECT cr.* INTO old_receipt FROM mmhr_private.rfp_notification_receipts cr WHERE cr.actor_identity_id=ctx.actor_identity_id AND cr.idempotency_key=mmhr_queue_rfp_notification.idempotency_key;
  IF FOUND THEN
    IF old_receipt.request_digest<>request_digest THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Notification retry input changed'; END IF;
    RETURN old_receipt.result||jsonb_build_object('outcomeCode','replayed'); END IF;
  source:=mmhr_private.r4_rfp_notification_source(scope_org_id,(payload->>'rfpId')::uuid,(payload->>'version')::integer,
    (payload->>'recipientId')::uuid,(payload->>'membershipId')::uuid);
  IF source IS NULL OR encode(sha256(convert_to(source::text,'UTF8')),'hex')<>payload->>'expectedSourceDigest' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Notification source changed'; END IF;
  INSERT INTO mmhr_private.rfp_notification_outbox(id,organization_id,rfp_version_id,recipient_id,vendor_organization_id,membership_id,
    recipient_identity_id,recipient_email,source_digest,source_snapshot,subject,body,created_by_identity_id,correlation_id)
    VALUES((payload->>'notificationId')::uuid,scope_org_id,(source->>'rfpVersionId')::uuid,(source->>'recipientId')::uuid,
    (source->>'vendorOrganizationId')::uuid,(source->>'membershipId')::uuid,(source->>'recipientIdentityId')::uuid,
    source->>'recipientEmail',payload->>'expectedSourceDigest',source,'A new request is available in your MMHR vendor portal',
    'Sign in to your MMHR vendor portal to review a new request. Response deadline: '||(source->>'deadlineAt')||'.',ctx.actor_identity_id,correlation_id);
  result:=jsonb_build_object('notificationId',payload->>'notificationId','organizationId',scope_org_id,'rfpId',payload->>'rfpId',
    'version',(payload->>'version')::integer,'recipientId',payload->>'recipientId','membershipId',payload->>'membershipId',
    'revision',1,'state','queued','action','queue','outcomeCode','recorded','correlationId',correlation_id);
  INSERT INTO mmhr_private.rfp_notification_receipts(actor_identity_id,idempotency_key,request_digest,result)
    VALUES(ctx.actor_identity_id,idempotency_key,request_digest,result);
  PERFORM mmhr_private.r1_finish_security_command(ctx.actor_identity_id,'r4.rfp.notification','notification.queue','rfp_notification',
    (payload->>'notificationId')::uuid,scope_org_id,'Queue an RFP portal notification',correlation_id,idempotency_key,payload,
    jsonb_build_object('state','pending'),jsonb_build_object('state','queued'),ctx.authorization_time);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mmhr_queue_rfp_notification(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_rfp_notification_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_queue_rfp_notification(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_retry_rfp_notification(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE scope_org_id uuid;ctx record;item mmhr_private.rfp_notification_outbox%ROWTYPE;request_digest text;
  old_receipt mmhr_private.rfp_notification_receipts%ROWTYPE;source jsonb;result jsonb;
BEGIN
  scope_org_id:=mmhr_private.r4_notification_staff_scope(payload,correlation_id);
  IF idempotency_key IS NULL OR (SELECT count(*) FROM jsonb_object_keys(payload))<>5
    OR NOT(payload ?& ARRAY['organizationId','rfpId','version','notificationId','expectedRevision'])
    OR coalesce(payload->>'expectedRevision','') !~ '^[1-9][0-9]{0,9}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid notification retry'; END IF;
  SELECT * INTO ctx FROM mmhr_private.r1_start_security_command('rfp.distribute',scope_org_id,'Retry an undispatched RFP notification',correlation_id,idempotency_key);
  request_digest:=encode(sha256(convert_to(jsonb_build_object('action','retry','payload',payload,'correlationId',correlation_id)::text,'UTF8')),'hex');
  SELECT cr.* INTO old_receipt FROM mmhr_private.rfp_notification_receipts cr WHERE cr.actor_identity_id=ctx.actor_identity_id AND cr.idempotency_key=mmhr_retry_rfp_notification.idempotency_key;
  IF FOUND THEN
    IF old_receipt.request_digest<>request_digest THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Notification retry input changed'; END IF;
    RETURN old_receipt.result||jsonb_build_object('outcomeCode','replayed'); END IF;
  SELECT n.* INTO item FROM mmhr_private.rfp_notification_outbox n JOIN public.rfp_versions r ON r.id=n.rfp_version_id
    WHERE n.id=(payload->>'notificationId')::uuid AND n.organization_id=scope_org_id
      AND r.rfp_id=(payload->>'rfpId')::uuid AND r.version=(payload->>'version')::integer FOR UPDATE OF n;
  IF NOT FOUND OR item.state<>'failed' OR item.attempt_count>=3 OR item.revision<>(payload->>'expectedRevision')::integer
    OR item.failure_code NOT IN ('rate_limited_pre_dispatch','provider_unavailable_pre_dispatch','invalid_recipient_pre_dispatch') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Notification retry denied'; END IF;
  source:=mmhr_private.r4_rfp_notification_source(scope_org_id,(payload->>'rfpId')::uuid,(payload->>'version')::integer,item.recipient_id,item.membership_id);
  IF source IS DISTINCT FROM item.source_snapshot
    OR mmhr_private.r4_notification_actor_is_current(item.created_by_identity_id,item.organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Notification source changed'; END IF;
  UPDATE mmhr_private.rfp_notification_outbox SET state='queued',failure_code=NULL,revision=revision+1,updated_at=clock_timestamp()
    WHERE id=item.id RETURNING * INTO item;
  result:=jsonb_build_object('notificationId',item.id,'organizationId',scope_org_id,'rfpId',payload->>'rfpId',
    'version',(payload->>'version')::integer,'recipientId',item.recipient_id,'membershipId',item.membership_id,
    'revision',item.revision,'state','queued','action','retry','outcomeCode','recorded','correlationId',correlation_id);
  INSERT INTO mmhr_private.rfp_notification_receipts(actor_identity_id,idempotency_key,request_digest,result)
    VALUES(ctx.actor_identity_id,idempotency_key,request_digest,result);
  PERFORM mmhr_private.r1_finish_security_command(ctx.actor_identity_id,'r4.rfp.notification','notification.retry','rfp_notification',
    item.id,scope_org_id,'Retry an undispatched RFP notification',correlation_id,idempotency_key,payload,
    jsonb_build_object('state','failed'),jsonb_build_object('state','queued'),ctx.authorization_time);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mmhr_retry_rfp_notification(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_rfp_notification_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_retry_rfp_notification(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_rfp_notification_status(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE scope_org_id uuid;items jsonb;
BEGIN
  scope_org_id:=mmhr_private.r4_notification_staff_scope(payload,correlation_id);
  IF (SELECT count(*) FROM jsonb_object_keys(payload))<>3 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid notification read'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('notificationId',n.id,'recipientId',n.recipient_id,'membershipId',n.membership_id,
    'state',n.state,'revision',n.revision,'attemptCount',n.attempt_count,'failureCode',n.failure_code,
    'providerMessageId',n.provider_message_id,'createdAt',n.created_at,
    'canRetry',coalesce(n.state='failed' AND n.attempt_count<3
      AND mmhr_private.r4_notification_actor_is_current(n.created_by_identity_id,n.organization_id)
      AND mmhr_private.r4_rfp_notification_source(scope_org_id,r.rfp_id,r.version,n.recipient_id,n.membership_id)=n.source_snapshot,false))
    ORDER BY n.id),'[]'::jsonb) INTO items FROM mmhr_private.rfp_notification_outbox n
    JOIN public.rfp_versions r ON r.id=n.rfp_version_id AND r.organization_id=n.organization_id
    WHERE n.organization_id=scope_org_id AND r.rfp_id=(payload->>'rfpId')::uuid AND r.version=(payload->>'version')::integer;
  IF jsonb_array_length(items)>100 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Notification status limit reached'; END IF;
  RETURN jsonb_build_object('organizationId',scope_org_id,'rfpId',payload->>'rfpId','version',(payload->>'version')::integer,
    'correlationId',correlation_id,'items',items);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_rfp_notification_status(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_rfp_notification_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_rfp_notification_status(jsonb,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_claim_rfp_notification(notification_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE item mmhr_private.rfp_notification_outbox%ROWTYPE;attempt mmhr_private.rfp_notification_attempts%ROWTYPE;
  source jsonb;rfp public.rfp_versions%ROWTYPE;started timestamptz;
BEGIN
  PERFORM mmhr_private.r1_lock_security();
  SELECT * INTO item FROM mmhr_private.rfp_notification_outbox WHERE id=notification_id FOR UPDATE;
  IF NOT FOUND OR item.state NOT IN ('queued','leased') THEN RETURN NULL; END IF;
  IF item.state='leased' THEN
    SELECT a.* INTO attempt FROM mmhr_private.rfp_notification_attempts a WHERE a.notification_id=item.id AND a.outcome='leased' FOR UPDATE;
    IF NOT FOUND OR attempt.expires_at>clock_timestamp() THEN RETURN NULL; END IF;
    UPDATE mmhr_private.rfp_notification_attempts SET outcome='needs_attention',failure_code='lease_expired',finished_at=clock_timestamp() WHERE id=attempt.id;
    UPDATE mmhr_private.rfp_notification_outbox SET state='needs_attention',failure_code='lease_expired',revision=revision+1,updated_at=clock_timestamp() WHERE id=item.id;
    INSERT INTO public.audit_events(actor_type,actor_reference,organization_id,command,action,entity_type,entity_id,reason,correlation_id,before_summary,after_summary)
      VALUES('worker','rfp-notification-worker',item.organization_id,'r4.rfp.notification.worker','notification.expired','rfp_notification',item.id,
        'Expired notification lease needs review',item.correlation_id,jsonb_build_object('state','in_flight'),jsonb_build_object('state','outcome_unknown'));
    RETURN NULL;
  END IF;
  SELECT * INTO rfp FROM public.rfp_versions WHERE id=item.rfp_version_id;
  source:=mmhr_private.r4_rfp_notification_source(item.organization_id,rfp.rfp_id,rfp.version,item.recipient_id,item.membership_id);
  IF source IS DISTINCT FROM item.source_snapshot OR item.attempt_count>=3
    OR mmhr_private.r4_notification_actor_is_current(item.created_by_identity_id,item.organization_id) IS NOT TRUE THEN
    UPDATE mmhr_private.rfp_notification_outbox SET state='needs_attention',failure_code='source_changed',revision=revision+1,updated_at=clock_timestamp() WHERE id=item.id;
    INSERT INTO public.audit_events(actor_type,actor_reference,organization_id,command,action,entity_type,entity_id,reason,correlation_id,before_summary,after_summary)
      VALUES('worker','rfp-notification-worker',item.organization_id,'r4.rfp.notification.worker','notification.blocked','rfp_notification',item.id,
        'Notification source needs review',item.correlation_id,jsonb_build_object('state','queued'),jsonb_build_object('state','outcome_unknown'));
    RETURN NULL;
  END IF;
  started:=clock_timestamp();
  UPDATE mmhr_private.rfp_notification_outbox SET state='leased',attempt_count=attempt_count+1,revision=revision+1,updated_at=started WHERE id=item.id RETURNING * INTO item;
  INSERT INTO mmhr_private.rfp_notification_attempts(notification_id,number,token,started_at,expires_at)
    VALUES(item.id,item.attempt_count,encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex'),started,started+interval '60 seconds') RETURNING * INTO attempt;
  INSERT INTO public.audit_events(actor_type,actor_reference,organization_id,command,action,entity_type,entity_id,reason,correlation_id,before_summary,after_summary)
    VALUES('worker','rfp-notification-worker',item.organization_id,'r4.rfp.notification.worker','notification.claim','rfp_notification',item.id,
      'Claim one notification attempt',item.correlation_id,jsonb_build_object('state','queued'),jsonb_build_object('state','in_flight'));
  RETURN jsonb_build_object('notificationId',item.id,'organizationId',item.organization_id,'rfpId',rfp.rfp_id,'version',rfp.version,
    'recipientId',item.recipient_id,'membershipId',item.membership_id,'recipientIdentityId',item.recipient_identity_id,
    'recipientEmail',item.recipient_email,'sourceDigest',item.source_digest,'subject',item.subject,'body',item.body,
    'attemptId',attempt.id,'attemptNumber',attempt.number,'token',attempt.token,'expiresAt',attempt.expires_at,'correlationId',item.correlation_id);
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_claim_rfp_notification(uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_rfp_notification_worker;
GRANT EXECUTE ON FUNCTION mmhr_private.r4_claim_rfp_notification(uuid) TO mmhr_rfp_notification_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_get_rfp_notification_dispatch(notification_id uuid,attempt_id uuid,lease_token text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE item mmhr_private.rfp_notification_outbox%ROWTYPE;attempt mmhr_private.rfp_notification_attempts%ROWTYPE;source jsonb;rfp public.rfp_versions%ROWTYPE;
BEGIN
  PERFORM mmhr_private.r1_lock_security();
  SELECT * INTO item FROM mmhr_private.rfp_notification_outbox WHERE id=notification_id FOR UPDATE;
  SELECT a.* INTO attempt FROM mmhr_private.rfp_notification_attempts a WHERE a.id=attempt_id AND a.notification_id=item.id;
  IF item.state IS DISTINCT FROM 'leased' OR attempt.outcome IS DISTINCT FROM 'leased'
    OR attempt.token IS DISTINCT FROM lease_token OR attempt.expires_at<=clock_timestamp() THEN RETURN false; END IF;
  SELECT * INTO rfp FROM public.rfp_versions WHERE id=item.rfp_version_id;
  source:=mmhr_private.r4_rfp_notification_source(item.organization_id,rfp.rfp_id,rfp.version,item.recipient_id,item.membership_id);
  RETURN source IS NOT DISTINCT FROM item.source_snapshot
    AND mmhr_private.r4_notification_actor_is_current(item.created_by_identity_id,item.organization_id);
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_get_rfp_notification_dispatch(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_rfp_notification_worker;
GRANT EXECUTE ON FUNCTION mmhr_private.r4_get_rfp_notification_dispatch(uuid,uuid,text) TO mmhr_rfp_notification_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_record_rfp_notification_result(notification_id uuid,attempt_id uuid,lease_token text,result jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE item mmhr_private.rfp_notification_outbox%ROWTYPE;attempt mmhr_private.rfp_notification_attempts%ROWTYPE;result_hash text;
  v_outcome text;v_failure_code text;provider_id text;
BEGIN
  IF result IS NULL OR jsonb_typeof(result)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(result))<>2 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid notification result'; END IF;
  v_outcome:=result->>'outcome';v_failure_code:=result->>'failureCode';provider_id:=result->>'providerMessageId';
  IF ((v_outcome='accepted' AND jsonb_typeof(result->'providerMessageId')='string' AND length(btrim(provider_id)) BETWEEN 1 AND 255)
    OR (v_outcome='failed' AND jsonb_typeof(result->'failureCode')='string' AND v_failure_code IN ('rate_limited_pre_dispatch','provider_unavailable_pre_dispatch','invalid_recipient_pre_dispatch'))
    OR (v_outcome='needs_attention' AND jsonb_typeof(result->'failureCode')='string' AND v_failure_code IN ('outcome_unknown','source_changed','lease_expired','recipient_revoked'))) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid notification outcome'; END IF;
  PERFORM mmhr_private.r1_lock_security();
  SELECT * INTO item FROM mmhr_private.rfp_notification_outbox WHERE id=notification_id FOR UPDATE;
  SELECT a.* INTO attempt FROM mmhr_private.rfp_notification_attempts a WHERE a.id=attempt_id AND a.notification_id=item.id FOR UPDATE;
  IF NOT FOUND OR attempt.token IS DISTINCT FROM lease_token THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Notification lease denied'; END IF;
  result_hash:=encode(sha256(convert_to(result::text,'UTF8')),'hex');
  IF attempt.outcome<>'leased' THEN
    IF attempt.result_digest=result_hash THEN RETURN true; END IF;
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Notification outcome changed'; END IF;
  IF item.state<>'leased' OR attempt.expires_at<=clock_timestamp() THEN RETURN false; END IF;
  UPDATE mmhr_private.rfp_notification_attempts SET outcome=v_outcome,
    failure_code=v_failure_code,provider_message_id=provider_id,result_digest=result_hash,finished_at=clock_timestamp() WHERE id=attempt.id;
  UPDATE mmhr_private.rfp_notification_outbox SET state=CASE WHEN v_outcome='failed' AND item.attempt_count=3 THEN 'needs_attention' ELSE v_outcome END,
    failure_code=v_failure_code,
    provider_message_id=provider_id,revision=revision+1,updated_at=clock_timestamp() WHERE id=item.id;
  INSERT INTO public.audit_events(actor_type,actor_reference,organization_id,command,action,entity_type,entity_id,reason,correlation_id,before_summary,after_summary)
    VALUES('worker','rfp-notification-worker',item.organization_id,'r4.rfp.notification.worker','notification.result','rfp_notification',item.id,
      'Record a bounded notification attempt',item.correlation_id,jsonb_build_object('state','in_flight'),
      jsonb_build_object('state',CASE v_outcome WHEN 'accepted' THEN 'completed' WHEN 'failed' THEN 'failed' ELSE 'outcome_unknown' END));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_record_rfp_notification_result(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_rfp_notification_worker;
GRANT EXECUTE ON FUNCTION mmhr_private.r4_record_rfp_notification_result(uuid,uuid,text,jsonb) TO mmhr_rfp_notification_worker;
