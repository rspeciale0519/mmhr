-- Forward: rehearse the scoped read before deployment. No stored data changes.
-- Recovery: revoke this function and apply a forward correction; preserve records.
CREATE FUNCTION public.mmhr_get_intake_requirements_page(
  requested_organization_id uuid, requested_intake_id uuid,
  after_id uuid DEFAULT NULL, page_size integer DEFAULT 25
)
RETURNS TABLE (
  requirement_id uuid, organization_id uuid, intake_id uuid, stable_key text,
  label text, importance text, weight integer, response jsonb, status text,
  requirement_type text, revision integer, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE saved record;
BEGIN
  IF $1 IS NULL OR $2 IS NULL OR $4 IS NULL OR $4 < 1 OR $4 > 50 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid requirement read';
  END IF;
  IF NOT coalesce(mmhr_private.r1_request_has_permission('workspace.access', $1), false) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Requirement read denied';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.intakes i WHERE i.organization_id=$1 AND i.id=$2) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Requirement read denied';
  END IF;

  FOR saved IN
    SELECT r.id, r.organization_id, r.intake_id, r.stable_key, r.label,
      r.importance, r.weight, r.response, r.status, r.requirement_type,
      r.revision, r.created_at, r.updated_at
    FROM public.intake_requirements r
    WHERE r.organization_id=$1 AND r.intake_id=$2 AND r.status='active'
      AND ($3 IS NULL OR r.id > $3)
    ORDER BY r.id LIMIT ($4 + 1)
  LOOP
    -- Legacy null answers are valid. Never trim saved answers or use the narrower
    -- application new-write budget. Reject invalid data instead of dropping it.
    IF octet_length(saved.label) > 100000 OR (saved.response IS NOT NULL AND (
      octet_length(saved.response::text) > 100000 OR
      NOT coalesce(mmhr_private.r3_requirement_response_is_valid(saved.response), false)
    )) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Requirement data requires review';
    END IF;
    RETURN QUERY SELECT saved.id, saved.organization_id, saved.intake_id,
      saved.stable_key, saved.label, saved.importance, saved.weight,
      saved.response, saved.status, saved.requirement_type, saved.revision,
      saved.created_at, saved.updated_at;
  END LOOP;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_intake_requirements_page(uuid,uuid,uuid,integer)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_intake_requirements_page(uuid,uuid,uuid,integer)
  TO authenticated;
