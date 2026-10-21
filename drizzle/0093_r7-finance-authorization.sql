-- R7 finance authority correction.
-- Forward: add an internal-only organization permission, activate Super Admin
-- version three, and replace only the seven finance command permission checks.
-- Recovery: revoke EXECUTE on these seven public RPCs to stop finance writes.
-- Do not restore workspace-only authorization. Preserve all data and role
-- versions; use a reviewed forward correction if activation fails.
SELECT mmhr_private.r1_lock_security();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mmhr_private.r1_permission_registry()
RETURNS TABLE (
  key text, kind text, description text, platform_scope boolean,
  organization_scope boolean, minimum_assurance text,
  internal_only boolean, required_portal text
)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  VALUES
    ('workspace.access', 'feature', 'Access an authorized workspace.', true, true, 'aal1', false, NULL),
    ('admin.access', 'feature', 'Access the internal administration workspace.', true, false, 'aal2', true, NULL),
    ('portal.customer.access', 'feature', 'Access an authorized customer portal.', false, true, 'aal1', false, 'customer'),
    ('portal.vendor.access', 'feature', 'Access an authorized vendor portal.', false, true, 'aal1', false, 'vendor'),
    ('org.members.view', 'action', 'Read authorized organization members.', false, true, 'aal2', false, NULL),
    ('org.members.invite', 'action', 'Invite members to an authorized organization.', false, true, 'aal2', false, NULL),
    ('org.members.change_role', 'action', 'Change an authorized organization membership role.', false, true, 'aal2', false, NULL),
    ('org.members.revoke', 'action', 'Revoke an authorized organization membership.', false, true, 'aal2', false, NULL),
    ('org.members.status.change', 'action', 'Activate or suspend an authorized organization membership.', false, true, 'aal2', false, NULL),
    ('identity.status.change', 'action', 'Change identity status through an audited command.', true, false, 'aal2', true, NULL),
    ('identity.relink', 'action', 'Request an approved two-person identity relink.', true, false, 'aal2', true, NULL),
    ('identity.recovery.request', 'action', 'Request approved identity recovery.', true, false, 'aal2', true, NULL),
    ('identity.recovery.approve', 'action', 'Approve identity recovery within the named recovery pair.', true, false, 'aal2', true, NULL),
    ('org.status.change', 'action', 'Change organization status through an audited command.', true, false, 'aal2', true, NULL),
    ('org.type.change', 'action', 'Change organization type through an audited command.', true, false, 'aal2', true, NULL),
    ('platform_roles.assign', 'action', 'Assign an authorized platform role.', true, false, 'aal2', true, NULL),
    ('platform_roles.revoke', 'action', 'Revoke an authorized platform role.', true, false, 'aal2', true, NULL),
    ('role_versions.activate', 'action', 'Activate an approved role version.', true, false, 'aal2', true, NULL),
    ('permissions.view', 'action', 'Read permissions within the active delegation ceiling.', true, true, 'aal2', false, NULL),
    ('permissions.grant', 'action', 'Grant permissions within the active delegation ceiling.', true, true, 'aal2', false, NULL),
    ('permissions.revoke', 'action', 'Revoke permissions within the active delegation ceiling.', true, true, 'aal2', false, NULL),
    ('permissions.delegate', 'action', 'Delegate permissions within the active delegation ceiling.', true, true, 'aal2', true, NULL),
    ('portal.access.grant', 'action', 'Grant access to an authorized organization portal.', false, true, 'aal2', true, NULL),
    ('portal.access.revoke', 'action', 'Revoke access to an authorized organization portal.', false, true, 'aal2', true, NULL),
    ('audit.view', 'action', 'Read authorized audit event metadata.', true, true, 'aal2', false, NULL),
    ('audit.export', 'action', 'Export authorized audit events through an audited command.', true, true, 'aal2', false, NULL),
    ('org.name.read', 'field', 'Read an authorized organization name.', false, true, 'aal1', false, NULL),
    ('member.role.read', 'field', 'Read an authorized membership role.', false, true, 'aal1', false, NULL),
    ('member.role.update', 'field', 'Update an authorized membership role field.', false, true, 'aal2', false, NULL),
    ('audit.change_summary.read', 'field', 'Read an authorized redacted audit change summary.', true, true, 'aal2', false, NULL),
    ('finance.manage', 'action', 'Manage authorized organization finance records.', false, true, 'aal2', true, NULL)
