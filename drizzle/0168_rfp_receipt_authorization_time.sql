-- Reviewed forward correction. Original 0166 table and evidence remain unchanged.
-- This private boundary retains the complete 0005 identity recovery rules.
CREATE FUNCTION mmhr_private.r4_receipt_context_at(requested_org uuid,requested_view text,authorization_time timestamptz)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  claims jsonb := auth.jwt();
  checked_at timestamptz := authorization_time;
  request_session uuid;
  actor uuid;
BEGIN
  -- Fresh provider facts after serialized waits require a new statement snapshot.
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RETURN NULL; END IF;
  IF checked_at IS NULL OR requested_org IS NULL OR requested_view NOT IN ('vendor','staff','customer')
    OR requested_view IS NULL OR claims ->> 'role' IS DISTINCT FROM 'authenticated'
    OR coalesce(claims ->> 'aal','') NOT IN ('aal1','aal2')
    OR coalesce(claims ->> 'exp','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims ->> 'iat','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims ->> 'sub','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR coalesce(claims ->> 'session_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
  THEN RETURN NULL; END IF;
  request_session := (claims ->> 'session_id')::uuid;
  IF (claims ->> 'exp')::numeric <= extract(epoch FROM checked_at)
    OR (claims ->> 'iat')::numeric > floor(extract(epoch FROM checked_at))
    OR (claims ->> 'iat')::numeric >= (claims ->> 'exp')::numeric
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = request_session AND s.user_id = auth.uid()
      AND (s.not_after IS NULL OR s.not_after > checked_at))
  THEN RETURN NULL; END IF;
  IF claims ->> 'aal' = 'aal2' AND NOT mmhr_private.r1_session_is_aal2(auth.uid(),request_session,checked_at)
  THEN RETURN NULL; END IF;
  SELECT i.id INTO actor FROM public.identities i
    WHERE i.auth_user_id = auth.uid() AND mmhr_private.r1_verified_identity(i.id,false)
      AND (i.authorization_not_before IS NULL
        OR (claims ->> 'iat')::numeric > floor(extract(epoch FROM i.authorization_not_before))
          AND EXISTS (
            SELECT 1 FROM auth.sessions s WHERE s.id = request_session AND s.user_id = i.auth_user_id
              AND (s.created_at > i.authorization_not_before OR EXISTS (
                SELECT 1 FROM public.identity_recovery_presence p
                JOIN public.identity_recovery_requests r ON r.id = p.linked_request_id
                JOIN public.identity_admin_intents intent ON intent.recovery_request_id = r.id
                JOIN public.identity_intent_attempts first_attempt ON first_attempt.intent_id = intent.id
                  AND first_attempt.attempt_number = 1 AND first_attempt.mode = 'dispatch'
                WHERE p.target_identity_id = i.id AND p.auth_subject_id = i.auth_user_id
                  AND p.auth_session_id = request_session::text AND p.state = 'completed'
                  AND mmhr_private.r1_worker_uuid_is_valid(p.expected_replacement_factor_id)
                  AND r.recovery_presence_id = p.id AND r.target_identity_id = i.id
                  AND r.state = 'completed' AND r.action = 'mfa_enrollment_reset'
                  AND p.completed_at >= r.completed_at AND p.completed_at <= checked_at
                  AND intent.target_identity_id = i.id AND intent.auth_subject_id = i.auth_user_id
                  AND intent.initiated_by_identity_id = r.initiated_by_identity_id
                  AND intent.operation = 'mfa_enrollment_reset' AND intent.state = 'succeeded'
                  AND intent.result_code = 'mfa_zero_factors' AND intent.confirmed_factor_count = 0
                  AND intent.dispatch_count = 1 AND intent.completed_at = r.completed_at
                  AND first_attempt.started_at = i.authorization_not_before
                  AND mmhr_private.r1_identity_intent_history_is_valid(intent)
              ))
          ));
  IF actor IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.identities i JOIN auth.users u ON u.id=i.auth_user_id
    WHERE i.id=actor AND i.status='active' AND NOT i.migration_review_required
      AND i.email_verified_at IS NOT NULL AND u.email_confirmed_at IS NOT NULL
      AND i.normalized_email=lower(btrim(u.email)) AND u.deleted_at IS NULL AND NOT u.is_anonymous
      AND (u.banned_until IS NULL OR u.banned_until<=checked_at))
    OR requested_view='vendor' AND EXISTS(SELECT 1 FROM public.identities WHERE status='recovery_pending')
    OR requested_view<>'vendor' AND EXISTS(
      SELECT 1 FROM public.permission_definitions d
      WHERE d.key=CASE WHEN requested_view='staff' THEN 'rfp.distribute' ELSE 'portal.customer.access' END
        AND d.minimum_assurance='aal2'
        AND EXISTS(SELECT 1 FROM public.identities WHERE status='recovery_pending'))
    OR requested_view='staff' AND EXISTS(
      SELECT 1 FROM public.permission_definitions d WHERE d.key='admin.access' AND d.minimum_assurance='aal2'
        AND EXISTS(SELECT 1 FROM public.identities WHERE status='recovery_pending'))
    OR NOT mmhr_private.r1_evaluate_permission(actor,
      CASE requested_view WHEN 'vendor' THEN 'portal.vendor.access' WHEN 'staff' THEN 'rfp.distribute' ELSE 'portal.customer.access' END,
      requested_org,claims->>'aal',checked_at,false)
    OR requested_view='staff' AND NOT mmhr_private.r1_evaluate_permission(actor,'admin.access',NULL,claims->>'aal',checked_at,false)
    THEN RETURN NULL; END IF;
  RETURN actor;
