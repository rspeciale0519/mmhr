-- Forward: rehearse this additive correction before exposing intake editing.
-- Recovery: revoke the public save RPC, retain intake/history/audit records,
-- and deploy a forward correction. Never restore unrestricted lifecycle edits.
-- Preserve the existing AAL2 command boundary pending customer-action review.
CREATE FUNCTION mmhr_private.r3_intake_data_is_valid(value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE field record; item record; element jsonb; count_limit integer;
BEGIN
  IF value IS NULL OR jsonb_typeof(value) <> 'object' OR pg_column_size(value) > 100000 THEN
    RETURN false;
  END IF;
  FOR field IN SELECT * FROM jsonb_each(value) LOOP
    IF field.key IN ('companyContext','budget','timeline','decisionProcess') THEN
      IF jsonb_typeof(field.value) <> 'object' THEN RETURN false; END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(field.value)) > 50 THEN RETURN false; END IF;
      FOR item IN SELECT * FROM jsonb_each(field.value) LOOP
        IF length(btrim(item.key)) NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
        IF jsonb_typeof(item.value) NOT IN ('string','number','boolean') THEN RETURN false; END IF;
        IF jsonb_typeof(item.value) = 'string' AND length(item.value #>> '{}') > 2000 THEN RETURN false; END IF;
        IF jsonb_typeof(item.value) = 'number' AND abs((item.value #>> '{}')::numeric) > 1.7976931348623157e308 THEN
          RETURN false;
        END IF;
      END LOOP;
    ELSIF field.key IN ('currentSystems','complianceNeeds','stakeholders') THEN
      IF jsonb_typeof(field.value) <> 'array' THEN RETURN false; END IF;
      count_limit := CASE WHEN field.key='stakeholders' THEN 100 ELSE 50 END;
      IF jsonb_array_length(field.value) > count_limit THEN RETURN false; END IF;
      FOR element IN SELECT * FROM jsonb_array_elements(field.value) LOOP
        IF jsonb_typeof(element) <> 'string' OR length(btrim(element #>> '{}')) NOT BETWEEN 1 AND 200 THEN
          RETURN false;
        END IF;
      END LOOP;
    ELSE
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION mmhr_private.r3_intake_data_is_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint

-- Keep the proven history/audit writer intact behind a closed private boundary.
ALTER FUNCTION public.mmhr_save_intake(jsonb,uuid,uuid) SET SCHEMA mmhr_private;
ALTER FUNCTION mmhr_private.mmhr_save_intake(jsonb,uuid,uuid) RENAME TO r3_save_intake_impl;
REVOKE ALL ON FUNCTION mmhr_private.r3_save_intake_impl(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint

CREATE FUNCTION public.mmhr_save_intake(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; intake public.intakes%ROWTYPE; receipt jsonb;
  v_organization_id uuid; v_intake_id uuid; requested_status text; expected_revision integer;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid intake input';
  END IF;
  IF correlation_id IS NULL OR idempotency_key IS NULL
    OR NOT (payload ?& ARRAY['intakeId','organizationId','actorIdentityId','expectedRevision','status','data'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS k(key)
      WHERE k.key NOT IN ('intakeId','organizationId','actorIdentityId','expectedRevision','status','data','correlationId','idempotencyKey'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR (jsonb_typeof(payload->'intakeId') <> 'null' AND
      coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$')
    OR jsonb_typeof(payload->'expectedRevision') <> 'number'
    OR coalesce(payload->>'expectedRevision','') !~ '^[0-9]{1,10}$'
    OR coalesce(payload->>'status','') NOT IN ('draft','in_progress','submitted')
    OR NOT mmhr_private.r3_intake_data_is_valid(payload->'data')
    OR (payload ? 'correlationId' AND lower(payload->>'correlationId') IS DISTINCT FROM correlation_id::text)
    OR (payload ? 'idempotencyKey' AND lower(payload->>'idempotencyKey') IS DISTINCT FROM idempotency_key::text)
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid intake input'; END IF;
  IF (payload->>'expectedRevision')::numeric > 2147483646 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid intake input';
  END IF;
  v_organization_id := (payload->>'organizationId')::uuid;
  v_intake_id := (payload->>'intakeId')::uuid;
  expected_revision := (payload->>'expectedRevision')::integer;
  requested_status := payload->>'status';
  IF (v_intake_id IS NULL AND (expected_revision<>0 OR requested_status='submitted'))
    OR (v_intake_id IS NOT NULL AND expected_revision=0) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid intake input';
  END IF;

  -- Serialize checks with the existing audited writer. No access rule is relaxed.
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access',v_organization_id,'Save intake',correlation_id,idempotency_key);
  IF (payload->>'actorIdentityId')::uuid IS DISTINCT FROM context.actor_identity_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied';
  END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'r3.intake.save',idempotency_key,payload);
  -- A retry remains valid after a later transition, but cannot perform another write.
  IF receipt IS NULL AND v_intake_id IS NOT NULL THEN
    SELECT i.* INTO intake FROM public.intakes i
      WHERE i.id=v_intake_id AND i.organization_id=v_organization_id FOR UPDATE;
    IF NOT FOUND OR intake.revision<>expected_revision
      OR intake.status NOT IN ('draft','in_progress')
      OR (intake.status='in_progress' AND requested_status='draft') THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Intake revision denied';
    END IF;
    IF requested_status='submitted' AND NOT EXISTS (
      SELECT 1 FROM public.intake_requirements r
      WHERE r.intake_id=intake.id AND r.organization_id=intake.organization_id
        AND r.status='active' AND r.importance IN ('must','nice')
    ) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Intake needs an applicable requirement'; END IF;
  END IF;
  RETURN mmhr_private.r3_save_intake_impl(payload,correlation_id,idempotency_key);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_save_intake(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_save_intake(jsonb,uuid,uuid) TO authenticated;
