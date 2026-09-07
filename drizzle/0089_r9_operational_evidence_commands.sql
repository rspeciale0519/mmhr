-- R9 audited persistence commands for redacted availability and performance evidence.
-- Raw operational payloads never enter audit summaries.

CREATE OR REPLACE FUNCTION public.mmhr_record_operational_evidence(
  payload jsonb,
  correlation_id uuid,
  idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  receipt jsonb;
  v_kind text;
  v_id uuid;
  v_org uuid;
  v_actor uuid;
  v_status jsonb;
BEGIN
  IF jsonb_typeof(payload) <> 'object'
    OR correlation_id IS NULL
    OR idempotency_key IS NULL
    OR coalesce(payload->>'kind', '') NOT IN ('availability', 'performance')
    OR coalesce(payload->>'organizationId', '') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId', '') !~ '^[0-9a-fA-F-]{36}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid operational evidence input';
  END IF;

  v_kind := payload->>'kind';
  v_org := (payload->>'organizationId')::uuid;
  v_actor := (payload->>'actorIdentityId')::uuid;
  v_id := CASE WHEN v_kind = 'availability'
    THEN (payload->>'observationId')::uuid
    ELSE (payload->>'measurementId')::uuid END;

  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', v_org, 'Record operational evidence', correlation_id, idempotency_key
  );
  IF context.actor_identity_id <> v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;

  receipt := mmhr_private.r1_checked_receipt(
    context.actor_identity_id, 'r9.operational.evidence', idempotency_key, payload
  );
  IF receipt IS NOT NULL THEN
    IF v_kind = 'availability' THEN
      SELECT jsonb_build_object(
        'evidenceId', id, 'organizationId', organization_id,
        'kind', 'availability', 'outcomeCode', 'replayed', 'correlationId', correlation_id
      ) INTO v_status
      FROM public.availability_observations
      WHERE id = v_id AND organization_id = v_org;
    ELSE
      SELECT jsonb_build_object(
        'evidenceId', id, 'organizationId', organization_id,
        'kind', 'performance', 'outcomeCode', 'replayed', 'correlationId', correlation_id
      ) INTO v_status
      FROM public.performance_measurements
      WHERE id = v_id AND organization_id = v_org;
    END IF;
    IF v_status IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Operational evidence replay denied';
    END IF;
    RETURN v_status;
  END IF;

  IF v_kind = 'availability' THEN
    IF coalesce(payload->>'observationId', '') !~ '^[0-9a-fA-F-]{36}$'
      OR coalesce(payload->>'serviceId', '') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$'
      OR coalesce(payload->>'observedAt', '') = ''
      OR coalesce(payload->>'durationSeconds', '') !~ '^[1-9][0-9]{0,4}$'
      OR (payload->>'durationSeconds')::integer > 86400
      OR payload->>'outcome' NOT IN ('available', 'unavailable')
      OR payload->>'maintenance' NOT IN ('true', 'false')
      OR payload->>'source' NOT IN ('synthetic', 'user')
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid availability evidence';
    END IF;
    INSERT INTO public.availability_observations (
      id, organization_id, service_id, observed_at, duration_seconds, outcome, maintenance, source
    ) VALUES (
      v_id, v_org, btrim(payload->>'serviceId'), (payload->>'observedAt')::timestamptz,
      (payload->>'durationSeconds')::integer, payload->>'outcome',
      (payload->>'maintenance')::boolean, payload->>'source'
    );
  ELSE
    IF coalesce(payload->>'measurementId', '') !~ '^[0-9a-fA-F-]{36}$'
      OR coalesce(payload->>'route', '') !~ '^/(|[a-z0-9][a-z0-9/_-]*)$'
      OR coalesce(payload->>'measuredAt', '') = ''
      OR coalesce(payload->>'sampleCount', '') !~ '^[1-9][0-9]{0,5}$'
      OR (payload->>'sampleCount')::integer > 100000
      OR coalesce(payload->>'lcpP75Ms', '') !~ '^[0-9]+$'
      OR coalesce(payload->>'inpP75Ms', '') !~ '^[0-9]+$'
      OR (payload->>'lcpP75Ms')::integer > 60000
      OR (payload->>'inpP75Ms')::integer > 60000
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid performance evidence';
    END IF;
    INSERT INTO public.performance_measurements (
      id, organization_id, route, measured_at, sample_count, lcp_p75_ms, inp_p75_ms
    ) VALUES (
      v_id, v_org, payload->>'route', (payload->>'measuredAt')::timestamptz,
      (payload->>'sampleCount')::integer, (payload->>'lcpP75Ms')::integer,
      (payload->>'inpP75Ms')::integer
    );
  END IF;

  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'r9.operational.evidence', 'operational.evidence.' || v_kind,
    CASE WHEN v_kind = 'availability' THEN 'availability_observation' ELSE 'performance_measurement' END,
    v_id, v_org, 'Record operational evidence', correlation_id, idempotency_key,
    payload,
    jsonb_build_object('state', 'active', 'version', 1),
    jsonb_build_object('state', 'active', 'version', 1), context.authorization_time
  );
  RETURN jsonb_build_object(
    'evidenceId', v_id, 'organizationId', v_org, 'kind', v_kind,
    'outcomeCode', 'recorded', 'correlationId', correlation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mmhr_record_operational_evidence(jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_operational_evidence(jsonb, uuid, uuid)
  TO authenticated;
