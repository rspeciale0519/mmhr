ALTER TABLE "rfp_clarifications" ADD COLUMN "portal_recipient_id" uuid;--> statement-breakpoint
ALTER TABLE "rfp_clarifications" ADD COLUMN "reply_normalization_id" uuid;--> statement-breakpoint
ALTER TABLE "rfp_clarifications" ADD COLUMN "decision_reason" text;--> statement-breakpoint
-- The composite recipient key must exist before its foreign key is created.
CREATE UNIQUE INDEX "rfp_recipients_organization_id_uq" ON "rfp_recipients" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "rfp_clarifications" ADD CONSTRAINT "rfp_clarifications_portal_recipient_fk" FOREIGN KEY ("organization_id","portal_recipient_id") REFERENCES "public"."rfp_recipients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_clarifications" ADD CONSTRAINT "rfp_clarifications_reply_normalization_fk" FOREIGN KEY ("organization_id","reply_normalization_id") REFERENCES "public"."rfp_response_normalizations"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rfp_clarifications_portal_idx" ON "rfp_clarifications" USING btree ("portal_recipient_id","id");--> statement-breakpoint
ALTER TABLE "rfp_clarifications" ADD CONSTRAINT "rfp_clarifications_portal_association_ck" CHECK ("rfp_clarifications"."portal_recipient_id" is null or ("rfp_clarifications"."response_normalization_id" is not null and "rfp_clarifications"."deadline_at" is not null));--> statement-breakpoint
ALTER TABLE "rfp_clarifications" ADD CONSTRAINT "rfp_clarifications_portal_decision_ck" CHECK ("rfp_clarifications"."portal_recipient_id" is null or "rfp_clarifications"."decision" = 'pending' or "rfp_clarifications"."decision_reason" is not null);
--> statement-breakpoint

CREATE FUNCTION mmhr_private.r4_clarification_text_is_valid(value text,maximum_bytes integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT value IS NOT NULL AND octet_length(value) BETWEEN 1 AND maximum_bytes
    AND value=btrim(value,E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)
      ||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)
      ||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279));
$$;
REVOKE ALL ON FUNCTION mmhr_private.r4_clarification_text_is_valid(text,integer) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;

