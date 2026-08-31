-- R1.4 emergency revocation. Run as the migration owner on the affected
-- environment after recording the change ticket and current evidence.
-- These statements revoke Data API access without disabling RLS.

REVOKE ALL ON TABLE public.audit_events, public.audit_log,
  public.identity_admin_intents, public.identity_recovery_approvals,
  public.identity_recovery_presence, public.identity_recovery_requests,
  public.security_bootstrap_state, public.identities, public.invitations,
  public.org_members, public.orgs, public.leads,
  public.admin_delegation_grants, public.permission_definitions,
  public.platform_role_assignments, public.portal_access_grants,
  public.role_definitions, public.role_permission_defaults,
  public.user_permission_overrides
FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.mmhr_get_my_identity() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mmhr_get_organization(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mmhr_get_my_memberships() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mmhr_get_organization_members(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mmhr_get_audit_events(uuid) FROM anon, authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.mmhr_authorize(text,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.mmhr_authorize(text, uuid) FROM anon, authenticated;
  END IF;
END
$$;

-- If exact function revocation is not sufficient, stop the affected Data API
-- service through the platform control plane, then disable the route.
