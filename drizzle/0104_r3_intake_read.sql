-- Forward: rehearse both scoped reads before deployment. No stored data changes.
-- Recovery: revoke these functions and use a forward repair; preserve all records.
CREATE FUNCTION public.mmhr_get_intakes_page(
  requested_organization_id uuid, after_id uuid DEFAULT NULL, page_size integer DEFAULT 25
)
RETURNS TABLE (intake_id uuid, organization_id uuid, status text, revision integer,
  created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF $1 IS NULL OR $3 IS NULL OR $3 < 1 OR $3 > 50 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid intake read';
  END IF;
  IF NOT coalesce(mmhr_private.r1_request_has_permission('workspace.access', $1), false) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Intake read denied';
  END IF;
  RETURN QUERY SELECT i.id, i.organization_id, i.status, i.revision, i.created_at, i.updated_at
    FROM public.intakes i WHERE i.organization_id=$1 AND ($2 IS NULL OR i.id > $2)
    ORDER BY i.id LIMIT ($3 + 1);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.mmhr_get_intake(requested_organization_id uuid, requested_intake_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE intake public.intakes%ROWTYPE; intake_data jsonb;
BEGIN
  IF $1 IS NULL OR $2 IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid intake read';
  END IF;
  IF NOT coalesce(mmhr_private.r1_request_has_permission('workspace.access', $1), false) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Intake read denied';
  END IF;
  SELECT i.* INTO intake FROM public.intakes i WHERE i.organization_id=$1 AND i.id=$2;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Intake read denied';
  END IF;
  -- Remove only absent top-level fields; do not silently remove nested legacy data.
  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb) INTO intake_data
  FROM jsonb_each(jsonb_build_object(
    'companyContext',intake.company_context, 'currentSystems',intake.current_systems,
    'complianceNeeds',intake.compliance_needs, 'budget',intake.budget,
    'timeline',intake.timeline, 'stakeholders',intake.stakeholders,
    'decisionProcess',intake.decision_process
  )) AS fields(k,v) WHERE v <> 'null'::jsonb;
  IF NOT mmhr_private.r3_intake_data_is_valid(intake_data) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Intake data requires review';
  END IF;
  RETURN jsonb_build_object(
    'intakeId',intake.id, 'organizationId',intake.organization_id,
    'status',intake.status, 'revision',intake.revision,
    'createdAt',intake.created_at, 'updatedAt',intake.updated_at,
    'submittedAt',intake.submitted_at, 'data',intake_data
  );
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_intakes_page(uuid,uuid,integer),
  public.mmhr_get_intake(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_intakes_page(uuid,uuid,integer),
  public.mmhr_get_intake(uuid,uuid) TO authenticated;
