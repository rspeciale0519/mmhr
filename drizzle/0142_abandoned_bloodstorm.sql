CREATE TABLE "rfp_portal_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"normalization_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"submitted_by_identity_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfp_portal_submissions_revision_ck" CHECK ("rfp_portal_submissions"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "inbound_email_events" DROP CONSTRAINT "inbound_email_vendor_scope_fk";
--> statement-breakpoint
ALTER TABLE "rfp_response_normalizations" DROP CONSTRAINT "rfp_response_normalizations_vendor_scope_fk";
--> statement-breakpoint
ALTER TABLE "inbound_email_events" ADD COLUMN "vendor_organization_id" uuid;--> statement-breakpoint
ALTER TABLE "inbound_email_events" ADD COLUMN "source_type" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "rfp_response_normalizations" ADD COLUMN "vendor_organization_id" uuid;--> statement-breakpoint
-- Expand existing associations before adding the stronger vendor constraints.
-- Historical profiles belonged to the customer workspace.
UPDATE public.inbound_email_events SET vendor_organization_id=organization_id WHERE vendor_profile_id IS NOT NULL;
UPDATE public.rfp_response_normalizations SET vendor_organization_id=organization_id;
--> statement-breakpoint
ALTER TABLE "rfp_portal_submissions" ADD CONSTRAINT "rfp_portal_submissions_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_portal_submissions" ADD CONSTRAINT "rfp_portal_submissions_recipient_id_rfp_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."rfp_recipients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_portal_submissions" ADD CONSTRAINT "rfp_portal_submissions_submitted_by_identity_id_identities_id_fk" FOREIGN KEY ("submitted_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_portal_submissions" ADD CONSTRAINT "rfp_portal_submissions_normalization_scope_fk" FOREIGN KEY ("organization_id","normalization_id") REFERENCES "public"."rfp_response_normalizations"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_portal_submissions_recipient_revision_uq" ON "rfp_portal_submissions" USING btree ("recipient_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_portal_submissions_normalization_uq" ON "rfp_portal_submissions" USING btree ("normalization_id");--> statement-breakpoint
CREATE INDEX "rfp_portal_submissions_organization_idx" ON "rfp_portal_submissions" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "inbound_email_events" ADD CONSTRAINT "inbound_email_vendor_scope_fk" FOREIGN KEY ("vendor_organization_id","vendor_profile_id") REFERENCES "public"."vendor_profiles"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_response_normalizations" ADD CONSTRAINT "rfp_response_normalizations_vendor_scope_fk" FOREIGN KEY ("vendor_organization_id","vendor_profile_id") REFERENCES "public"."vendor_profiles"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_events" ADD CONSTRAINT "inbound_email_vendor_organization_ck" CHECK ("inbound_email_events"."vendor_profile_id" is null or "inbound_email_events"."vendor_organization_id" is not null);--> statement-breakpoint
ALTER TABLE "inbound_email_events" ADD CONSTRAINT "inbound_email_source_type_ck" CHECK ("inbound_email_events"."source_type" in ('email', 'portal'));--> statement-breakpoint
ALTER TABLE "rfp_response_normalizations" ADD CONSTRAINT "rfp_response_normalizations_vendor_organization_ck" CHECK ("rfp_response_normalizations"."vendor_organization_id" is not null);
--> statement-breakpoint

CREATE FUNCTION mmhr_private.r4_response_vendor_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_event public.inbound_email_events%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='inbound_email_events' THEN
    IF NEW.vendor_profile_id IS NOT NULL THEN
      NEW.vendor_organization_id := coalesce(NEW.vendor_organization_id,NEW.organization_id);
    END IF;
  ELSE
    SELECT * INTO v_event FROM public.inbound_email_events
      WHERE organization_id=NEW.organization_id AND id=NEW.inbound_event_id;
    IF NOT FOUND OR v_event.vendor_profile_id IS DISTINCT FROM NEW.vendor_profile_id
      OR v_event.rfp_version_id IS DISTINCT FROM NEW.rfp_version_id THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Response association denied';
    END IF;
    NEW.vendor_organization_id := coalesce(NEW.vendor_organization_id,v_event.vendor_organization_id);
    IF NEW.vendor_organization_id IS DISTINCT FROM v_event.vendor_organization_id THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Response vendor scope denied';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_response_vendor_scope() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
CREATE TRIGGER r4_inbound_vendor_scope BEFORE INSERT OR UPDATE ON public.inbound_email_events
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_response_vendor_scope();
CREATE TRIGGER r4_normalization_vendor_scope BEFORE INSERT OR UPDATE ON public.rfp_response_normalizations
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_response_vendor_scope();
ALTER TABLE public.rfp_portal_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rfp_portal_submissions FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
CREATE POLICY r1_deny_portal_submission_raw ON public.rfp_portal_submissions AS RESTRICTIVE
  FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
CREATE TRIGGER r4_portal_submission_append_only BEFORE UPDATE OR DELETE ON public.rfp_portal_submissions
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER r4_portal_submission_no_truncate BEFORE TRUNCATE ON public.rfp_portal_submissions
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint

CREATE FUNCTION mmhr_private.r4_portal_response_content_is_valid(value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v_key text; v_count integer := 0; v_bytes integer := 0; v_statement text;
  -- Match ECMAScript trim so direct RPC inputs cannot create unreadable records.
  v_whitespace text := E' \t\n\r\f' || chr(11) || chr(160) || chr(5760) || chr(8192) || chr(8193)
    || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199)
    || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239)
    || chr(8287) || chr(12288) || chr(65279);
BEGIN
  IF value IS NULL OR jsonb_typeof(value) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(value))<>8
    OR NOT(value ?& ARRAY['supportedRequirements','unsupportedRequirements','caveats','dependencies',
      'commitments','implementationDetails','missingAnswers','proposedFollowUps']) THEN RETURN false; END IF;
  FOR v_key IN SELECT jsonb_object_keys(value) LOOP
    IF jsonb_typeof(value->v_key) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(value->v_key)>100 THEN RETURN false; END IF;
    FOR v_statement IN SELECT item#>>'{}' FROM jsonb_array_elements(value->v_key) item
      WHERE jsonb_typeof(item)='string' LOOP
      IF v_statement<>btrim(v_statement,v_whitespace) OR octet_length(v_statement) NOT BETWEEN 1 AND 2000 THEN RETURN false; END IF;
      v_bytes:=v_bytes+octet_length(v_statement);
    END LOOP;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(value->v_key) item WHERE jsonb_typeof(item) IS DISTINCT FROM 'string')
      OR v_bytes>32000 THEN RETURN false; END IF;
    v_count := v_count+jsonb_array_length(value->v_key);
  END LOOP;
  RETURN v_count>0;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_portal_response_content_is_valid(jsonb) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