-- Protect portal questions from older clarification RPCs as well as direct DML.
-- An answer comes from the assigned vendor. A decision comes from independent staff.
CREATE FUNCTION mmhr_private.r4_guard_portal_clarification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_recipient public.rfp_recipients%ROWTYPE; v_submission public.rfp_portal_submissions%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.portal_recipient_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification history is immutable'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD.portal_recipient_id IS NOT NULL AND
    ROW(NEW.id,NEW.organization_id,NEW.rfp_version_id,NEW.portal_recipient_id,NEW.response_normalization_id,
      NEW.question,NEW.deadline_at,NEW.asked_at,NEW.asked_by_identity_id,NEW.created_at,NEW.response_reference)
    IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.rfp_version_id,OLD.portal_recipient_id,OLD.response_normalization_id,
      OLD.question,OLD.deadline_at,OLD.asked_at,OLD.asked_by_identity_id,OLD.created_at,OLD.response_reference) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification question is immutable';
  END IF;
  IF NEW.portal_recipient_id IS NULL THEN RETURN NEW; END IF;
  v_actor:=mmhr_private.r1_request_identity_id();
  SELECT * INTO v_recipient FROM public.rfp_recipients
    WHERE id=NEW.portal_recipient_id AND organization_id=NEW.organization_id AND rfp_version_id=NEW.rfp_version_id;
  IF NOT FOUND OR NOT mmhr_private.r4_clarification_text_is_valid(NEW.question,5000) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification association denied'; END IF;
  IF TG_OP='INSERT' THEN
    IF v_actor IS NULL OR NEW.asked_by_identity_id IS DISTINCT FROM v_actor
      OR NOT mmhr_private.r1_request_has_permission('rfp.approve',NEW.organization_id)
      OR NOT mmhr_private.r1_request_has_permission('admin.access',NULL)
      OR NEW.status<>'pending' OR NEW.decision<>'pending' OR NEW.answer IS NOT NULL
      OR NEW.reply_normalization_id IS NOT NULL OR NEW.decision_reason IS NOT NULL
      OR NEW.deadline_at IS NULL OR NOT isfinite(NEW.deadline_at) OR NEW.deadline_at<=clock_timestamp()
      OR NOT EXISTS(SELECT 1 FROM public.rfp_portal_submissions WHERE recipient_id=v_recipient.id AND normalization_id=NEW.response_normalization_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification staff question denied'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.answer IS DISTINCT FROM OLD.answer THEN
    IF OLD.status<>'pending' OR OLD.answer IS NOT NULL OR NEW.status<>'answered' OR NEW.decision<>'pending'
      OR NEW.answered_by_identity_id IS DISTINCT FROM v_actor OR NEW.answered_at IS NULL
      OR NOT mmhr_private.r1_request_has_permission('portal.vendor.access',v_recipient.vendor_organization_id)
      OR NOT mmhr_private.r4_clarification_text_is_valid(NEW.answer,5000)
      OR NOT mmhr_private.r4_clarification_text_is_valid(NEW.change_summary,2000)
      OR NEW.decision_reason IS NOT NULL OR NEW.approved_by_identity_id IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.approval_reference IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification vendor answer denied'; END IF;
    IF NEW.reply_normalization_id IS NOT NULL THEN
      SELECT * INTO v_submission FROM public.rfp_portal_submissions WHERE recipient_id=v_recipient.id AND normalization_id=NEW.reply_normalization_id;
      IF NOT FOUND OR v_submission.revision<=(SELECT revision FROM public.rfp_portal_submissions WHERE normalization_id=NEW.response_normalization_id)
        OR EXISTS(SELECT 1 FROM public.rfp_portal_submissions WHERE recipient_id=v_recipient.id AND revision>v_submission.revision) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification revision denied'; END IF;
    END IF;
  ELSIF NEW.decision IS DISTINCT FROM OLD.decision THEN
    IF OLD.status<>'answered' OR OLD.decision<>'pending' OR NEW.decision NOT IN ('accepted','rejected','deferred')
      OR NOT mmhr_private.r1_request_has_permission('rfp.approve',NEW.organization_id)
      OR NOT mmhr_private.r1_request_has_permission('admin.access',NULL)
      OR v_actor IS NULL OR v_actor=OLD.asked_by_identity_id OR v_actor=OLD.answered_by_identity_id
      OR NOT mmhr_private.r4_clarification_text_is_valid(NEW.decision_reason,2000)
      OR ROW(NEW.answer,NEW.change_summary,NEW.reply_normalization_id,NEW.answered_by_identity_id,NEW.answered_at)
        IS DISTINCT FROM ROW(OLD.answer,OLD.change_summary,OLD.reply_normalization_id,OLD.answered_by_identity_id,OLD.answered_at) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification staff decision denied'; END IF;
    IF NEW.decision='accepted' THEN
      SELECT * INTO v_submission FROM public.rfp_portal_submissions WHERE recipient_id=v_recipient.id
        AND normalization_id=coalesce(NEW.reply_normalization_id,NEW.response_normalization_id);
      IF NOT FOUND OR EXISTS(SELECT 1 FROM public.rfp_portal_submissions WHERE recipient_id=v_recipient.id AND revision>v_submission.revision)
        OR NEW.status<>'approved' OR NEW.approved_by_identity_id IS DISTINCT FROM v_actor OR NEW.approved_at IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification approval denied'; END IF;
    ELSIF NEW.status<>(CASE WHEN NEW.decision='rejected' THEN 'rejected' ELSE 'answered' END)
      OR NEW.approved_by_identity_id IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.approval_reference IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification decision state denied';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification history is immutable';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_guard_portal_clarification() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
CREATE TRIGGER r4_guard_portal_clarification BEFORE INSERT OR UPDATE OR DELETE ON public.rfp_clarifications
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_guard_portal_clarification();
CREATE TRIGGER r4_clarifications_no_truncate BEFORE TRUNCATE ON public.rfp_clarifications
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint

CREATE FUNCTION public.mmhr_record_portal_response_clarification(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_action text; v_org uuid; v_actor uuid; v_time timestamptz; v_receipt jsonb; v_keys text[];
  v_recipient public.rfp_recipients%ROWTYPE; v_rfp public.rfp_versions%ROWTYPE;
  v_source public.rfp_portal_submissions%ROWTYPE; v_clarification public.rfp_clarifications%ROWTYPE;
  v_id uuid; v_deadline timestamptz; v_decision text;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL OR idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid clarification request'; END IF;
  v_action:=payload->>'action';
  v_keys:=CASE v_action WHEN 'ask' THEN ARRAY['action','organizationId','recipientId','normalizationId','question','deadlineAt']
    WHEN 'reply' THEN ARRAY['action','organizationId','clarificationId','answer','changeSummary','replyNormalizationId']
    WHEN 'decide' THEN ARRAY['action','organizationId','clarificationId','decision','reason'] ELSE NULL END;
  IF v_keys IS NULL OR NOT(payload ?& v_keys) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT(k=ANY(v_keys))) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid clarification fields'; END IF;
  IF (v_action='ask' AND (NOT mmhr_private.r4_clarification_text_is_valid(payload->>'question',5000)
      OR jsonb_typeof(payload->'question') IS DISTINCT FROM 'string'))
    OR (v_action='reply' AND (NOT mmhr_private.r4_clarification_text_is_valid(payload->>'answer',5000)
      OR NOT mmhr_private.r4_clarification_text_is_valid(payload->>'changeSummary',2000)
      OR jsonb_typeof(payload->'answer') IS DISTINCT FROM 'string' OR jsonb_typeof(payload->'changeSummary') IS DISTINCT FROM 'string'))
    OR (v_action='decide' AND (NOT mmhr_private.r4_clarification_text_is_valid(payload->>'reason',2000)
      OR jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string' OR coalesce(payload->>'decision','') NOT IN ('accepted','rejected','deferred'))) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid clarification text'; END IF;
  v_org:=(payload->>'organizationId')::uuid;
  v_time:=mmhr_private.r1_lock_security(); v_actor:=mmhr_private.r1_request_identity_id();
  IF v_actor IS NULL OR NOT mmhr_private.r1_verified_identity(v_actor,false)
    OR NOT mmhr_private.r1_request_has_permission(CASE WHEN v_action='reply' THEN 'portal.vendor.access' ELSE 'rfp.approve' END,v_org)
    OR (v_action<>'reply' AND NOT mmhr_private.r1_request_has_permission('admin.access',NULL))
    OR EXISTS(SELECT 1 FROM public.identities WHERE status='recovery_pending') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification access denied'; END IF;
  IF v_action='ask' THEN
    SELECT * INTO v_recipient FROM public.rfp_recipients WHERE organization_id=v_org AND id=(payload->>'recipientId')::uuid FOR UPDATE;
  ELSE
    SELECT c.* INTO v_clarification FROM public.rfp_clarifications c JOIN public.rfp_recipients rr ON rr.id=c.portal_recipient_id AND rr.organization_id=c.organization_id
      WHERE c.id=(payload->>'clarificationId')::uuid
        AND CASE WHEN v_action='reply' THEN rr.vendor_organization_id=v_org ELSE rr.organization_id=v_org END FOR UPDATE OF c;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification not available'; END IF;
    SELECT * INTO v_recipient FROM public.rfp_recipients WHERE id=v_clarification.portal_recipient_id FOR UPDATE;
  END IF;
  IF NOT FOUND OR v_recipient.state NOT IN ('distributed','acknowledged','responded')
    OR NOT EXISTS(SELECT 1 FROM public.vendor_profiles WHERE id=v_recipient.vendor_profile_id AND organization_id=v_recipient.vendor_organization_id AND status='active') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification recipient denied'; END IF;
  v_receipt:=mmhr_private.r1_checked_receipt(v_actor,'r4.rsp.portal_clarification.'||v_action,idempotency_key,payload);
  IF v_receipt IS NOT NULL THEN
    SELECT * INTO v_clarification FROM public.rfp_clarifications WHERE id=(v_receipt->>'entity_id')::uuid AND portal_recipient_id=v_recipient.id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification replay denied'; END IF;
  ELSE
    SELECT * INTO v_rfp FROM public.rfp_versions WHERE id=v_recipient.rfp_version_id AND organization_id=v_recipient.organization_id FOR UPDATE;
    IF NOT FOUND OR (v_action IN ('ask','reply') AND v_rfp.status<>'distributed') THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification request closed'; END IF;
    IF v_action='ask' THEN
      SELECT s.* INTO v_source FROM public.rfp_portal_submissions s JOIN public.rfp_response_normalizations n ON n.id=s.normalization_id
        WHERE s.recipient_id=v_recipient.id AND s.normalization_id=(payload->>'normalizationId')::uuid AND n.state IN ('pending','reviewed','approved');
      IF NOT FOUND OR EXISTS(SELECT 1 FROM public.rfp_portal_submissions WHERE recipient_id=v_recipient.id AND revision>v_source.revision) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification response revision denied'; END IF;
      v_deadline:=(payload->>'deadlineAt')::timestamptz;
      IF v_deadline IS NULL OR NOT isfinite(v_deadline) OR v_deadline<=clock_timestamp() OR v_deadline>clock_timestamp()+interval '1 year' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid clarification deadline'; END IF;
      INSERT INTO public.rfp_clarifications(organization_id,rfp_version_id,portal_recipient_id,response_normalization_id,
        question,deadline_at,asked_at,asked_by_identity_id)
      VALUES(v_org,v_rfp.id,v_recipient.id,v_source.normalization_id,payload->>'question',v_deadline,clock_timestamp(),v_actor) RETURNING * INTO v_clarification;
    ELSIF v_action='reply' THEN
      UPDATE public.rfp_clarifications SET answer=payload->>'answer',change_summary=payload->>'changeSummary',
        reply_normalization_id=(payload->>'replyNormalizationId')::uuid,status='answered',answered_by_identity_id=v_actor,
        answered_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=v_clarification.id RETURNING * INTO v_clarification;
    ELSE
      v_decision:=payload->>'decision';
      UPDATE public.rfp_clarifications SET decision=v_decision,decision_reason=payload->>'reason',
        status=CASE v_decision WHEN 'accepted' THEN 'approved' WHEN 'rejected' THEN 'rejected' ELSE 'answered' END,
        approved_by_identity_id=CASE WHEN v_decision='accepted' THEN v_actor ELSE NULL END,
        approved_at=CASE WHEN v_decision='accepted' THEN clock_timestamp() ELSE NULL END,
        approval_reference=CASE WHEN v_decision='accepted' THEN 'approval:portal-clarification:'||idempotency_key ELSE NULL END,
        updated_at=clock_timestamp() WHERE id=v_clarification.id RETURNING * INTO v_clarification;
    END IF;
    PERFORM mmhr_private.r1_finish_security_command(v_actor,'r4.rsp.portal_clarification.'||v_action,'rsp.portal_clarification.'||v_action,
      'rfp_clarification',v_clarification.id,v_org,'Record portal response clarification',correlation_id,idempotency_key,payload,
      NULL,jsonb_build_object('state',CASE WHEN v_action='decide' THEN 'completed' ELSE 'pending' END),v_time);
  END IF;
  RETURN jsonb_build_object('organizationId',v_org,'correlationId',correlation_id,'clarificationId',v_clarification.id,
    'recipientId',v_recipient.id,'normalizationId',v_clarification.response_normalization_id,'replyNormalizationId',v_clarification.reply_normalization_id,
    'status',v_clarification.status,'decision',v_clarification.decision,'outcomeCode',CASE WHEN v_receipt IS NULL THEN 'recorded' ELSE 'replayed' END);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_record_portal_response_clarification(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_portal_response_clarification(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint

CREATE FUNCTION public.mmhr_get_portal_response_clarifications(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_view text; v_org uuid; v_target uuid; v_after uuid; v_actor uuid; v_rows jsonb; v_cursor uuid;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid clarification read'; END IF;
  v_view:=payload->>'view';
  IF v_view IS NULL OR v_view NOT IN ('vendor','staff','customer') OR NOT(payload ?& ARRAY['view','organizationId',CASE WHEN v_view='vendor' THEN 'recipientId' ELSE 'intakeId' END])
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('view','organizationId','afterId',CASE WHEN v_view='vendor' THEN 'recipientId' ELSE 'intakeId' END)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid clarification read fields'; END IF;
  v_org:=(payload->>'organizationId')::uuid; v_target:=(payload->>CASE WHEN v_view='vendor' THEN 'recipientId' ELSE 'intakeId' END)::uuid; v_after:=(payload->>'afterId')::uuid;
  PERFORM mmhr_private.r1_lock_security(); v_actor:=mmhr_private.r1_request_identity_id();
  IF NOT mmhr_private.r1_request_has_permission(CASE v_view WHEN 'vendor' THEN 'portal.vendor.access' WHEN 'staff' THEN 'rfp.approve' ELSE 'portal.customer.access' END,v_org)
    OR (v_view='staff' AND NOT mmhr_private.r1_request_has_permission('admin.access',NULL)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification read denied'; END IF;
  IF v_view='vendor' THEN
    IF NOT EXISTS(SELECT 1 FROM public.rfp_recipients rr JOIN public.rfp_versions r ON r.id=rr.rfp_version_id
      JOIN public.vendor_profiles vp ON vp.id=rr.vendor_profile_id AND vp.organization_id=rr.vendor_organization_id AND vp.status='active'
      WHERE rr.id=v_target AND rr.vendor_organization_id=v_org AND rr.state IN ('distributed','acknowledged','responded') AND r.status IN ('distributed','closed')) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification request denied'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.intakes WHERE id=v_target AND organization_id=v_org) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Clarification intake denied';
  END IF;
  SELECT coalesce(jsonb_agg(p.item ORDER BY p.id),'[]'::jsonb) INTO v_rows FROM (
    SELECT c.id,jsonb_build_object('clarificationId',c.id,'recipientId',rr.id,
      'normalizationId',CASE WHEN v_view='customer' AND c.reply_normalization_id IS NOT NULL THEN NULL ELSE c.response_normalization_id END,
      'replyNormalizationId',c.reply_normalization_id,'providerName',o.name,'question',c.question,'answer',c.answer,
      'changeSummary',c.change_summary,'decisionReason',c.decision_reason,'deadlineAt',c.deadline_at,'askedAt',c.asked_at,'answeredAt',c.answered_at,
      'revision',s.revision,'replyRevision',reply.revision,
      'latestNormalizationId',CASE WHEN v_view='customer' THEN coalesce(c.reply_normalization_id,c.response_normalization_id) ELSE latest.normalization_id END,
      'latestRevision',CASE WHEN v_view='customer' THEN coalesce(reply.revision,s.revision) ELSE latest.revision END,
      'status',c.status,'decision',c.decision,
      'canReply',v_view='vendor' AND c.status='pending' AND r.status='distributed',
      'canDecide',v_view='staff' AND c.status='answered' AND c.decision='pending' AND c.asked_by_identity_id<>v_actor AND c.answered_by_identity_id<>v_actor,
      'late',coalesce(c.answered_at,clock_timestamp())>c.deadline_at) item
    FROM public.rfp_clarifications c JOIN public.rfp_recipients rr ON rr.id=c.portal_recipient_id AND rr.organization_id=c.organization_id
    JOIN public.rfp_versions r ON r.id=c.rfp_version_id AND r.organization_id=c.organization_id
    JOIN public.rfp_portal_submissions s ON s.normalization_id=c.response_normalization_id AND s.recipient_id=rr.id
    LEFT JOIN public.rfp_portal_submissions reply ON reply.normalization_id=c.reply_normalization_id AND reply.recipient_id=rr.id
    JOIN LATERAL(SELECT normalization_id,revision FROM public.rfp_portal_submissions WHERE recipient_id=rr.id ORDER BY revision DESC LIMIT 1) latest ON true
    JOIN public.vendor_profiles vp ON vp.id=rr.vendor_profile_id AND vp.organization_id=rr.vendor_organization_id AND vp.status='active'
    JOIN public.orgs o ON o.id=rr.vendor_organization_id
    WHERE (v_after IS NULL OR c.id>v_after) AND rr.state IN ('distributed','acknowledged','responded') AND r.status IN ('distributed','closed')
      AND CASE WHEN v_view='vendor' THEN rr.vendor_organization_id=v_org AND rr.id=v_target ELSE c.organization_id=v_org AND r.source_intake_id=v_target END
      AND (v_view<>'customer' OR (c.status='approved' AND c.decision='accepted'
        AND EXISTS(SELECT 1 FROM public.rfp_response_normalizations WHERE id=coalesce(c.reply_normalization_id,c.response_normalization_id) AND state='approved')
        AND NOT EXISTS(SELECT 1 FROM public.rfp_portal_submissions newer JOIN public.rfp_response_normalizations n ON n.id=newer.normalization_id
          WHERE newer.recipient_id=rr.id AND newer.revision>coalesce(reply.revision,s.revision) AND n.state='approved')))
    ORDER BY c.id LIMIT 26) p;
  IF jsonb_array_length(v_rows)>25 THEN v_rows:=v_rows-25; v_cursor:=(v_rows->24->>'clarificationId')::uuid; END IF;
  RETURN jsonb_build_object('organizationId',v_org,'correlationId',correlation_id,'items',v_rows,'nextCursor',v_cursor);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_portal_response_clarifications(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_portal_response_clarifications(jsonb,uuid) TO authenticated;
