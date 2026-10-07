-- Proposed additive fragment. No migration ordinal or activation grant.
-- Apply only in the reviewed migration transaction after receipt 0166 acceptance.
CREATE FUNCTION public.mmhr_search_staff_audit_events_v1(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_org uuid; v_actor uuid; v_type text; v_identity uuid; v_reference text;
  v_from timestamptz; v_to timestamptz; v_after_time timestamptz; v_after_id uuid;
  v_limit integer := 25; v_key text; v_time timestamptz; v_rows jsonb; v_next jsonb := NULL;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR NOT payload ? 'organizationId'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE k <> ALL(ARRAY[
      'organizationId','actor','entityType','entityId','action','occurredFrom','occurredTo','limit','after']))
    OR jsonb_typeof(payload->'organizationId') NOT IN ('null','string')
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Audit search fields are invalid'; END IF;
  IF jsonb_typeof(payload->'organizationId') = 'string' THEN
    IF payload->>'organizationId' !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Audit search fields are invalid'; END IF;
    v_org := (payload->>'organizationId')::uuid;
  END IF;
  v_actor := mmhr_private.r1_request_identity_id();
  IF v_actor IS NULL OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2'
    OR NOT mmhr_private.r1_request_has_permission('admin.access',NULL::uuid)
    OR NOT mmhr_private.r1_request_has_permission('audit.view',v_org)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Audit search is unavailable'; END IF;

  IF payload ? 'limit' THEN
    IF jsonb_typeof(payload->'limit') <> 'number' OR (payload->>'limit') !~ '^[0-9]{1,3}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Audit search fields are invalid'; END IF;
    v_limit := (payload->>'limit')::integer;
    IF v_limit NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Audit search fields are invalid'; END IF;
  END IF;
  FOREACH v_key IN ARRAY ARRAY['entityType','entityId','action'] LOOP
    IF payload ? v_key AND (jsonb_typeof(payload->v_key) <> 'string'
      OR length(payload->>v_key) NOT BETWEEN 1 AND CASE WHEN v_key='entityId' THEN 256 ELSE 100 END
      OR btrim(payload->>v_key) IS DISTINCT FROM payload->>v_key
      OR payload->>v_key ~ '[[:cntrl:]]') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Audit search fields are invalid'; END IF;
  END LOOP;
  IF payload ? 'actor' THEN
    IF jsonb_typeof(payload->'actor') <> 'object' OR jsonb_typeof(payload#>'{actor,type}') IS DISTINCT FROM 'string'
      OR payload#>>'{actor,type}' NOT IN ('user','worker','system','migration')
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload->'actor') k WHERE k <> ALL(ARRAY['type','identityId','reference']))
    THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Audit search fields are invalid'; END IF;
    v_type := payload#>>'{actor,type}';
    IF v_type='user' THEN
      IF payload->'actor' ? 'reference' OR jsonb_typeof(payload#>'{actor,identityId}') IS DISTINCT FROM 'string'
        OR payload#>>'{actor,identityId}' !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Audit search fields are invalid'; END IF;
      v_identity := (payload#>>'{actor,identityId}')::uuid;
    ELSE
      IF payload->'actor' ? 'identityId' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Audit search fields are invalid'; END IF;
      IF payload->'actor' ? 'reference' THEN
        IF jsonb_typeof(payload#>'{actor,reference}') <> 'string'
          OR length(payload#>>'{actor,reference}') NOT BETWEEN 1 AND 500
          OR btrim(payload#>>'{actor,reference}') IS DISTINCT FROM payload#>>'{actor,reference}'
          OR payload#>>'{actor,reference}' ~ '[[:cntrl:]]' THEN
          RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Audit search fields are invalid'; END IF;
        v_reference := payload#>>'{actor,reference}';
      END IF;
    END IF;
  END IF;
  FOREACH v_key IN ARRAY ARRAY['occurredFrom','occurredTo'] LOOP
    IF payload ? v_key THEN
      IF jsonb_typeof(payload->v_key) <> 'string'
        OR payload->>v_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Audit search fields are invalid'; END IF;
      v_time := (payload->>v_key)::timestamptz;
      IF NOT pg_catalog.isfinite(v_time) OR pg_catalog.to_char(v_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') <> payload->>v_key THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Audit search fields are invalid'; END IF;
      IF v_key='occurredFrom' THEN v_from:=v_time; ELSE v_to:=v_time; END IF;
    END IF;
  END LOOP;
  IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_from>v_to THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Audit search fields are invalid'; END IF;
  IF payload ? 'after' THEN
    IF jsonb_typeof(payload->'after') <> 'object' OR NOT payload->'after' ?& ARRAY['occurredAt','id']
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload->'after') k WHERE k <> ALL(ARRAY['occurredAt','id']))
      OR jsonb_typeof(payload#>'{after,occurredAt}') <> 'string' OR jsonb_typeof(payload#>'{after,id}') <> 'string'
      OR payload#>>'{after,occurredAt}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
      OR payload#>>'{after,id}' !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Audit search fields are invalid'; END IF;
    v_after_time := (payload#>>'{after,occurredAt}')::timestamptz; v_after_id := (payload#>>'{after,id}')::uuid;
    IF NOT pg_catalog.isfinite(v_after_time)
      OR pg_catalog.to_char(v_after_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') <> payload#>>'{after,occurredAt}' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Audit search fields are invalid'; END IF;
  END IF;

  WITH eligible AS (
    SELECT e.id,e.action,e.entity_type,e.entity_id,e.occurred_at
    FROM public.audit_events e
    WHERE e.organization_id IS NOT DISTINCT FROM v_org
      AND (v_type IS NULL OR e.actor_type::text=v_type)
      AND (v_identity IS NULL OR e.actor_identity_id=v_identity)
      AND (v_reference IS NULL OR e.actor_reference=v_reference)
      AND (NOT payload ? 'entityType' OR e.entity_type=payload->>'entityType')
      AND (NOT payload ? 'entityId' OR e.entity_id=payload->>'entityId')
      AND (NOT payload ? 'action' OR e.action=payload->>'action')
      AND (v_from IS NULL OR e.occurred_at>=v_from) AND (v_to IS NULL OR e.occurred_at<=v_to)
      AND (v_after_id IS NULL OR e.occurred_at<v_after_time OR e.occurred_at=v_after_time AND e.id>v_after_id)
    ORDER BY e.occurred_at DESC,e.id ASC LIMIT v_limit+1
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'entityType',e.entity_type,
      'entityId',e.entity_id,'occurredAt',pg_catalog.to_char(e.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
      ORDER BY e.occurred_at DESC,e.id ASC),'[]'::jsonb) INTO v_rows FROM eligible e;
  IF jsonb_array_length(v_rows)>v_limit THEN
    v_rows := v_rows-v_limit;
    v_next := jsonb_build_object('id',v_rows->(v_limit-1)->'id','occurredAt',v_rows->(v_limit-1)->'occurredAt');
  END IF;
  RETURN jsonb_build_object('version',1,'organizationId',v_org,'rows',v_rows,'nextCursor',v_next);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_search_staff_audit_events_v1(jsonb)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
-- No GRANT in this inactive fragment. Reviewed deployment must grant only
-- authenticated EXECUTE after genuine direct-call authorization tests pass.