END
$$;
REVOKE ALL ON FUNCTION mmhr_private.r4_receipt_context_at(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mmhr_private.r4_receipt_actor(vendor_org uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid;
BEGIN
  v_actor:=mmhr_private.r4_receipt_context_at(vendor_org,'vendor',clock_timestamp());
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt access denied'; END IF;
  RETURN v_actor;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mmhr_private.r4_receipt_evidence_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_recipient public.rfp_recipients%ROWTYPE; v_request jsonb; v_result jsonb; v_key uuid; v_time timestamptz;
BEGIN
  v_time:=mmhr_private.r1_lock_security();
  SELECT * INTO v_recipient FROM public.rfp_recipients WHERE id=NEW.recipient_id FOR UPDATE;
  v_time:=clock_timestamp();
  IF v_recipient.id IS NULL OR v_recipient.organization_id IS DISTINCT FROM NEW.customer_organization_id
    OR v_recipient.vendor_organization_id IS DISTINCT FROM NEW.vendor_organization_id
    OR v_recipient.rfp_version_id IS DISTINCT FROM NEW.rfp_version_id
    OR v_recipient.acknowledged_at IS NOT NULL OR v_recipient.state<>'distributed'
    OR NEW.actor_identity_id IS DISTINCT FROM mmhr_private.r4_receipt_context_at(NEW.vendor_organization_id,'vendor',v_time) THEN
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_confirm_rfp_receipt(payload jsonb,correlation_id uuid,idempotency_key uuid)
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
  v_time := mmhr_private.r1_lock_security(); v_actor := mmhr_private.r4_receipt_context_at(v_org,'vendor',v_time);
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt access denied'; END IF;
  -- A receipt cannot bypass current session, portal, membership, or exact recipient authority.
  SELECT rr.* INTO v_recipient FROM public.rfp_recipients rr JOIN public.vendor_profiles vp
    ON vp.organization_id=rr.vendor_organization_id AND vp.id=rr.vendor_profile_id AND vp.status='active'
    WHERE rr.id=(payload->>'recipientId')::uuid AND rr.vendor_organization_id=v_org
      AND rr.rfp_version_id=(payload->>'rfpVersionId')::uuid AND rr.state IN ('distributed','acknowledged','responded') FOR UPDATE OF rr;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt target denied'; END IF;
  -- A privileged holder can delay the recipient lock after the authority guard.
  v_time:=clock_timestamp();
  v_actor:=mmhr_private.r4_receipt_context_at(v_org,'vendor',v_time);
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt access denied'; END IF;
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_get_rfp_receipt_status(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_org uuid; v_view text; v_intake uuid; v_after uuid; v_rows jsonb; v_cursor uuid; v_time timestamptz;
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
  v_time:=mmhr_private.r1_lock_security();
  IF mmhr_private.r4_receipt_context_at(v_org,v_view,v_time) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP receipt read denied'; END IF;
  IF v_view<>'vendor' AND NOT EXISTS(SELECT 1 FROM public.intakes i WHERE i.id=v_intake AND i.organization_id=v_org) THEN
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
