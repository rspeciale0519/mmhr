-- Exclude unreviewed migration data from the fixed invitation read.
-- This changes no stored invitation, organization, membership, or audit data.
-- Recovery: revoke authenticated EXECUTE on this read until a forward repair.
CREATE OR REPLACE FUNCTION public.mmhr_get_my_invitations()
RETURNS TABLE (
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
  role_key text,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT invitation.id, organization.id, organization.name,
    invitation.role_key, invitation.expires_at
  FROM public.invitations AS invitation
  INNER JOIN public.orgs AS organization ON organization.id = invitation.org_id
  WHERE invitation.normalized_email = (
      SELECT identity.normalized_email
      FROM public.identities AS identity
      WHERE identity.id = mmhr_private.r1_invitation_identity_id()
    )
    AND invitation.status = 'pending'
    AND NOT invitation.migration_review_required
    AND invitation.expires_at > CURRENT_TIMESTAMP
    AND organization.status = 'active'
    AND NOT organization.migration_review_required
    AND NOT EXISTS (
      SELECT 1 FROM public.org_members AS membership
      WHERE membership.org_id = invitation.org_id
        AND membership.identity_id = mmhr_private.r1_invitation_identity_id()
        AND membership.status IN ('active', 'suspended')
    )
  ORDER BY invitation.expires_at, invitation.id
  LIMIT 100
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.mmhr_get_my_invitations() FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_my_invitations() TO authenticated;
