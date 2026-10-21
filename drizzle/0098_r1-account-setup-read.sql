-- Fixed, caller-only setup read. Never broadens the active-only identity helper.
-- No stored data changes. Recovery: revoke this RPC and deploy a forward repair.
CREATE FUNCTION public.mmhr_get_my_account_setup()
RETURNS TABLE (id uuid, status public.identity_status, email_verified_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  claims jsonb := auth.jwt();
  checked_at timestamptz := statement_timestamp();
  request_session uuid;
  active_actor uuid := mmhr_private.r1_request_identity_id();
BEGIN
  IF active_actor IS NOT NULL THEN
    RETURN QUERY SELECT i.id, i.status, i.email_verified_at
      FROM public.identities i WHERE i.id = active_actor;
    RETURN;
  END IF;
  IF claims->>'role' IS DISTINCT FROM 'authenticated'
    OR coalesce(claims->>'aal','') NOT IN ('aal1','aal2')
    OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims->>'iat','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims->>'sub','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR coalesce(claims->>'session_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
  THEN RETURN; END IF;
  request_session := (claims->>'session_id')::uuid;
  IF (claims->>'exp')::numeric <= extract(epoch FROM checked_at)
    OR (claims->>'iat')::numeric > floor(extract(epoch FROM checked_at))
    OR (claims->>'iat')::numeric >= (claims->>'exp')::numeric
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=request_session AND s.user_id=auth.uid()
      AND (s.not_after IS NULL OR s.not_after > checked_at))
  THEN RETURN; END IF;
  IF claims->>'aal'='aal2' AND NOT mmhr_private.r1_session_is_aal2(auth.uid(),request_session,checked_at)
  THEN RETURN; END IF;
  RETURN QUERY SELECT i.id, i.status,
    CASE WHEN u.email_confirmed_at IS NOT NULL THEN i.email_verified_at ELSE NULL END
  FROM public.identities i JOIN auth.users u ON u.id=i.auth_user_id
  WHERE i.auth_user_id=auth.uid() AND i.status='pending'
    AND NOT i.migration_review_required AND i.authorization_not_before IS NULL
    AND u.deleted_at IS NULL AND NOT u.is_anonymous
    AND (u.banned_until IS NULL OR u.banned_until <= checked_at)
    AND i.normalized_email=lower(btrim(u.email));
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_my_account_setup() FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_my_account_setup() TO authenticated;