$$;
--> statement-breakpoint
SELECT mmhr_private.r1_sync_permission_registry();
--> statement-breakpoint
DO $$
BEGIN
  IF (SELECT count(*) FROM public.role_definitions
      WHERE stable_key = 'super_admin' AND version = 2 AND state = 'active') <> 1
    OR EXISTS (SELECT 1 FROM public.role_definitions WHERE stable_key = 'super_admin' AND version = 3)
    OR (SELECT count(*) FROM public.role_authority_records authority
        JOIN public.role_definitions role_version ON role_version.id = authority.role_definition_id
        WHERE role_version.stable_key = 'super_admin' AND role_version.version = 2
          AND authority.record_kind = 'role_activation') <> 1
  THEN RAISE EXCEPTION 'Finance permission role version requires review'; END IF;
END $$;
--> statement-breakpoint
INSERT INTO public.role_definitions (stable_key, version, kind, display_name, description)
SELECT stable_key, 3, kind, display_name, description FROM public.role_definitions
WHERE stable_key = 'super_admin' AND version = 2 AND state = 'active';
--> statement-breakpoint
INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
SELECT next_role.id, prior_default.permission_key, prior_default.effect
FROM public.role_definitions prior_role
JOIN public.role_permission_defaults prior_default ON prior_default.role_definition_id = prior_role.id
JOIN public.role_definitions next_role ON next_role.stable_key = prior_role.stable_key AND next_role.version = 3
WHERE prior_role.stable_key = 'super_admin' AND prior_role.version = 2 AND prior_role.state = 'active';
--> statement-breakpoint
INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
SELECT id, 'finance.manage', 'allow' FROM public.role_definitions
WHERE stable_key = 'super_admin' AND version = 3 AND state = 'draft';
--> statement-breakpoint
UPDATE public.role_definitions SET state = 'approved', approved_at = now(), updated_at = now()
WHERE stable_key = 'super_admin' AND version = 3 AND state = 'draft';
--> statement-breakpoint
INSERT INTO public.audit_events (
  actor_type, actor_reference, command, action, entity_type, entity_id,
  reason, correlation_id, before_summary, after_summary
)
SELECT 'migration', 'r7-finance-authorization', 'role_versions.replace',
  'role_version.deactivate', 'role_definition', id::text,
  'Preserve prior role defaults before adding finance authority', gen_random_uuid(),
  jsonb_build_object('stable_key', stable_key, 'version', 2, 'state', 'active'),
  jsonb_build_object('stable_key', stable_key, 'version', 2, 'state', 'approved')
FROM public.role_definitions WHERE stable_key = 'super_admin' AND version = 2 AND state = 'active';
--> statement-breakpoint
UPDATE public.role_definitions SET state = 'approved', activated_at = NULL, updated_at = now()
WHERE stable_key = 'super_admin' AND version = 2 AND state = 'active';
--> statement-breakpoint
UPDATE public.role_definitions SET state = 'active', activated_at = now(), updated_at = now()
WHERE stable_key = 'super_admin' AND version = 3 AND state = 'approved';
--> statement-breakpoint
INSERT INTO public.audit_events (
  actor_type, actor_reference, command, action, entity_type, entity_id,
  reason, correlation_id, before_summary, after_summary
)
SELECT 'migration', 'r7-finance-authorization', 'role_versions.replace',
  'role_version.activate', 'role_definition', id::text,
  'Require explicit internal finance authority', gen_random_uuid(),
  jsonb_build_object('stable_key', stable_key, 'version', 3, 'state', 'approved'),
  jsonb_build_object('stable_key', stable_key, 'version', 3, 'state', 'active')
FROM public.role_definitions WHERE stable_key = 'super_admin' AND version = 3 AND state = 'active';

