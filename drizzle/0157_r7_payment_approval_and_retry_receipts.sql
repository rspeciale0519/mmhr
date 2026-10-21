-- Forward correction only. Preserve existing financial rows and receipt history.
-- Historical payment receipts without an original state fail closed.
DO $$
DECLARE definition text;
  marker constant text := $marker$WHEN e.key = 'version' THEN$marker$;
  finance_rule constant text := $rule$WHEN e.key = 'finance_state' THEN NOT (jsonb_typeof(e.item) = 'string' AND e.item #>> '{}' IN ('approved','invoiced','partially_paid','paid'))
      WHEN e.key = 'version' THEN$rule$;
BEGIN
  SELECT pg_get_functiondef('mmhr_private.r1_audit_summary_is_safe(jsonb)'::regprocedure) INTO definition;
  IF (length(definition) - length(replace(definition,marker,''))) / length(marker) <> 1 THEN
    RAISE EXCEPTION 'Finance audit summary baseline requires review';
  END IF;
  EXECUTE replace(definition,marker,finance_rule);
END $$;
--> statement-breakpoint
DO $$
DECLARE definition text; original text; corrected text;
BEGIN
  SELECT pg_get_functiondef('public.mmhr_record_commission_payment(jsonb,uuid,uuid)'::regprocedure) INTO definition;
  original := 'v_received bigint;';
  corrected := 'v_received bigint; v_original_state text;';
  IF (length(definition) - length(replace(definition,original,''))) / length(original) <> 1 THEN
    RAISE EXCEPTION 'Payment declaration baseline requires review';
  END IF;
  definition := replace(definition,original,corrected);

  original := $old$IF v_actor<>context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF;$old$;
  corrected := $new$IF v_actor<>context.actor_identity_id OR (payload->>'correlationId')::uuid IS DISTINCT FROM correlation_id
     OR (payload->>'idempotencyKey')::uuid IS DISTINCT FROM idempotency_key THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied';
 END IF;$new$;
  IF (length(definition) - length(replace(definition,original,''))) / length(original) <> 1 THEN
    RAISE EXCEPTION 'Payment request binding baseline requires review';
  END IF;
  definition := replace(definition,original,corrected);

  original := $old$IF receipt IS NOT NULL THEN RETURN jsonb_build_object('paymentId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id); END IF;$old$;
  corrected := $new$IF receipt IS NOT NULL THEN
   SELECT a.after_summary->>'finance_state' INTO v_original_state
   FROM public.security_command_receipts r
   JOIN public.audit_events a ON a.id = r.audit_event_id
   WHERE r.id = (receipt->>'receipt_id')::uuid AND r.actor_identity_id = v_actor
     AND r.command = 'r7.payment' AND r.entity_id = v_payment AND r.action = 'payment.record'
     AND a.actor_identity_id = v_actor AND a.organization_id = v_org
     AND a.command = 'r7.payment' AND a.action = 'payment.record'
     AND a.entity_type = 'commission_payment' AND a.entity_id = v_payment::text;
   IF NOT FOUND OR v_original_state IS NULL OR v_original_state NOT IN ('approved','invoiced','partially_paid','paid') THEN
     RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Original payment receipt unavailable';
   END IF;
   RETURN jsonb_build_object('paymentId',receipt->>'entity_id','commissionEventId',v_event,
     'organizationId',v_org,'eventState',v_original_state,'outcomeCode','replayed','correlationId',correlation_id);
 END IF;$new$;
  IF (length(definition) - length(replace(definition,original,''))) / length(original) <> 1 THEN
    RAISE EXCEPTION 'Payment retry baseline requires review';
  END IF;
  definition := replace(definition,original,corrected);

  original := $old$IF NOT FOUND OR event_row.state IN ('voided','written_off') THEN$old$;
  corrected := $new$IF NOT FOUND OR event_row.state NOT IN ('approved','invoiced','partially_paid') THEN$new$;
  IF (length(definition) - length(replace(definition,original,''))) / length(original) <> 1 THEN
    RAISE EXCEPTION 'Payment state baseline requires review';
  END IF;
  definition := replace(definition,original,corrected);

  original := $old$payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),context.authorization_time);$old$;
  corrected := $new$payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed','finance_state',event_row.state),context.authorization_time);$new$;
  IF (length(definition) - length(replace(definition,original,''))) / length(original) <> 1 THEN
    RAISE EXCEPTION 'Payment outcome baseline requires review';
  END IF;
  EXECUTE replace(definition,original,corrected);
END $$;
--> statement-breakpoint
DO $$
DECLARE definition text; actor_original text; actor_corrected text;
  original constant text := $old$IF receipt IS NOT NULL THEN RETURN jsonb_build_object('invoiceId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id); END IF;$old$;
  corrected constant text := $new$IF receipt IS NOT NULL THEN
   IF receipt->>'action' IS DISTINCT FROM 'invoice.'||v_action OR (receipt->>'entity_id')::uuid IS DISTINCT FROM v_id THEN
     RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Original invoice receipt unavailable';
   END IF;
   RETURN jsonb_build_object('invoiceId',receipt->>'entity_id','organizationId',v_org,
     'status',CASE v_action WHEN 'create' THEN 'draft' WHEN 'issue' THEN 'issued' ELSE 'voided' END,
     'outcomeCode','replayed','correlationId',correlation_id);
 END IF;$new$;
BEGIN
  SELECT pg_get_functiondef('public.mmhr_record_invoice(jsonb,uuid,uuid)'::regprocedure) INTO definition;
  IF (length(definition) - length(replace(definition,original,''))) / length(original) <> 1 THEN
    RAISE EXCEPTION 'Invoice retry baseline requires review';
  END IF;
  definition := replace(definition,original,corrected);
  actor_original := $old$IF v_actor<>context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF;$old$;
  actor_corrected := $new$IF v_actor<>context.actor_identity_id OR (payload->>'correlationId')::uuid IS DISTINCT FROM correlation_id
     OR (payload->>'idempotencyKey')::uuid IS DISTINCT FROM idempotency_key
     OR (v_action='create' AND (payload->>'createdByIdentityId')::uuid IS DISTINCT FROM v_actor) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied';
 END IF;$new$;
  IF (length(definition) - length(replace(definition,actor_original,''))) / length(actor_original) <> 1 THEN
    RAISE EXCEPTION 'Invoice request binding baseline requires review';
  END IF;
  EXECUTE replace(definition,actor_original,actor_corrected);
END $$;
