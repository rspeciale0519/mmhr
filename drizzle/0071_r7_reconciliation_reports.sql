-- R7 immutable finance reconciliation report controls.
CREATE TABLE IF NOT EXISTS public.finance_reconciliation_reports (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  report_rows jsonb NOT NULL,
  created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_reconciliation_reports_period_ck CHECK (period_end > period_start),
  CONSTRAINT finance_reconciliation_reports_rows_ck CHECK (jsonb_typeof(report_rows) = 'array' AND jsonb_array_length(report_rows) BETWEEN 1 AND 10000)
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_reconciliation_reports_organization_id_uq ON public.finance_reconciliation_reports(organization_id,id);
ALTER TABLE public.finance_reconciliation_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_reconciliation_reports FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
CREATE POLICY r7_deny_anon_authenticated_finance_reconciliation_reports ON public.finance_reconciliation_reports AS RESTRICTIVE FOR ALL TO anon,authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.mmhr_record_finance_reconciliation(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; report public.finance_reconciliation_reports%ROWTYPE; event_row public.commission_events%ROWTYPE; row_item jsonb; v_org uuid; v_actor uuid; v_id uuid; v_event uuid; v_start timestamptz; v_end timestamptz; v_earned bigint; v_invoiced bigint; v_received bigint; v_balance bigint; v_rows integer; v_seen uuid[] := ARRAY[]::uuid[];
BEGIN
 IF jsonb_typeof(payload)<>'object' OR coalesce(payload->>'reportId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR jsonb_typeof(payload->'reportRows')<>'array' OR jsonb_array_length(payload->'reportRows') NOT BETWEEN 1 AND 10000 OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid reconciliation input'; END IF;
 v_org:=(payload->>'organizationId')::uuid; v_actor:=(payload->>'actorIdentityId')::uuid; v_id:=(payload->>'reportId')::uuid; v_start:=(payload->>'periodStart')::timestamptz; v_end:=(payload->>'periodEnd')::timestamptz; IF v_start IS NULL OR v_end IS NULL OR v_end<=v_start THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid reconciliation period'; END IF;
 SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access',v_org,'Record finance reconciliation',correlation_id,idempotency_key); IF v_actor<>context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF;
 receipt:=mmhr_private.r1_checked_receipt(context.actor_identity_id,'r7.reconciliation',idempotency_key,payload); IF receipt IS NOT NULL THEN RETURN jsonb_build_object('reportId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id); END IF;
 v_rows:=jsonb_array_length(payload->'reportRows');
 FOR row_item IN SELECT value FROM jsonb_array_elements(payload->'reportRows') AS item(value) LOOP
   IF jsonb_typeof(row_item)<>'object' OR coalesce(row_item->>'commissionEventId','') !~ '^[0-9a-fA-F-]{36}$' OR row_item->>'currency' !~ '^[A-Z]{3}$' OR coalesce((row_item->>'earnedMinorUnits')::bigint,-1)<0 OR coalesce((row_item->>'invoicedMinorUnits')::bigint,-1)<0 OR coalesce((row_item->>'receivedMinorUnits')::bigint,-1)<0 OR (row_item->>'balanceMinorUnits') IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid reconciliation row'; END IF;
   v_event:=(row_item->>'commissionEventId')::uuid; IF v_event=ANY(v_seen) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate reconciliation event'; END IF; v_seen:=array_append(v_seen,v_event);
   SELECT * INTO event_row FROM public.commission_events WHERE id=v_event AND organization_id=v_org AND signed_at>=v_start AND signed_at<v_end FOR SHARE; IF NOT FOUND OR event_row.state IN ('pending_review','disputed') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Reconciliation event denied'; END IF;
   SELECT coalesce(sum(i.amount_minor_units),0) INTO v_invoiced FROM public.finance_invoices i WHERE i.organization_id=v_org AND i.commission_event_id=v_event AND i.status IN ('ready','issued');
   SELECT coalesce(sum(p.amount_minor_units),0) INTO v_received FROM public.commission_payments p WHERE p.organization_id=v_org AND p.commission_event_id=v_event AND p.state='received';
   v_earned:=event_row.commission_amount_minor_units; v_balance:=v_invoiced-v_received; IF row_item->>'currency'<>event_row.currency OR (row_item->>'earnedMinorUnits')::bigint<>v_earned OR (row_item->>'invoicedMinorUnits')::bigint<>v_invoiced OR (row_item->>'receivedMinorUnits')::bigint<>v_received OR (row_item->>'balanceMinorUnits')::bigint<>v_balance THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Reconciliation does not match source events'; END IF;
 END LOOP;
 INSERT INTO public.finance_reconciliation_reports(id,organization_id,period_start,period_end,report_rows,created_by_identity_id) VALUES(v_id,v_org,v_start,v_end,payload->'reportRows',v_actor) RETURNING * INTO report;
 PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r7.reconciliation','reconciliation.record','finance_reconciliation_report',report.id,v_org,'Record finance reconciliation',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),context.authorization_time);
 RETURN jsonb_build_object('reportId',report.id,'organizationId',report.organization_id,'rowCount',v_rows,'outcomeCode','recorded','correlationId',correlation_id);
END; $$;
REVOKE ALL ON FUNCTION public.mmhr_record_finance_reconciliation(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker; GRANT EXECUTE ON FUNCTION public.mmhr_record_finance_reconciliation(jsonb,uuid,uuid) TO authenticated;