--> statement-breakpoint
-- The evaluator requires immutable activation authority, not only a role label.
-- Keep the preceding version's authority so existing grants retain provenance.
INSERT INTO public.role_authority_records (
  record_kind, authority_kind, role_definition_id, previous_authority_id,
  activated_at, correlation_id, created_at
)
SELECT 'role_activation', 'reviewed_owner', next_role.id, prior_authority.id,
  next_role.activated_at, activation.correlation_id, next_role.activated_at
FROM public.role_definitions next_role
JOIN public.role_definitions prior_role
  ON prior_role.stable_key = next_role.stable_key AND prior_role.version = 2
JOIN public.role_authority_records prior_authority
  ON prior_authority.role_definition_id = prior_role.id
  AND prior_authority.record_kind = 'role_activation'
JOIN public.audit_events activation
  ON activation.entity_type = 'role_definition'
  AND activation.entity_id = next_role.id::text
  AND activation.action = 'role_version.activate'
  AND activation.actor_reference = 'r7-finance-authorization'
WHERE next_role.stable_key = 'super_admin' AND next_role.version = 3
  AND next_role.state = 'active';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_record_commission(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; structure public.commission_structures%ROWTYPE; event_row public.commission_events%ROWTYPE; v_action text; v_org uuid; v_actor uuid; v_id uuid; v_vendor uuid; v_deal uuid; v_type text; v_rate integer; v_flat bigint; v_currency text; v_value bigint; v_amount bigint;
BEGIN
 IF jsonb_typeof(payload)<>'object' OR coalesce(payload->>'action','') NOT IN ('create_structure','create_event') OR correlation_id IS NULL OR idempotency_key IS NULL OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid commission input'; END IF;
 v_action:=payload->>'action'; v_org:=(payload->>'organizationId')::uuid; v_actor:=(payload->>'actorIdentityId')::uuid; SELECT * INTO context FROM mmhr_private.r1_start_security_command('finance.manage',v_org,'Record commission',correlation_id,idempotency_key); IF v_actor<>context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF;
 receipt:=mmhr_private.r1_checked_receipt(context.actor_identity_id,'r7.commission',idempotency_key,payload); IF receipt IS NOT NULL THEN RETURN jsonb_build_object('entityId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id); END IF;
 IF v_action='create_structure' THEN
   IF coalesce(payload->>'structureId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'vendorOrganizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'sourceAgreementId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce((payload->>'revision')::integer,0)<1 OR payload->>'currency' !~ '^[A-Z]{3}$' OR payload->>'calculationType' NOT IN ('contract_value_rate','flat_amount') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid commission structure'; END IF;
   v_id:=(payload->>'structureId')::uuid; v_vendor:=(payload->>'vendorOrganizationId')::uuid; v_type:=payload->>'calculationType'; v_rate=(payload->>'rateBasisPoints')::integer; v_flat=(payload->>'flatAmountMinorUnits')::bigint; IF v_vendor=v_org OR (v_type='contract_value_rate' AND (v_rate IS NULL OR v_rate NOT BETWEEN 0 AND 10000 OR v_flat IS NOT NULL)) OR (v_type='flat_amount' AND (v_flat IS NULL OR v_flat<0 OR v_rate IS NOT NULL)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid commission structure'; END IF;
   INSERT INTO public.commission_structures(id,organization_id,vendor_organization_id,effective_from,effective_to,calculation_type,rate_basis_points,flat_amount_minor_units,currency,source_agreement_id,revision,created_by_identity_id) VALUES(v_id,v_org,v_vendor,(payload->>'effectiveFrom')::timestamptz,CASE WHEN payload->>'effectiveTo' IS NULL THEN NULL ELSE (payload->>'effectiveTo')::timestamptz END,v_type,v_rate,v_flat,payload->>'currency',(payload->>'sourceAgreementId')::uuid,(payload->>'revision')::integer,v_actor) RETURNING * INTO structure;
 ELSE
   IF coalesce(payload->>'eventId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'contractId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'dealId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'vendorOrganizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'structureId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'eventIdempotencyKey','') !~ '^[0-9a-fA-F-]{36}$' OR payload->>'currency' !~ '^[A-Z]{3}$' OR coalesce((payload->>'contractValueMinorUnits')::bigint,-1)<0 OR coalesce((payload->>'commissionAmountMinorUnits')::bigint,-1)<0 OR coalesce((payload->>'calculationRevision')::integer,0)<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid commission event'; END IF;
   v_id:=(payload->>'eventId')::uuid; v_deal:=(payload->>'dealId')::uuid; v_vendor:=(payload->>'vendorOrganizationId')::uuid; SELECT * INTO structure FROM public.commission_structures s WHERE s.id=(payload->>'structureId')::uuid AND s.organization_id=v_org AND s.vendor_organization_id=v_vendor AND s.currency=payload->>'currency' AND s.effective_from <= (payload->>'signedAt')::timestamptz AND (s.effective_to IS NULL OR (payload->>'signedAt')::timestamptz <= s.effective_to); IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.deals d WHERE d.id=v_deal AND d.organization_id=v_org AND d.vendor_organization_id=v_vendor) OR (payload->>'calculationRevision')::integer <> structure.revision THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Commission scope denied'; END IF; v_value:=(payload->>'contractValueMinorUnits')::bigint; v_amount:=(payload->>'commissionAmountMinorUnits')::bigint; IF (structure.calculation_type='contract_value_rate' AND v_amount <> floor(v_value * structure.rate_basis_points / 10000.0)) OR (structure.calculation_type='flat_amount' AND v_amount <> structure.flat_amount_minor_units) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Commission calculation mismatch'; END IF;
   INSERT INTO public.commission_events(id,organization_id,contract_id,deal_id,vendor_organization_id,structure_id,idempotency_key,signed_at,currency,contract_value_minor_units,commission_amount_minor_units,calculation_revision,state) VALUES(v_id,v_org,(payload->>'contractId')::uuid,v_deal,v_vendor,(payload->>'structureId')::uuid,(payload->>'eventIdempotencyKey')::uuid,(payload->>'signedAt')::timestamptz,payload->>'currency',(payload->>'contractValueMinorUnits')::bigint,(payload->>'commissionAmountMinorUnits')::bigint,(payload->>'calculationRevision')::integer,'pending_review') RETURNING * INTO event_row;
 END IF;
 PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r7.commission','commission.'||v_action,CASE WHEN v_action='create_structure' THEN 'commission_structure' ELSE 'commission_event' END,CASE WHEN v_action='create_structure' THEN structure.id ELSE event_row.id END,v_org,'Record commission',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),context.authorization_time);
 RETURN jsonb_build_object('entityId',CASE WHEN v_action='create_structure' THEN structure.id ELSE event_row.id END,'organizationId',v_org,'status',CASE WHEN v_action='create_structure' THEN 'active' ELSE event_row.state END,'outcomeCode','recorded','correlationId',correlation_id);
END; $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_record_commission(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_record_commission(jsonb, uuid, uuid) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_record_commission_payment(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; payment public.commission_payments%ROWTYPE; event_row public.commission_events%ROWTYPE; v_org uuid; v_actor uuid; v_payment uuid; v_event uuid; v_amount bigint; v_received bigint;
BEGIN
 IF jsonb_typeof(payload)<>'object' OR coalesce(payload->>'paymentId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'commissionEventId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce((payload->>'amountMinorUnits')::bigint,0)<=0 OR payload->>'state' NOT IN ('received','reversed') OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid payment input'; END IF;
 v_org:=(payload->>'organizationId')::uuid; v_actor:=(payload->>'actorIdentityId')::uuid; v_payment:=(payload->>'paymentId')::uuid; v_event:=(payload->>'commissionEventId')::uuid; v_amount:=(payload->>'amountMinorUnits')::bigint; SELECT * INTO context FROM mmhr_private.r1_start_security_command('finance.manage',v_org,'Record commission payment',correlation_id,idempotency_key); IF v_actor<>context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF;
 receipt:=mmhr_private.r1_checked_receipt(context.actor_identity_id,'r7.payment',idempotency_key,payload); IF receipt IS NOT NULL THEN RETURN jsonb_build_object('paymentId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id); END IF;
 SELECT * INTO event_row FROM public.commission_events WHERE id=v_event AND organization_id=v_org FOR UPDATE; IF NOT FOUND OR event_row.state IN ('voided','written_off') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Payment event denied'; END IF;
 IF payload->>'state'='received' THEN SELECT coalesce(sum(amount_minor_units),0) INTO v_received FROM public.commission_payments WHERE organization_id=v_org AND commission_event_id=v_event AND state='received'; IF v_received + v_amount > event_row.commission_amount_minor_units THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Payment exceeds commission balance'; END IF; END IF;
 INSERT INTO public.commission_payments(id,organization_id,commission_event_id,amount_minor_units,received_at,state,external_reference,recorded_by_identity_id) VALUES(v_payment,v_org,v_event,v_amount,(payload->>'receivedAt')::timestamptz,payload->>'state',NULL,v_actor) RETURNING * INTO payment;
 IF payload->>'state'='received' THEN v_received:=v_received+v_amount; UPDATE public.commission_events SET state=CASE WHEN v_received=commission_amount_minor_units THEN 'paid' ELSE 'partially_paid' END WHERE id=v_event AND organization_id=v_org RETURNING * INTO event_row; END IF;
 PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r7.payment','payment.record','commission_payment',payment.id,v_org,'Record commission payment',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),context.authorization_time);
 RETURN jsonb_build_object('paymentId',payment.id,'commissionEventId',v_event,'organizationId',v_org,'eventState',event_row.state,'outcomeCode','recorded','correlationId',correlation_id);
END; $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_record_commission_payment(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_record_commission_payment(jsonb, uuid, uuid) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_record_invoice(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; invoice public.finance_invoices%ROWTYPE; event_row public.commission_events%ROWTYPE; v_org uuid; v_actor uuid; v_id uuid; v_event uuid; v_action text; v_status text; v_number text; v_issue timestamptz; v_due timestamptz;
BEGIN
 IF jsonb_typeof(payload)<>'object' OR coalesce(payload->>'action','') NOT IN ('create','issue','void') OR coalesce(payload->>'invoiceId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid invoice input'; END IF;
 v_action:=payload->>'action'; v_org:=(payload->>'organizationId')::uuid; v_actor:=(payload->>'actorIdentityId')::uuid; v_id:=(payload->>'invoiceId')::uuid; SELECT * INTO context FROM mmhr_private.r1_start_security_command('finance.manage',v_org,'Record invoice',correlation_id,idempotency_key); IF v_actor<>context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF; receipt:=mmhr_private.r1_checked_receipt(context.actor_identity_id,'r7.invoice',idempotency_key,payload); IF receipt IS NOT NULL THEN RETURN jsonb_build_object('invoiceId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id); END IF;
 IF v_action='create' THEN
   IF coalesce(payload->>'commissionEventId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'vendorOrganizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'createdByIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR payload->>'currency' !~ '^[A-Z]{3}$' OR coalesce((payload->>'amountMinorUnits')::bigint,-1)<0 OR jsonb_typeof(payload->'supportingDocumentReferences')<>'array' OR jsonb_array_length(payload->'supportingDocumentReferences')>50 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid invoice create'; END IF;
   v_event:=(payload->>'commissionEventId')::uuid; IF NOT EXISTS(SELECT 1 FROM public.commission_events e WHERE e.id=v_event AND e.organization_id=v_org AND e.vendor_organization_id=(payload->>'vendorOrganizationId')::uuid AND e.currency=payload->>'currency' AND e.state IN ('approved','invoiced','partially_paid','paid')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Invoice event denied'; END IF;
   INSERT INTO public.finance_invoices(id,organization_id,commission_event_id,vendor_organization_id,currency,amount_minor_units,status,supporting_document_references,created_by_identity_id) VALUES(v_id,v_org,v_event,(payload->>'vendorOrganizationId')::uuid,payload->>'currency',(payload->>'amountMinorUnits')::bigint,'draft',payload->'supportingDocumentReferences',v_actor) RETURNING * INTO invoice;
 ELSE
   SELECT * INTO invoice FROM public.finance_invoices WHERE id=v_id AND organization_id=v_org FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Invoice association denied'; END IF;
   IF v_action='issue' THEN v_number:=btrim(payload->>'invoiceNumber'); v_issue:=(payload->>'issueDate')::timestamptz; v_due:=(payload->>'dueDate')::timestamptz; IF invoice.status NOT IN ('draft','ready') OR length(v_number) NOT BETWEEN 1 AND 500 OR v_issue IS NULL OR v_due IS NULL OR v_due<v_issue THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid invoice issue'; END IF; UPDATE public.finance_invoices SET status='issued',invoice_number=v_number,issue_date=v_issue,due_date=v_due WHERE id=v_id AND organization_id=v_org RETURNING * INTO invoice;
   ELSE
     IF invoice.status NOT IN ('draft','ready','issued') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Invoice void denied'; END IF;
     UPDATE public.finance_invoices SET status='voided' WHERE id=v_id AND organization_id=v_org RETURNING * INTO invoice;
  END IF;
 END IF;
 PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r7.invoice','invoice.'||v_action,'finance_invoice',invoice.id,v_org,'Record invoice',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),context.authorization_time);
 RETURN jsonb_build_object('invoiceId',invoice.id,'organizationId',invoice.organization_id,'status',invoice.status,'outcomeCode','recorded','correlationId',correlation_id);
END; $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_record_invoice(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_record_invoice(jsonb, uuid, uuid) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_record_commission_dispute(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; dispute public.finance_disputes%ROWTYPE; event_row public.commission_events%ROWTYPE; v_org uuid; v_actor uuid; v_action text; v_id uuid; v_event uuid; v_status text; v_reason text;
BEGIN
 IF jsonb_typeof(payload)<>'object' OR coalesce(payload->>'action','') NOT IN ('open','resolve','reject') OR coalesce(payload->>'disputeId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid dispute input'; END IF;
 v_action:=payload->>'action'; v_org:=(payload->>'organizationId')::uuid; v_actor:=(payload->>'actorIdentityId')::uuid; v_id:=(payload->>'disputeId')::uuid; SELECT * INTO context FROM mmhr_private.r1_start_security_command('finance.manage',v_org,'Record commission dispute',correlation_id,idempotency_key); IF v_actor<>context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF; receipt:=mmhr_private.r1_checked_receipt(context.actor_identity_id,'r7.dispute',idempotency_key,payload); IF receipt IS NOT NULL THEN RETURN jsonb_build_object('disputeId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id); END IF;
 IF v_action='open' THEN
   IF coalesce(payload->>'commissionEventId','') !~ '^[0-9a-fA-F-]{36}$' OR payload->>'reasonCode' NOT IN ('amount','eligibility','duplicate','payment','other') OR length(btrim(coalesce(payload->>'reason',''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid dispute open'; END IF; v_event:=(payload->>'commissionEventId')::uuid; SELECT * INTO event_row FROM public.commission_events WHERE id=v_event AND organization_id=v_org FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Dispute event denied'; END IF; INSERT INTO public.finance_disputes(id,organization_id,commission_event_id,opened_by_identity_id,opened_at,reason_code,reason,status) VALUES(v_id,v_org,v_event,v_actor,(payload->>'openedAt')::timestamptz,payload->>'reasonCode',btrim(payload->>'reason'),'open') RETURNING * INTO dispute; UPDATE public.commission_events SET state='disputed' WHERE id=v_event AND organization_id=v_org;
 ELSE
   SELECT * INTO dispute FROM public.finance_disputes WHERE id=v_id AND organization_id=v_org FOR UPDATE; IF NOT FOUND OR dispute.status<>'open' OR length(btrim(coalesce(payload->>'resolution',''))) NOT BETWEEN 1 AND 2000 OR coalesce(payload->>'resolvedByIdentityId','')::uuid<>v_actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Dispute resolution denied'; END IF; v_status:=CASE WHEN v_action='resolve' THEN 'resolved' ELSE 'rejected' END; UPDATE public.finance_disputes SET status=v_status,resolved_by_identity_id=v_actor,resolved_at=(payload->>'resolvedAt')::timestamptz,resolution=btrim(payload->>'resolution') WHERE id=v_id AND organization_id=v_org RETURNING * INTO dispute; UPDATE public.commission_events SET state=CASE WHEN v_action='resolve' THEN 'approved' ELSE 'voided' END WHERE id=dispute.commission_event_id AND organization_id=v_org RETURNING * INTO event_row;
 END IF;
 PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r7.dispute','dispute.'||v_action,'finance_dispute',dispute.id,v_org,'Record commission dispute',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),context.authorization_time);
 RETURN jsonb_build_object('disputeId',dispute.id,'organizationId',dispute.organization_id,'status',dispute.status,'outcomeCode','recorded','correlationId',correlation_id);
END; $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_record_commission_dispute(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_record_commission_dispute(jsonb, uuid, uuid) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_record_finance_adjustment(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; adjustment public.finance_adjustments%ROWTYPE; event_row public.commission_events%ROWTYPE; v_org uuid; v_actor uuid; v_id uuid; v_event uuid; v_amount bigint;
BEGIN
 IF jsonb_typeof(payload)<>'object' OR coalesce(payload->>'adjustmentId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'commissionEventId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR payload->>'direction' NOT IN ('increase','decrease') OR coalesce((payload->>'amountMinorUnits')::bigint,0)<=0 OR length(btrim(coalesce(payload->>'reason',''))) NOT BETWEEN 1 AND 2000 OR coalesce(payload->>'approvedByIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid adjustment input'; END IF;
 v_org:=(payload->>'organizationId')::uuid; v_actor:=(payload->>'actorIdentityId')::uuid; v_id:=(payload->>'adjustmentId')::uuid; v_event:=(payload->>'commissionEventId')::uuid; v_amount:=(payload->>'amountMinorUnits')::bigint;
 SELECT * INTO context FROM mmhr_private.r1_start_security_command('finance.manage',v_org,'Record finance adjustment',correlation_id,idempotency_key); IF v_actor<>context.actor_identity_id OR v_actor<>(payload->>'approvedByIdentityId')::uuid THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF;
 receipt:=mmhr_private.r1_checked_receipt(context.actor_identity_id,'r7.adjustment',idempotency_key,payload); IF receipt IS NOT NULL THEN RETURN jsonb_build_object('adjustmentId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id); END IF;
 SELECT * INTO event_row FROM public.commission_events WHERE id=v_event AND organization_id=v_org FOR UPDATE; IF NOT FOUND OR event_row.state IN ('voided','written_off') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Adjustment event denied'; END IF;
 IF (payload->>'approvedAt')::timestamptz < (payload->>'createdAt')::timestamptz THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Adjustment approval precedes creation'; END IF;
 INSERT INTO public.finance_adjustments(id,organization_id,commission_event_id,direction,amount_minor_units,reason,approved_by_identity_id,approved_at,created_at) VALUES(v_id,v_org,v_event,payload->>'direction',v_amount,btrim(payload->>'reason'),v_actor,(payload->>'approvedAt')::timestamptz,(payload->>'createdAt')::timestamptz) RETURNING * INTO adjustment;
 UPDATE public.commission_events SET state='adjusted' WHERE id=v_event AND organization_id=v_org;
 PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r7.adjustment','adjustment.record','finance_adjustment',adjustment.id,v_org,'Record finance adjustment',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),context.authorization_time);
 RETURN jsonb_build_object('adjustmentId',adjustment.id,'commissionEventId',v_event,'organizationId',v_org,'eventState','adjusted','outcomeCode','recorded','correlationId',correlation_id);
END; $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_record_finance_adjustment(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_record_finance_adjustment(jsonb, uuid, uuid) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_record_finance_handoff(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; handoff public.finance_handoffs%ROWTYPE; v_org uuid; v_actor uuid; v_id uuid; v_events jsonb; v_event_id uuid; v_count integer;
BEGIN
 IF jsonb_typeof(payload)<>'object' OR coalesce(payload->>'handoffId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR length(btrim(coalesce(payload->>'destinationReference',''))) NOT BETWEEN 1 AND 500 OR jsonb_typeof(payload->'sourceEventIds')<>'array' OR jsonb_array_length(payload->'sourceEventIds') NOT BETWEEN 1 AND 10000 OR length(btrim(coalesce(payload->>'reason',''))) NOT BETWEEN 1 AND 2000 OR coalesce(payload->>'approvedByIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid finance handoff input'; END IF;
 v_org:=(payload->>'organizationId')::uuid; v_actor:=(payload->>'actorIdentityId')::uuid; v_id:=(payload->>'handoffId')::uuid; v_events:=payload->'sourceEventIds'; SELECT count(*) INTO v_count FROM jsonb_array_elements_text(v_events); IF v_count<>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(v_events) AS item(value)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate finance handoff event'; END IF;
 SELECT * INTO context FROM mmhr_private.r1_start_security_command('finance.manage',v_org,'Record finance handoff',correlation_id,idempotency_key); IF v_actor<>context.actor_identity_id OR v_actor<>(payload->>'approvedByIdentityId')::uuid THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF;
 receipt:=mmhr_private.r1_checked_receipt(context.actor_identity_id,'r7.handoff',idempotency_key,payload); IF receipt IS NOT NULL THEN RETURN jsonb_build_object('handoffId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id); END IF;
 FOR v_event_id IN SELECT value::uuid FROM jsonb_array_elements_text(v_events) AS item(value) LOOP
   IF NOT EXISTS (SELECT 1 FROM public.commission_events e WHERE e.id=v_event_id AND e.organization_id=v_org AND e.state IN ('paid','voided','written_off') AND NOT EXISTS (SELECT 1 FROM public.finance_disputes d WHERE d.organization_id=v_org AND d.commission_event_id=e.id AND d.status='open')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance handoff event denied'; END IF;
 END LOOP;
 INSERT INTO public.finance_handoffs(id,organization_id,destination_reference,source_event_ids,approved_by_identity_id,approved_at,reason) VALUES(v_id,v_org,btrim(payload->>'destinationReference'),v_events,v_actor,(payload->>'approvedAt')::timestamptz,btrim(payload->>'reason')) RETURNING * INTO handoff;
 PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r7.handoff','handoff.record','finance_handoff',handoff.id,v_org,'Record finance handoff',correlation_id,idempotency_key,payload,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),context.authorization_time);
 RETURN jsonb_build_object('handoffId',handoff.id,'organizationId',handoff.organization_id,'outcomeCode','recorded','correlationId',correlation_id);
END; $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_record_finance_handoff(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_record_finance_handoff(jsonb, uuid, uuid) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mmhr_record_finance_reconciliation(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; report public.finance_reconciliation_reports%ROWTYPE; event_row public.commission_events%ROWTYPE; row_item jsonb; v_org uuid; v_actor uuid; v_id uuid; v_event uuid; v_start timestamptz; v_end timestamptz; v_earned bigint; v_invoiced bigint; v_received bigint; v_balance bigint; v_rows integer; v_seen uuid[] := ARRAY[]::uuid[];
BEGIN
 IF jsonb_typeof(payload)<>'object' OR coalesce(payload->>'reportId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR jsonb_typeof(payload->'reportRows')<>'array' OR jsonb_array_length(payload->'reportRows') NOT BETWEEN 1 AND 10000 OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid reconciliation input'; END IF;
 v_org:=(payload->>'organizationId')::uuid; v_actor:=(payload->>'actorIdentityId')::uuid; v_id:=(payload->>'reportId')::uuid; v_start:=(payload->>'periodStart')::timestamptz; v_end:=(payload->>'periodEnd')::timestamptz; IF v_start IS NULL OR v_end IS NULL OR v_end<=v_start THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid reconciliation period'; END IF;
 SELECT * INTO context FROM mmhr_private.r1_start_security_command('finance.manage',v_org,'Record finance reconciliation',correlation_id,idempotency_key); IF v_actor<>context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF;
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_record_finance_reconciliation(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_record_finance_reconciliation(jsonb, uuid, uuid) TO authenticated;
