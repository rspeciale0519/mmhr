-- Add product revision to the existing scoped search for optimistic activation.
-- Existing clients strip additional fields. Preserve this migration on app rollback.
CREATE OR REPLACE FUNCTION public.mmhr_search_crm(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  organization_id uuid;
  resource text;
  query_text text;
  statuses jsonb;
  cursor_id uuid;
  limit_value integer;
  result jsonb;
BEGIN
  IF jsonb_typeof(payload) <> 'object'
    OR coalesce(payload->>'organizationId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'resource', '') NOT IN ('customer','vendor','product','contact','deal','activity')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM search input'; END IF;

  organization_id := (payload->>'organizationId')::uuid;
  resource := payload->>'resource';
  query_text := CASE
    WHEN payload ? 'query' AND jsonb_typeof(payload->'query') <> 'null'
      THEN lower(btrim(payload->>'query')) ELSE NULL END;
  statuses := coalesce(payload->'statuses', '[]'::jsonb);
  limit_value := CASE WHEN payload ? 'limit' THEN (payload->>'limit')::integer ELSE 25 END;
  cursor_id := CASE
    WHEN payload ? 'cursor' AND jsonb_typeof(payload->'cursor') <> 'null'
      THEN (payload->>'cursor')::uuid ELSE NULL END;

  IF (query_text IS NOT NULL AND length(query_text) > 200)
    OR jsonb_typeof(statuses) <> 'array' OR jsonb_array_length(statuses) > 10
    OR limit_value NOT BETWEEN 1 AND 100
    OR (payload ? 'cursor' AND jsonb_typeof(payload->'cursor') <> 'null'
      AND coalesce(payload->>'cursor', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(statuses) AS value
      WHERE value NOT IN ('prospect','active','paused','closed','draft','retired','inactive',
        'lead','discovery','qualified','evaluation','proposal','selected','contracted',
        'selection','contracting','won','lost','archived')
    )
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid CRM search input'; END IF;

  IF NOT mmhr_private.r1_request_has_permission('workspace.access', organization_id)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;

  IF resource = 'customer' THEN
    SELECT coalesce(jsonb_agg(row_data ORDER BY record_id), '[]'::jsonb) INTO result
    FROM (
      SELECT p.id AS record_id, jsonb_build_object(
        'recordId', p.id, 'organizationId', p.organization_id, 'resource', 'customer',
        'label', CASE WHEN mmhr_private.r1_request_has_permission('org.name.read', organization_id)
          THEN o.name ELSE 'Organization' END, 'status', p.status) AS row_data
      FROM public.customer_profiles p JOIN public.orgs o ON o.id = p.organization_id
      WHERE p.organization_id = organization_id AND (cursor_id IS NULL OR p.id > cursor_id)
        AND (jsonb_array_length(statuses) = 0 OR p.status = ANY(ARRAY(SELECT jsonb_array_elements_text(statuses))))
        AND (query_text IS NULL OR lower(o.name) LIKE '%' || query_text || '%')
      ORDER BY p.id LIMIT limit_value
    ) rows;
  ELSIF resource = 'vendor' THEN
    SELECT coalesce(jsonb_agg(row_data ORDER BY record_id), '[]'::jsonb) INTO result
    FROM (
      SELECT p.id AS record_id, jsonb_build_object(
        'recordId', p.id, 'organizationId', p.organization_id, 'resource', 'vendor',
        'label', CASE WHEN mmhr_private.r1_request_has_permission('org.name.read', organization_id)
          THEN o.name ELSE 'Organization' END, 'status', p.status) AS row_data
      FROM public.vendor_profiles p JOIN public.orgs o ON o.id = p.organization_id
      WHERE p.organization_id = organization_id AND (cursor_id IS NULL OR p.id > cursor_id)
        AND (jsonb_array_length(statuses) = 0 OR p.status = ANY(ARRAY(SELECT jsonb_array_elements_text(statuses))))
        AND (query_text IS NULL OR lower(o.name) LIKE '%' || query_text || '%')
      ORDER BY p.id LIMIT limit_value
    ) rows;
  ELSIF resource = 'product' THEN
    SELECT coalesce(jsonb_agg(row_data ORDER BY record_id), '[]'::jsonb) INTO result
    FROM (
      SELECT p.id AS record_id, jsonb_build_object(
        'recordId', p.id, 'organizationId', p.organization_id, 'resource', 'product',
        'label', p.name, 'status', p.status, 'revision', p.revision) AS row_data
      FROM public.products p
      WHERE p.organization_id = organization_id AND (cursor_id IS NULL OR p.id > cursor_id)
        AND (jsonb_array_length(statuses) = 0 OR p.status = ANY(ARRAY(SELECT jsonb_array_elements_text(statuses))))
        AND (query_text IS NULL OR lower(p.name) LIKE '%' || query_text || '%')
      ORDER BY p.id LIMIT limit_value
    ) rows;
  ELSIF resource = 'contact' THEN
    SELECT coalesce(jsonb_agg(row_data ORDER BY record_id), '[]'::jsonb) INTO result
    FROM (
      SELECT p.id AS record_id, jsonb_build_object(
        'recordId', p.id, 'organizationId', p.organization_id, 'resource', 'contact',
        'label', p.full_name, 'status', p.status) AS row_data
      FROM public.contacts p
      WHERE p.organization_id = organization_id AND (cursor_id IS NULL OR p.id > cursor_id)
        AND (jsonb_array_length(statuses) = 0 OR p.status = ANY(ARRAY(SELECT jsonb_array_elements_text(statuses))))
        AND (query_text IS NULL OR lower(p.full_name) LIKE '%' || query_text || '%')
      ORDER BY p.id LIMIT limit_value
    ) rows;
  ELSIF resource = 'deal' THEN
    SELECT coalesce(jsonb_agg(row_data ORDER BY record_id), '[]'::jsonb) INTO result
    FROM (
      SELECT p.id AS record_id, jsonb_build_object(
        'recordId', p.id, 'organizationId', p.organization_id, 'resource', 'deal',
        'label', p.stage, 'status', CASE WHEN p.status = 'open' THEN p.stage ELSE p.status END) AS row_data
      FROM public.deals p
      WHERE p.organization_id = organization_id AND (cursor_id IS NULL OR p.id > cursor_id)
        AND (jsonb_array_length(statuses) = 0 OR (CASE WHEN p.status = 'open' THEN p.stage ELSE p.status END) = ANY(ARRAY(SELECT jsonb_array_elements_text(statuses))))
        AND (query_text IS NULL OR lower(p.stage) LIKE '%' || query_text || '%')
      ORDER BY p.id LIMIT limit_value
    ) rows;
  ELSE
    SELECT coalesce(jsonb_agg(row_data ORDER BY record_id), '[]'::jsonb) INTO result
    FROM (
      SELECT p.id AS record_id, jsonb_build_object(
        'recordId', p.id, 'organizationId', p.organization_id, 'resource', 'activity',
        'label', p.summary, 'status', 'active') AS row_data
      FROM public.crm_activities p
      WHERE p.organization_id = organization_id AND (cursor_id IS NULL OR p.id > cursor_id)
        AND (query_text IS NULL OR lower(p.summary) LIKE '%' || query_text || '%')
      ORDER BY p.id LIMIT limit_value
    ) rows;
  END IF;
  RETURN result;
END
$$;
