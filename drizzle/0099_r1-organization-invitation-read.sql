-- Organization administrators can inspect existing invitation records, not
-- provider account existence. No tokens, provider data, or audit reasons return.
-- Recovery: revoke this function and deploy a forward repair. No data changes.
CREATE FUNCTION public.mmhr_get_organization_invitations(
  requested_organization_id uuid, after_id uuid DEFAULT NULL, page_size integer DEFAULT 50
)
RETURNS TABLE (
  invitation_id uuid, organization_id uuid, invited_email text, role_key text,
  status text, created_at timestamptz, expires_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT coalesce(mmhr_private.r1_request_has_permission('org.members.view', $1), false)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Invitation read denied'; END IF;
  IF $3 IS NULL OR $3 < 1 OR $3 > 100
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid invitation page'; END IF;
  RETURN QUERY
  SELECT i.id, i.org_id, i.normalized_email,
    CASE WHEN mmhr_private.r1_request_has_permission('member.role.read', $1)
      THEN i.role_key ELSE NULL END,
    i.status::text, i.created_at, i.expires_at
  FROM public.invitations i JOIN public.orgs o ON o.id=i.org_id
  WHERE i.org_id=$1 AND NOT i.migration_review_required
    AND o.status='active' AND NOT o.migration_review_required
    AND ($2 IS NULL OR i.id > $2)
  ORDER BY i.id
  LIMIT ($3 + 1);
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_organization_invitations(uuid,uuid,integer) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_organization_invitations(uuid,uuid,integer) TO authenticated;
