CREATE TABLE "mmhr_private"."rfp_receipt_confirmations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recipient_id" uuid NOT NULL,
	"customer_organization_id" uuid NOT NULL,
	"vendor_organization_id" uuid NOT NULL,
	"rfp_version_id" uuid NOT NULL,
	"actor_identity_id" uuid NOT NULL,
	"original_request" jsonb NOT NULL,
	"original_result" jsonb NOT NULL,
	"receipt_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rfp_receipt_confirmations_request_ck" CHECK (jsonb_typeof("mmhr_private"."rfp_receipt_confirmations"."original_request") = 'object' and octet_length("mmhr_private"."rfp_receipt_confirmations"."original_request"::text) <= 2000),
	CONSTRAINT "rfp_receipt_confirmations_result_ck" CHECK (jsonb_typeof("mmhr_private"."rfp_receipt_confirmations"."original_result") = 'object' and octet_length("mmhr_private"."rfp_receipt_confirmations"."original_result"::text) <= 2000),
	CONSTRAINT "rfp_receipt_confirmations_time_ck" CHECK (isfinite("mmhr_private"."rfp_receipt_confirmations"."acknowledged_at"))
);
--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_receipt_confirmations" ADD CONSTRAINT "rfp_receipt_confirmations_recipient_id_rfp_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."rfp_recipients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_receipt_confirmations" ADD CONSTRAINT "rfp_receipt_confirmations_customer_organization_id_orgs_id_fk" FOREIGN KEY ("customer_organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_receipt_confirmations" ADD CONSTRAINT "rfp_receipt_confirmations_vendor_organization_id_orgs_id_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_receipt_confirmations" ADD CONSTRAINT "rfp_receipt_confirmations_rfp_version_id_rfp_versions_id_fk" FOREIGN KEY ("rfp_version_id") REFERENCES "public"."rfp_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_receipt_confirmations" ADD CONSTRAINT "rfp_receipt_confirmations_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_receipt_confirmations" ADD CONSTRAINT "rfp_receipt_confirmations_receipt_id_security_command_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."security_command_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_receipt_confirmations_recipient_uq" ON "mmhr_private"."rfp_receipt_confirmations" USING btree ("recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_receipt_confirmations_receipt_uq" ON "mmhr_private"."rfp_receipt_confirmations" USING btree ("receipt_id");
--> statement-breakpoint
-- Append only after normal Drizzle generation creates the reviewed private table.
-- No historical row is backfilled. Existing acknowledgement timestamps keep their meaning.
ALTER TABLE mmhr_private.rfp_receipt_confirmations ENABLE ROW LEVEL SECURITY;
CREATE POLICY r4_receipt_confirmation_default_deny ON mmhr_private.rfp_receipt_confirmations
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE mmhr_private.rfp_receipt_confirmations FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_receipt_actor(vendor_org uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid;
BEGIN
  v_actor := mmhr_private.r1_request_identity_id();
  IF v_actor IS NULL OR NOT mmhr_private.r1_verified_identity(v_actor,false)
    OR NOT mmhr_private.r1_request_has_permission('portal.vendor.access',vendor_org)
    OR EXISTS(SELECT 1 FROM public.identities WHERE status='recovery_pending') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt access denied';
  END IF;
  RETURN v_actor;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_receipt_actor(uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_receipt_evidence_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_recipient public.rfp_recipients%ROWTYPE; v_request jsonb; v_result jsonb; v_key uuid;
BEGIN
  PERFORM mmhr_private.r1_lock_security();
  SELECT * INTO v_recipient FROM public.rfp_recipients WHERE id=NEW.recipient_id FOR UPDATE;
  IF NOT FOUND OR v_recipient.organization_id IS DISTINCT FROM NEW.customer_organization_id
    OR v_recipient.vendor_organization_id IS DISTINCT FROM NEW.vendor_organization_id
    OR v_recipient.rfp_version_id IS DISTINCT FROM NEW.rfp_version_id
    OR v_recipient.acknowledged_at IS NOT NULL OR v_recipient.state<>'distributed'
    OR NEW.actor_identity_id IS DISTINCT FROM mmhr_private.r4_receipt_actor(NEW.vendor_organization_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt evidence denied';
  END IF;
  IF jsonb_typeof(NEW.original_request) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(NEW.original_request))<>6
    OR coalesce(NEW.original_request->>'idempotencyKey','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt request evidence denied';
  END IF;
  v_key := (NEW.original_request->>'idempotencyKey')::uuid;
  v_request := jsonb_build_object('organizationId',NEW.vendor_organization_id,'confirmationId',NEW.id,
    'recipientId',NEW.recipient_id,'rfpVersionId',NEW.rfp_version_id,'correlationId',NEW.correlation_id,'idempotencyKey',v_key);
  v_result := jsonb_build_object('organizationId',NEW.vendor_organization_id,'confirmationId',NEW.id,
    'recipientId',NEW.recipient_id,'rfpVersionId',NEW.rfp_version_id,'correlationId',NEW.correlation_id,
    'acknowledgedAt',NEW.acknowledged_at,'state','acknowledged');
  IF NEW.original_request IS DISTINCT FROM v_request OR NEW.original_result IS DISTINCT FROM v_result
    OR NOT EXISTS(SELECT 1 FROM public.security_command_receipts receipt JOIN public.audit_events audit ON audit.id=receipt.audit_event_id
      WHERE receipt.id=NEW.receipt_id AND receipt.entity_id=NEW.id AND receipt.actor_identity_id=NEW.actor_identity_id
        AND receipt.command='r4.rfp.confirm_receipt' AND receipt.action='rfp.confirm_receipt' AND receipt.idempotency_key=v_key
        AND receipt.request_digest=encode(sha256(convert_to(v_request::text,'UTF8')),'hex')
        AND audit.actor_type='user' AND audit.actor_identity_id=NEW.actor_identity_id AND audit.organization_id=NEW.vendor_organization_id
        AND audit.command=receipt.command AND audit.action=receipt.action AND audit.entity_type='rfp_receipt_confirmation'
        AND audit.entity_id=NEW.id::text AND audit.correlation_id=NEW.correlation_id AND audit.idempotency_key=v_key::text
        AND audit.reason='Confirm receipt of delivered questionnaire'
        AND audit.before_summary IS NULL AND audit.after_summary=jsonb_build_object('record_id',NEW.recipient_id)
        AND receipt.created_at=audit.occurred_at AND audit.occurred_at<=NEW.acknowledged_at
        AND NEW.acknowledged_at<=clock_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt command evidence denied';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.rfp_versions r JOIN public.vendor_profiles vp
      ON vp.organization_id=NEW.vendor_organization_id AND vp.id=v_recipient.vendor_profile_id AND vp.status='active'
    WHERE r.id=NEW.rfp_version_id AND r.organization_id=NEW.customer_organization_id
      AND r.status='distributed' AND r.sections->0->>'sectionKey'='questionnaire'
      AND v_recipient.sent_at IS NOT NULL AND v_recipient.sent_at<=NEW.acknowledged_at) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt delivery evidence denied';
  END IF;
  UPDATE public.rfp_recipients SET state='acknowledged',acknowledged_at=NEW.acknowledged_at WHERE id=NEW.recipient_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_receipt_evidence_guard() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
-- A valid evidence insert applies the actual transition from a locked unacknowledged row.
-- This also prevents an owner from relabelling an older implicit timestamp as explicit.
CREATE TRIGGER r4_receipt_evidence_insert BEFORE INSERT ON mmhr_private.rfp_receipt_confirmations
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_receipt_evidence_guard();
CREATE TRIGGER r4_receipt_evidence_immutable BEFORE UPDATE OR DELETE ON mmhr_private.rfp_receipt_confirmations
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER r4_receipt_evidence_no_truncate BEFORE TRUNCATE ON mmhr_private.rfp_receipt_confirmations
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_receipt_timestamp_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.acknowledged_at IS NOT NULL OR NEW.state='acknowledged' THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='New RFP receipt requires response or confirmation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt time is immutable';
  END IF;
  -- Withdrawal ends vendor authority, including receipts with historical NULL times.
  IF OLD.state='withdrawn' AND NEW.state IN ('pending','distributed','acknowledged','responded') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt state cannot regress';
  END IF;
  -- Keep withdrawal valid, but never reactivate a receipt-bearing delivery as unreceived.
  -- Unchanged historical distributed projections are not rewritten by this guard.
  -- Immutable submission bindings retain progress after a NULL-time historical withdrawal.
  IF NEW.state IS DISTINCT FROM OLD.state AND NEW.state IN ('pending','distributed')
    AND (OLD.acknowledged_at IS NOT NULL OR OLD.state IN ('acknowledged','responded')
      OR EXISTS(SELECT 1 FROM public.rfp_portal_submissions s
        WHERE s.recipient_id=OLD.id AND s.organization_id=OLD.organization_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt state cannot regress';
  END IF;
  IF NEW.state='acknowledged' AND NEW.acknowledged_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt time is required';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION mmhr_private.r4_receipt_projection_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.acknowledged_at IS NULL AND NEW.acknowledged_at IS NOT NULL AND NEW.state<>'acknowledged' THEN
    IF NOT isfinite(NEW.acknowledged_at) OR NEW.acknowledged_at>clock_timestamp() OR NEW.state<>'responded' OR NOT EXISTS(
      SELECT 1 FROM public.rfp_portal_submissions s JOIN public.rfp_response_normalizations n ON n.id=s.normalization_id
      JOIN public.security_command_receipts receipt ON receipt.entity_id=n.id AND receipt.command='r4.rsp.portal_submit'
      JOIN public.audit_events audit ON audit.id=receipt.audit_event_id
      WHERE s.recipient_id=NEW.id AND s.organization_id=NEW.organization_id AND n.organization_id=NEW.organization_id
        AND n.rfp_version_id=NEW.rfp_version_id AND n.vendor_profile_id=NEW.vendor_profile_id AND n.vendor_organization_id=NEW.vendor_organization_id
        AND receipt.actor_identity_id=s.submitted_by_identity_id AND receipt.action='rsp.portal_submit'
        AND audit.actor_type='user' AND audit.actor_identity_id=receipt.actor_identity_id AND audit.organization_id=NEW.vendor_organization_id
        AND audit.command=receipt.command AND audit.action=receipt.action AND audit.entity_type='rfp_response_normalization' AND audit.entity_id=n.id::text
        AND audit.idempotency_key=receipt.idempotency_key::text AND audit.occurred_at=receipt.created_at
        AND audit.occurred_at<=NEW.acknowledged_at AND s.submitted_at<=NEW.acknowledged_at
        AND receipt.request_digest=encode(sha256(convert_to(jsonb_build_object(
          'organizationId',NEW.vendor_organization_id,'recipientId',NEW.id,'expectedRevision',s.revision-1,
          'response',jsonb_build_object('supportedRequirements',n.supported_requirements,'unsupportedRequirements',n.unsupported_requirements,
            'caveats',n.caveats,'dependencies',n.dependencies,'commitments',n.commitments,'implementationDetails',n.implementation_details,
            'missingAnswers',n.missing_answers,'proposedFollowUps',n.proposed_follow_ups))::text,'UTF8')),'hex')) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt requires a submitted response or confirmation';
    END IF;
  END IF;
  IF NEW.state='acknowledged' AND OLD.state IS DISTINCT FROM NEW.state AND
    (OLD.state<>'distributed' OR OLD.acknowledged_at IS NOT NULL OR
    NOT EXISTS(SELECT 1 FROM mmhr_private.rfp_receipt_confirmations e
      WHERE e.recipient_id=NEW.id AND e.acknowledged_at=NEW.acknowledged_at)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP acknowledgement requires confirmation evidence';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_receipt_timestamp_guard() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
REVOKE ALL ON FUNCTION mmhr_private.r4_receipt_projection_guard() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
CREATE TRIGGER r4_receipt_timestamp_immutable BEFORE INSERT OR UPDATE ON public.rfp_recipients
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_receipt_timestamp_guard();
CREATE CONSTRAINT TRIGGER r4_receipt_projection_commit AFTER UPDATE ON public.rfp_recipients
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_receipt_projection_guard();
--> statement-breakpoint
CREATE FUNCTION public.mmhr_confirm_rfp_receipt(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_org uuid; v_actor uuid; v_time timestamptz; v_ack timestamptz; v_id uuid; v_recipient public.rfp_recipients%ROWTYPE;
  v_receipt jsonb; v_result jsonb; v_saved mmhr_private.rfp_receipt_confirmations%ROWTYPE;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR (SELECT count(*) FROM jsonb_object_keys(payload))<>6
    OR NOT(payload ?& ARRAY['organizationId','recipientId','rfpVersionId','confirmationId','correlationId','idempotencyKey'])
    OR EXISTS(SELECT 1 FROM jsonb_each(payload) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string'
      OR e.value#>>'{}' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
    OR payload->>'correlationId' IS DISTINCT FROM correlation_id::text
    OR payload->>'idempotencyKey' IS DISTINCT FROM idempotency_key::text THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid RFP receipt request';
  END IF;
  v_org := (payload->>'organizationId')::uuid; v_id := (payload->>'confirmationId')::uuid;
  v_time := mmhr_private.r1_lock_security(); v_actor := mmhr_private.r4_receipt_actor(v_org);
  -- A receipt cannot bypass current session, portal, membership, or exact recipient authority.
  SELECT rr.* INTO v_recipient FROM public.rfp_recipients rr JOIN public.vendor_profiles vp
    ON vp.organization_id=rr.vendor_organization_id AND vp.id=rr.vendor_profile_id AND vp.status='active'
    WHERE rr.id=(payload->>'recipientId')::uuid AND rr.vendor_organization_id=v_org
      AND rr.rfp_version_id=(payload->>'rfpVersionId')::uuid AND rr.state IN ('distributed','acknowledged','responded') FOR UPDATE OF rr;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt target denied'; END IF;
  v_receipt := mmhr_private.r1_replay_security_command(v_actor,'r4.rfp.confirm_receipt',idempotency_key,payload);
  IF v_receipt IS NOT NULL AND v_receipt->'request_matches' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='RFP receipt request differs from the original'; END IF;
  v_receipt := v_receipt-'request_matches';
  IF v_receipt IS NOT NULL THEN
    SELECT * INTO v_saved FROM mmhr_private.rfp_receipt_confirmations e
      WHERE e.id=(v_receipt->>'entity_id')::uuid AND e.id=v_id AND e.recipient_id=v_recipient.id
        AND e.actor_identity_id=v_actor AND e.original_request=payload AND e.receipt_id=(v_receipt->>'receipt_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt replay evidence denied'; END IF;
    RETURN v_saved.original_result;
  END IF;
  IF v_recipient.state<>'distributed' OR v_recipient.acknowledged_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='RFP receipt already recorded'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.rfp_versions r WHERE r.id=v_recipient.rfp_version_id
    AND r.organization_id=v_recipient.organization_id AND r.status='distributed' AND r.sections->0->>'sectionKey'='questionnaire') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt request closed'; END IF;
  v_ack := clock_timestamp();
  v_result := jsonb_build_object('organizationId',v_org,'recipientId',v_recipient.id,'rfpVersionId',v_recipient.rfp_version_id,
    'confirmationId',v_id,'correlationId',correlation_id,'acknowledgedAt',v_ack,'state','acknowledged');
  v_receipt := mmhr_private.r1_finish_security_command(v_actor,'r4.rfp.confirm_receipt','rfp.confirm_receipt',
    'rfp_receipt_confirmation',v_id,v_org,'Confirm receipt of delivered questionnaire',correlation_id,idempotency_key,payload,
    NULL,jsonb_build_object('record_id',v_recipient.id),v_time);
  INSERT INTO mmhr_private.rfp_receipt_confirmations(id,recipient_id,customer_organization_id,vendor_organization_id,
    rfp_version_id,actor_identity_id,original_request,original_result,receipt_id,correlation_id,acknowledged_at)
    VALUES(v_id,v_recipient.id,v_recipient.organization_id,v_org,v_recipient.rfp_version_id,v_actor,payload,v_result,
      (v_receipt->>'receipt_id')::uuid,correlation_id,v_ack);
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.mmhr_confirm_rfp_receipt(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_confirm_rfp_receipt(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_rfp_receipt_status(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_org uuid; v_view text; v_intake uuid; v_after uuid; v_rows jsonb; v_cursor uuid;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL
    OR NOT(payload ?& ARRAY['organizationId','view']) OR payload->>'view' IS NULL
    OR payload->>'view' NOT IN ('vendor','staff','customer')
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('organizationId','view','intakeId','afterId'))
    OR (payload->>'view'='vendor' AND payload ? 'intakeId')
    OR (payload->>'view'<>'vendor' AND NOT(payload ? 'intakeId'))
    OR EXISTS(SELECT 1 FROM jsonb_each(payload) e WHERE e.key<>'view' AND
      (jsonb_typeof(e.value) IS DISTINCT FROM 'string' OR e.value#>>'{}' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid RFP receipt read'; END IF;
  v_org := (payload->>'organizationId')::uuid; v_view := payload->>'view';
  v_intake := (payload->>'intakeId')::uuid; v_after := (payload->>'afterId')::uuid;
  PERFORM mmhr_private.r1_lock_security();
  IF v_view='vendor' THEN PERFORM mmhr_private.r4_receipt_actor(v_org);
  ELSIF NOT mmhr_private.r1_request_has_permission(CASE WHEN v_view='staff' THEN 'rfp.distribute' ELSE 'portal.customer.access' END,v_org)
    OR (v_view='staff' AND NOT mmhr_private.r1_request_has_permission('admin.access',NULL))
    OR NOT EXISTS(SELECT 1 FROM public.intakes i WHERE i.id=v_intake AND i.organization_id=v_org) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt read denied'; END IF;
  IF v_after IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.rfp_recipients rr
    JOIN public.rfp_versions r ON r.organization_id=rr.organization_id AND r.id=rr.rfp_version_id
    JOIN public.vendor_profiles vp ON vp.organization_id=rr.vendor_organization_id AND vp.id=rr.vendor_profile_id
    WHERE rr.id=v_after AND r.sections->0->>'sectionKey'='questionnaire' AND r.status IN ('distributed','closed')
      AND rr.sent_at IS NOT NULL AND rr.deadline_at IS NOT NULL
      AND ((v_view='vendor' AND rr.vendor_organization_id=v_org AND vp.status='active' AND rr.state IN ('distributed','acknowledged','responded'))
        OR (v_view IN ('staff','customer') AND rr.organization_id=v_org AND r.source_intake_id=v_intake
          AND rr.state IN ('distributed','acknowledged','responded','withdrawn')))) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt cursor denied'; END IF;
  SELECT coalesce(jsonb_agg(p.item ORDER BY p.id),'[]'::jsonb) INTO v_rows FROM (
    SELECT rr.id,jsonb_build_object('recipientId',rr.id,'rfpVersionId',r.id,'title',r.title,'providerName',vendor.name,
      'version',r.version,'state',rr.state,'sentAt',rr.sent_at,'deadlineAt',rr.deadline_at,
      'acknowledgedAt',rr.acknowledged_at,'respondedAt',rr.responded_at,
      'receiptKind',CASE WHEN e.id IS NOT NULL THEN 'explicit' WHEN rr.acknowledged_at IS NOT NULL THEN 'recorded' ELSE 'none' END,
      'canConfirm',v_view='vendor' AND rr.state='distributed' AND rr.acknowledged_at IS NULL AND r.status='distributed') item
    FROM public.rfp_recipients rr JOIN public.rfp_versions r ON r.organization_id=rr.organization_id AND r.id=rr.rfp_version_id
    JOIN public.orgs vendor ON vendor.id=rr.vendor_organization_id
    JOIN public.vendor_profiles vp ON vp.organization_id=rr.vendor_organization_id AND vp.id=rr.vendor_profile_id
    LEFT JOIN mmhr_private.rfp_receipt_confirmations e ON e.recipient_id=rr.id
    WHERE r.sections->0->>'sectionKey'='questionnaire' AND r.status IN ('distributed','closed')
      AND rr.sent_at IS NOT NULL AND rr.deadline_at IS NOT NULL AND (v_after IS NULL OR rr.id>v_after)
      AND ((v_view='vendor' AND rr.vendor_organization_id=v_org AND vp.status='active' AND rr.state IN ('distributed','acknowledged','responded'))
        OR (v_view IN ('staff','customer') AND rr.organization_id=v_org AND r.source_intake_id=v_intake
          AND rr.state IN ('distributed','acknowledged','responded','withdrawn')))
    ORDER BY rr.id LIMIT 26) p;
  IF jsonb_array_length(v_rows)>25 THEN v_rows:=v_rows-25; v_cursor:=(v_rows->24->>'recipientId')::uuid; END IF;
  RETURN jsonb_build_object('organizationId',v_org,'view',v_view,'intakeId',v_intake,'items',v_rows,
    'nextCursor',v_cursor,'correlationId',correlation_id);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_rfp_receipt_status(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_rfp_receipt_status(jsonb,uuid) TO authenticated;
