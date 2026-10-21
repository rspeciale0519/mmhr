-- Preserve the existing signature while excluding unreviewed memberships.
-- Add a separately named bounded read for administration screens.
-- Recovery: revoke these reads and deploy a forward repair. No records change.
CREATE OR REPLACE FUNCTION public.mmhr_get_organization_members(organization_id uuid)
RETURNS TABLE (membership_id uuid, identity_id uuid, role_key text, status public.membership_status)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT m.id, m.identity_id,
    CASE WHEN mmhr_private.r1_request_has_permission('member.role.read', $1) THEN m.role_key ELSE NULL END,
    m.status
  FROM public.org_members m
  WHERE m.org_id=$1 AND m.status IN ('active','suspended') AND NOT m.migration_review_required
    AND mmhr_private.r1_request_has_permission('org.members.view', $1)
  ORDER BY m.id
$$;--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_organization_members_page(
  requested_organization_id uuid, after_id uuid DEFAULT NULL, page_size integer DEFAULT 50
)
RETURNS TABLE (
  membership_id uuid, organization_id uuid, identity_id uuid, role_key text, status public.membership_status
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT coalesce(mmhr_private.r1_request_has_permission('org.members.view', $1), false)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Member read denied'; END IF;
  IF $3 IS NULL OR $3 < 1 OR $3 > 100
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid member page'; END IF;
  RETURN QUERY
  SELECT m.id, m.org_id, m.identity_id,
    CASE WHEN mmhr_private.r1_request_has_permission('member.role.read', $1) THEN m.role_key ELSE NULL END,
    m.status
  FROM public.org_members m
  WHERE m.org_id=$1 AND m.status IN ('active','suspended') AND NOT m.migration_review_required
    AND ($2 IS NULL OR m.id > $2)
  ORDER BY m.id LIMIT ($3 + 1);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_organization_members(uuid),
  public.mmhr_get_organization_members_page(uuid,uuid,integer)
FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_organization_members(uuid),
  public.mmhr_get_organization_members_page(uuid,uuid,integer) TO authenticated;