--> statement-breakpoint

CREATE FUNCTION public.mmhr_submit_portal_response(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_actor uuid; v_authorization_time timestamptz; v_org uuid; v_recipient public.rfp_recipients%ROWTYPE; v_rfp public.rfp_versions%ROWTYPE;
  v_receipt jsonb; v_content jsonb; v_current integer; v_id uuid := gen_random_uuid();
  v_normalization uuid := gen_random_uuid(); v_previous public.rfp_portal_submissions%ROWTYPE;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL OR idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid portal response'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(payload))<>4
    OR NOT(payload ?& ARRAY['organizationId','recipientId','expectedRevision','response'])
    OR jsonb_typeof(payload->'expectedRevision') IS DISTINCT FROM 'number'
    OR coalesce(payload->>'expectedRevision','') !~ '^(0|[1-9][0-9]{0,3})$'
    OR NOT mmhr_private.r4_portal_response_content_is_valid(payload->'response') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid portal response'; END IF;
  v_org := (payload->>'organizationId')::uuid; v_content := payload->'response';
  -- Portal replies use the portal's AAL1 permission. The security-admin command
  -- helper always requires AAL2, so keep the verified live-session boundary here.
  v_authorization_time := mmhr_private.r1_lock_security();
  v_actor := mmhr_private.r1_request_identity_id();
  IF v_actor IS NULL OR NOT mmhr_private.r1_verified_identity(v_actor,false)
    OR NOT mmhr_private.r1_request_has_permission('portal.vendor.access',v_org)
    OR EXISTS(SELECT 1 FROM public.identities WHERE status='recovery_pending') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Response vendor access denied'; END IF;
  SELECT rr.* INTO v_recipient FROM public.rfp_recipients rr JOIN public.vendor_profiles vp
    ON vp.organization_id=rr.vendor_organization_id AND vp.id=rr.vendor_profile_id AND vp.status='active'
    WHERE rr.id=(payload->>'recipientId')::uuid AND rr.vendor_organization_id=v_org
      AND rr.state IN ('distributed','acknowledged','responded') FOR UPDATE OF rr;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Response recipient denied'; END IF;
  v_receipt := mmhr_private.r1_checked_receipt(v_actor,'r4.rsp.portal_submit',idempotency_key,payload);
  IF v_receipt IS NOT NULL THEN
    SELECT * INTO v_previous FROM public.rfp_portal_submissions s
      WHERE s.normalization_id=(v_receipt->>'entity_id')::uuid AND s.recipient_id=v_recipient.id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Response replay denied'; END IF;
    RETURN jsonb_build_object('organizationId',v_org,'recipientId',v_recipient.id,
      'normalizationId',v_previous.normalization_id,'revision',v_previous.revision,'outcomeCode','replayed','correlationId',correlation_id);
  END IF;
  SELECT * INTO v_rfp FROM public.rfp_versions WHERE organization_id=v_recipient.organization_id AND id=v_recipient.rfp_version_id FOR UPDATE;
  IF NOT FOUND OR v_rfp.status<>'distributed' OR v_rfp.sections->0->>'sectionKey' IS DISTINCT FROM 'questionnaire' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Response request closed'; END IF;
  SELECT coalesce(max(revision),0) INTO v_current FROM public.rfp_portal_submissions WHERE recipient_id=v_recipient.id;
  IF v_current<>(payload->>'expectedRevision')::integer THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Response revision changed'; END IF;
  INSERT INTO public.inbound_email_events(id,provider_event_id,organization_id,conversation_token,sender_address,
    recipient_addresses,body_reference,attachment_references,raw_body_hash,signed_at,received_at,signature,
    processed_at,rfp_version_id,vendor_profile_id,vendor_organization_id,source_type)
  VALUES(v_id,'portal:'||v_id,v_recipient.organization_id,'portal:'||v_recipient.id,'identity:'||v_actor,
    '[]'::jsonb,'portal:'||v_id,'[]'::jsonb,encode(sha256(convert_to(v_content::text,'UTF8')),'hex'),
    clock_timestamp(),clock_timestamp(),'authenticated-portal',clock_timestamp(),v_rfp.id,v_recipient.vendor_profile_id,v_org,'portal');
  INSERT INTO public.rfp_response_normalizations(id,organization_id,inbound_event_id,rfp_version_id,vendor_profile_id,
    vendor_organization_id,supported_requirements,unsupported_requirements,caveats,dependencies,commitments,
    implementation_details,missing_answers,proposed_follow_ups,created_by_identity_id)
  VALUES(v_normalization,v_recipient.organization_id,v_id,v_rfp.id,v_recipient.vendor_profile_id,v_org,
    v_content->'supportedRequirements',v_content->'unsupportedRequirements',v_content->'caveats',
    v_content->'dependencies',v_content->'commitments',v_content->'implementationDetails',
    v_content->'missingAnswers',v_content->'proposedFollowUps',v_actor);
  INSERT INTO public.rfp_portal_submissions(id,organization_id,recipient_id,normalization_id,revision,submitted_by_identity_id)
  VALUES(v_id,v_recipient.organization_id,v_recipient.id,v_normalization,v_current+1,v_actor);
  UPDATE public.rfp_recipients SET state='responded',responded_at=clock_timestamp(),
    acknowledged_at=coalesce(acknowledged_at,clock_timestamp()) WHERE id=v_recipient.id;
  PERFORM mmhr_private.r1_finish_security_command(v_actor,'r4.rsp.portal_submit','rsp.portal_submit',
    'rfp_response_normalization',v_normalization,v_org,'Submit vendor portal response',correlation_id,idempotency_key,payload,
    NULL,jsonb_build_object('state','pending','version',v_current+1),v_authorization_time);
  RETURN jsonb_build_object('organizationId',v_org,'recipientId',v_recipient.id,'normalizationId',v_normalization,
    'revision',v_current+1,'outcomeCode','submitted','correlationId',correlation_id);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_submit_portal_response(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_submit_portal_response(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint

CREATE FUNCTION public.mmhr_get_portal_responses(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_org uuid; v_after uuid; v_view text; v_target uuid; v_rows jsonb; v_cursor uuid; v_actor uuid;
  v_request jsonb; v_revision integer; v_permission text;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid response read'; END IF;
  v_view := payload->>'view';
  IF v_view IS NULL OR v_view NOT IN ('vendor','staff','customer')
    OR NOT(payload ?& ARRAY['organizationId','view',CASE WHEN v_view='vendor' THEN 'recipientId' ELSE 'intakeId' END])
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN
      ('organizationId','view','afterId',CASE WHEN v_view='vendor' THEN 'recipientId' ELSE 'intakeId' END)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid response read'; END IF;
  v_org := (payload->>'organizationId')::uuid; v_after := (payload->>'afterId')::uuid;
  v_target := (payload->>CASE WHEN v_view='vendor' THEN 'recipientId' ELSE 'intakeId' END)::uuid;
  v_permission := CASE v_view WHEN 'vendor' THEN 'portal.vendor.access' WHEN 'staff' THEN 'rfp.approve' ELSE 'portal.customer.access' END;
  PERFORM mmhr_private.r1_lock_security();
  IF NOT mmhr_private.r1_request_has_permission(v_permission,v_org)
    OR (v_view='staff' AND NOT mmhr_private.r1_request_has_permission('admin.access',NULL)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Response read denied'; END IF;
  SELECT id INTO v_actor FROM public.identities WHERE auth_user_id=auth.uid() AND status='active';
  IF v_view='vendor' THEN
    SELECT jsonb_build_object('title',r.title,'content',r.sections->0->>'content','version',r.version,
      'deadlineAt',rr.deadline_at,'closed',r.status='closed') INTO v_request
      FROM public.rfp_recipients rr JOIN public.rfp_versions r ON r.organization_id=rr.organization_id AND r.id=rr.rfp_version_id
      JOIN public.vendor_profiles vp ON vp.organization_id=rr.vendor_organization_id AND vp.id=rr.vendor_profile_id AND vp.status='active'
      WHERE rr.vendor_organization_id=v_org AND rr.id=v_target AND rr.state IN ('distributed','acknowledged','responded')
        AND r.status IN ('distributed','closed') AND r.sections->0->>'sectionKey'='questionnaire';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Response request denied'; END IF;
    SELECT coalesce(max(revision),0) INTO v_revision FROM public.rfp_portal_submissions WHERE recipient_id=v_target;
  ELSIF NOT EXISTS(SELECT 1 FROM public.intakes WHERE organization_id=v_org AND id=v_target) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Response intake denied';
  END IF;
  SELECT coalesce(jsonb_agg(p.item ORDER BY p.id),'[]'::jsonb) INTO v_rows FROM (
    SELECT s.id,jsonb_build_object('submissionId',s.id,'recipientId',s.recipient_id,'normalizationId',n.id,
      'rfpId',r.rfp_id,'version',r.version,'revision',s.revision,'providerName',o.name,
      'state',n.state,'submittedAt',s.submitted_at,'approvedAt',n.approved_at,
      'reviewedByIdentityId',CASE WHEN v_view='staff' THEN n.reviewed_by_identity_id ELSE NULL END,
      'canReview',v_view='staff' AND n.state='pending' AND n.created_by_identity_id<>v_actor AND
        NOT EXISTS(SELECT 1 FROM public.rfp_portal_submissions newer WHERE newer.recipient_id=s.recipient_id AND newer.revision>s.revision),
      'canApprove',v_view='staff' AND n.state='reviewed' AND n.reviewed_by_identity_id<>v_actor AND
        NOT EXISTS(SELECT 1 FROM public.rfp_portal_submissions newer WHERE newer.recipient_id=s.recipient_id AND newer.revision>s.revision),
      'isLatest',NOT EXISTS(SELECT 1 FROM public.rfp_portal_submissions newer WHERE newer.recipient_id=s.recipient_id AND newer.revision>s.revision),
      'late',s.submitted_at>rr.deadline_at,'response',jsonb_build_object(
        'supportedRequirements',n.supported_requirements,'unsupportedRequirements',n.unsupported_requirements,
        'caveats',n.caveats,'dependencies',n.dependencies,'commitments',n.commitments,
        'implementationDetails',n.implementation_details,'missingAnswers',n.missing_answers,'proposedFollowUps',n.proposed_follow_ups)) item
    FROM public.rfp_portal_submissions s JOIN public.rfp_response_normalizations n ON n.organization_id=s.organization_id AND n.id=s.normalization_id
    JOIN public.rfp_recipients rr ON rr.organization_id=s.organization_id AND rr.id=s.recipient_id
    JOIN public.rfp_versions r ON r.organization_id=rr.organization_id AND r.id=rr.rfp_version_id
    JOIN public.vendor_profiles vp ON vp.organization_id=rr.vendor_organization_id AND vp.id=rr.vendor_profile_id AND vp.status='active'
    JOIN public.orgs o ON o.id=rr.vendor_organization_id
    WHERE (v_after IS NULL OR s.id>v_after) AND rr.state IN ('distributed','acknowledged','responded')
      AND r.status IN ('distributed','closed') AND (
        (v_view='vendor' AND rr.vendor_organization_id=v_org AND rr.id=v_target) OR
        (v_view IN ('staff','customer') AND s.organization_id=v_org AND r.source_intake_id=v_target))
      AND (v_view<>'customer' OR (n.state='approved' AND NOT EXISTS(
        SELECT 1 FROM public.rfp_portal_submissions newer JOIN public.rfp_response_normalizations nn ON nn.id=newer.normalization_id
        WHERE newer.recipient_id=s.recipient_id AND newer.revision>s.revision AND nn.state='approved')))
    ORDER BY s.id LIMIT 26) p;
  IF jsonb_array_length(v_rows)>25 THEN v_rows:=v_rows-25; v_cursor:=(v_rows->24->>'submissionId')::uuid; END IF;
  RETURN jsonb_build_object('organizationId',v_org,'items',v_rows,'nextCursor',v_cursor,
    'currentRevision',v_revision,'request',v_request,'correlationId',correlation_id);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_portal_responses(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_portal_responses(jsonb,uuid) TO authenticated;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_review_rfp_response_normalization(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; receipt jsonb; normalization public.rfp_response_normalizations%ROWTYPE; version_row public.rfp_versions%ROWTYPE; v_action text; v_id uuid; v_org uuid; v_actor uuid; v_rfp_id uuid; v_version integer; v_reference text; v_expected_state text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR coalesce(payload->>'action','') NOT IN ('review','approve','reject') OR correlation_id IS NULL OR idempotency_key IS NULL OR coalesce(payload->>'normalizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'rfpId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'version','') !~ '^[1-9][0-9]{0,3}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP response review input'; END IF;
  v_action := payload->>'action'; v_id := (payload->>'normalizationId')::uuid; v_org := (payload->>'organizationId')::uuid; v_rfp_id := (payload->>'rfpId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_version := (payload->>'version')::integer; v_reference := payload->>'approvalReference'; v_expected_state := CASE WHEN v_action = 'review' THEN 'pending' ELSE 'reviewed' END;
  IF v_action = 'approve' AND coalesce(v_reference,'') !~ '^approval:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid approval reference'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('rfp.approve', v_org, 'Review RFP response normalization', correlation_id, idempotency_key); IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  IF NOT mmhr_private.r1_request_has_permission('admin.access',NULL) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Response staff approval denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rsp.review', idempotency_key, payload); IF receipt IS NOT NULL THEN SELECT * INTO normalization FROM public.rfp_response_normalizations n WHERE n.id = (receipt->>'entity_id')::uuid AND n.organization_id = v_org; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('normalizationId', normalization.id, 'organizationId', normalization.organization_id, 'rfpId', v_rfp_id, 'version', v_version, 'state', normalization.state, 'reviewedByIdentityId', normalization.reviewed_by_identity_id, 'approvedByIdentityId', normalization.approved_by_identity_id, 'approvalReference', normalization.approval_reference, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  SELECT r.* INTO version_row FROM public.rfp_versions r JOIN public.rfp_response_normalizations n ON n.rfp_version_id = r.id AND n.organization_id = r.organization_id WHERE n.id = v_id AND n.organization_id = v_org AND r.rfp_id = v_rfp_id AND r.version = v_version; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP response review association denied'; END IF;
  SELECT * INTO normalization FROM public.rfp_response_normalizations n WHERE n.id = v_id AND n.organization_id = v_org FOR UPDATE; IF NOT FOUND OR normalization.state <> v_expected_state THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP response review transition denied'; END IF;
  IF EXISTS(SELECT 1 FROM public.rfp_portal_submissions s JOIN public.rfp_portal_submissions newer ON newer.recipient_id=s.recipient_id AND newer.revision>s.revision WHERE s.normalization_id=v_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Response revision superseded'; END IF;
  IF v_action = 'review' AND normalization.created_by_identity_id = v_actor THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP response reviewer denied'; END IF;
  IF v_action IN ('approve','reject') AND normalization.reviewed_by_identity_id = v_actor THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP response approver denied'; END IF;
  IF v_action = 'review' THEN UPDATE public.rfp_response_normalizations SET state = 'reviewed', reviewed_by_identity_id = v_actor, reviewed_at = clock_timestamp() WHERE id = v_id AND organization_id = v_org RETURNING * INTO normalization;
  ELSIF v_action = 'approve' THEN UPDATE public.rfp_response_normalizations SET state = 'approved', approved_by_identity_id = v_actor, approved_at = clock_timestamp(), approval_reference = v_reference WHERE id = v_id AND organization_id = v_org RETURNING * INTO normalization;
  ELSE UPDATE public.rfp_response_normalizations SET state = 'rejected' WHERE id = v_id AND organization_id = v_org RETURNING * INTO normalization; END IF;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.rsp.review', 'rsp.review', 'rfp_response_normalization', normalization.id, v_org, 'Review RFP response normalization', correlation_id, idempotency_key, payload, jsonb_build_object('state', CASE WHEN v_action = 'review' THEN 'pending' ELSE 'reviewed' END, 'version', version_row.version), jsonb_build_object('state', normalization.state, 'version', version_row.version), context.authorization_time);
  RETURN jsonb_build_object('normalizationId', normalization.id, 'organizationId', normalization.organization_id, 'rfpId', version_row.rfp_id, 'version', version_row.version, 'state', normalization.state, 'reviewedByIdentityId', normalization.reviewed_by_identity_id, 'approvedByIdentityId', normalization.approved_by_identity_id, 'approvalReference', normalization.approval_reference, 'outcomeCode', 'recorded', 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_review_rfp_response_normalization(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_review_rfp_response_normalization(jsonb, uuid, uuid) TO authenticated;

