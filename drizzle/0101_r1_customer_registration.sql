-- Owner-approved self-service customer setup. Never claims an existing organization.
-- Recovery: revoke the setup RPC and retain data; do not reset or delete accounts.
CREATE TABLE public.customer_registrations (
  identity_id uuid PRIMARY KEY CONSTRAINT customer_registrations_identity_id_identities_id_fk
    REFERENCES public.identities(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL CONSTRAINT customer_registrations_organization_id_unique UNIQUE
    CONSTRAINT customer_registrations_organization_id_orgs_id_fk REFERENCES public.orgs(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_registrations FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY customer_registrations_deny ON public.customer_registrations AS RESTRICTIVE
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
--> statement-breakpoint

-- Single-customer workspaces have no administration role. Every other organization
-- retains the exact existing durable administrator and MFA capacity requirements.
CREATE OR REPLACE FUNCTION mmhr_private.r1_assert_administration_capacity(authorization_time timestamptz)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  bootstrap public.security_bootstrap_state%ROWTYPE;
  bound_identity uuid;
  organization_id uuid;
BEGIN
  SELECT * INTO bootstrap FROM public.security_bootstrap_state b WHERE b.singleton_key = 1;
  IF NOT FOUND OR bootstrap.state <> 'consumed' OR bootstrap.second_target_identity_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  FOREACH bound_identity IN ARRAY ARRAY[bootstrap.target_identity_id, bootstrap.second_target_identity_id]
  LOOP
    IF NOT mmhr_private.r1_is_super_admin(bound_identity) OR EXISTS (
      SELECT 1 FROM unnest(ARRAY[
        'workspace.access','admin.access','identity.status.change','identity.relink',
        'identity.recovery.request','identity.recovery.approve','org.status.change','org.type.change',
        'platform_roles.assign','platform_roles.revoke','role_versions.activate',
        'permissions.view','permissions.grant','permissions.revoke','permissions.delegate',
        'audit.view','audit.export','audit.change_summary.read'
      ]) AS required(key)
      WHERE NOT mmhr_private.r1_evaluate_permission(bound_identity, required.key,
        NULL::uuid, 'aal2', authorization_time, true)
    ) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  END LOOP;
  FOR organization_id IN SELECT o.id FROM public.orgs o WHERE o.status = 'active' AND NOT EXISTS (
      SELECT 1 FROM public.customer_registrations c WHERE c.organization_id=o.id
        AND o.type='customer' AND NOT o.migration_review_required
        AND NOT EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id=o.id
          AND (m.identity_id<>c.identity_id OR m.role_key<>'contributor'))
        AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides p
          WHERE p.organization_id=o.id AND p.state='active' AND p.effect='allow')
    )
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = organization_id AND m.status = 'active'
        AND m.role_key = 'organization_admin' AND NOT m.migration_review_required
        AND mmhr_private.r1_verified_identity(m.identity_id, true)
        AND NOT EXISTS (
          SELECT 1 FROM unnest(ARRAY[
            'workspace.access','org.name.read','member.role.read','member.role.update',
            'org.members.view','org.members.invite','org.members.change_role',
            'org.members.status.change','org.members.revoke','audit.view'
          ]) AS required(key)
          WHERE NOT mmhr_private.r1_evaluate_permission(m.identity_id, required.key,
            organization_id, 'aal2', authorization_time, true)
        )
    ) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  END LOOP;
END
$$;
--> statement-breakpoint

CREATE FUNCTION public.mmhr_start_customer_workspace(correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  claims jsonb := auth.jwt(); checked_at timestamptz; request_session uuid;
  provider auth.users%ROWTYPE; actor public.identities%ROWTYPE; registered_org uuid;
BEGIN
  IF correlation_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid setup input'; END IF;
  checked_at := mmhr_private.r1_lock_security();
  IF auth.uid() IS NULL
    OR claims->>'role' IS DISTINCT FROM 'authenticated'
    OR coalesce(claims->>'aal','') NOT IN ('aal1','aal2')
    OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims->>'iat','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims->>'sub','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR lower(coalesce(claims->>'sub','')) IS DISTINCT FROM lower(auth.uid()::text)
    OR coalesce(claims->>'session_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Customer setup denied'; END IF;
  request_session := (claims->>'session_id')::uuid;
  IF (claims->>'exp')::numeric <= extract(epoch FROM checked_at)
    OR (claims->>'iat')::numeric > floor(extract(epoch FROM checked_at))
    OR (claims->>'iat')::numeric >= (claims->>'exp')::numeric
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=request_session AND s.user_id=auth.uid()
      AND (s.not_after IS NULL OR s.not_after>checked_at))
    OR (claims->>'aal'='aal2' AND NOT mmhr_private.r1_session_is_aal2(auth.uid(),request_session,checked_at))
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Customer setup denied'; END IF;
  SELECT * INTO provider FROM auth.users u WHERE u.id=auth.uid()
    AND u.email_confirmed_at IS NOT NULL AND nullif(lower(btrim(u.email)),'') IS NOT NULL
    AND u.deleted_at IS NULL AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<=checked_at)
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Customer setup denied'; END IF;
  SELECT * INTO actor FROM public.identities i WHERE i.auth_user_id=provider.id;
  IF FOUND THEN
    IF actor.status NOT IN ('pending','active') OR actor.migration_review_required
      OR (actor.authorization_not_before IS NOT NULL AND
        (actor.status<>'active' OR mmhr_private.r1_request_identity_id() IS DISTINCT FROM actor.id))
      OR actor.normalized_email IS DISTINCT FROM lower(btrim(provider.email))
    THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Customer setup denied'; END IF;
    SELECT c.organization_id INTO registered_org FROM public.customer_registrations c WHERE c.identity_id=actor.id;
    IF FOUND THEN
      IF NOT mmhr_private.r1_evaluate_permission(actor.id,'portal.customer.access',registered_org,claims->>'aal',checked_at,false)
      THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Customer setup denied'; END IF;
      RETURN jsonb_build_object('identityId',actor.id,'organizationId',registered_org,'outcome','existing','correlationId',correlation_id);
    END IF;
    -- Existing or revoked authority never becomes a new self-service grant.
    IF EXISTS (SELECT 1 FROM public.org_members m WHERE m.identity_id=actor.id)
      OR EXISTS (SELECT 1 FROM public.platform_role_assignments p WHERE p.identity_id=actor.id)
      OR EXISTS (SELECT 1 FROM public.user_permission_overrides p WHERE p.identity_id=actor.id)
    THEN RETURN jsonb_build_object('identityId',actor.id,'organizationId',NULL,'outcome','existing_access','correlationId',correlation_id); END IF;
  ELSE
    -- Unique verified-email constraints deny collisions. Never relink by email.
    INSERT INTO public.identities(auth_user_id,normalized_email,email_verified_at,status,activated_at,
      synchronized_at,migration_review_required)
    VALUES(provider.id,lower(btrim(provider.email)),provider.email_confirmed_at,'active',checked_at,checked_at,false)
    RETURNING * INTO actor;
  END IF;
  UPDATE public.identities SET status='active',activated_at=coalesce(activated_at,checked_at),
    email_verified_at=provider.email_confirmed_at,synchronized_at=checked_at,updated_at=checked_at WHERE id=actor.id;
  INSERT INTO public.orgs(name,type,status,activated_at,migration_review_required)
    VALUES('Your software search','customer','active',checked_at,false) RETURNING id INTO registered_org;
  INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,status,migration_review_required)
    VALUES(registered_org,actor.id,provider.id,'contributor','contributor','active',false);
  INSERT INTO public.portal_access_grants(organization_id,portal,issued_by_identity_id,issue_reason)
    VALUES(registered_org,'customer',actor.id,'Approved self-service customer registration');
  INSERT INTO public.customer_registrations(identity_id,organization_id) VALUES(actor.id,registered_org);
  IF NOT mmhr_private.r1_evaluate_permission(actor.id,'portal.customer.access',registered_org,claims->>'aal',checked_at,false)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Customer setup denied'; END IF;
  -- One lifetime setup per identity: retries read the registration above and
  -- never append another creation receipt, even with a new correlation ID.
  PERFORM mmhr_private.r1_finish_security_command(actor.id,'customer.workspace.create','customer.workspace.create',
    'organization',registered_org,registered_org,'Approved self-service customer registration',correlation_id,actor.id,
    jsonb_build_object('version',1),jsonb_build_object('version',1),jsonb_build_object('version',1),checked_at);
  RETURN jsonb_build_object('identityId',actor.id,'organizationId',registered_org,'outcome','created','correlationId',correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_start_customer_workspace(uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_start_customer_workspace(uuid) TO authenticated;

-- Caller-only identity synchronization. It derives the provider subject and
-- verified email from live Auth records and never grants membership or access.
CREATE FUNCTION public.mmhr_sync_my_identity(correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  claims jsonb := auth.jwt();
  checked_at timestamptz;
  request_session uuid;
  provider auth.users%ROWTYPE;
  actor public.identities%ROWTYPE;
  before_status text;
  outcome text;
  created_identity boolean := false;
  input jsonb;
  replay jsonb;
  replay_summary jsonb;
  event_id uuid;
BEGIN
  IF correlation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid synchronization input';
  END IF;
  checked_at := mmhr_private.r1_lock_security();
  IF auth.uid() IS NULL
    OR claims->>'role' IS DISTINCT FROM 'authenticated'
    OR coalesce(claims->>'aal','') NOT IN ('aal1','aal2')
    OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims->>'iat','') !~ '^[0-9]{1,12}$'
    OR lower(coalesce(claims->>'sub','')) IS DISTINCT FROM lower(auth.uid()::text)
    OR coalesce(claims->>'session_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
  THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Identity synchronization denied';
  END IF;
  request_session := (claims->>'session_id')::uuid;
  IF (claims->>'exp')::numeric <= extract(epoch FROM checked_at)
    OR (claims->>'iat')::numeric > floor(extract(epoch FROM checked_at))
    OR (claims->>'iat')::numeric >= (claims->>'exp')::numeric
    OR NOT EXISTS (
      SELECT 1 FROM auth.sessions s
      WHERE s.id=request_session AND s.user_id=auth.uid()
        AND (s.not_after IS NULL OR s.not_after>checked_at)
    )
    OR (claims->>'aal'='aal2' AND NOT mmhr_private.r1_session_is_aal2(auth.uid(),request_session,checked_at))
  THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Identity synchronization denied';
  END IF;
  SELECT * INTO provider FROM auth.users u
  WHERE u.id=auth.uid()
    AND u.email_confirmed_at IS NOT NULL
    AND nullif(lower(btrim(u.email)),'') IS NOT NULL
    AND u.deleted_at IS NULL
    AND NOT u.is_anonymous
    AND (u.banned_until IS NULL OR u.banned_until<=checked_at)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Identity synchronization denied';
  END IF;
  SELECT * INTO actor FROM public.identities i WHERE i.auth_user_id=provider.id FOR UPDATE;
  IF FOUND THEN
    IF actor.status NOT IN ('pending','active')
      OR actor.migration_review_required
      OR (actor.normalized_email IS NOT NULL AND actor.normalized_email IS DISTINCT FROM lower(btrim(provider.email)))
    THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Identity synchronization denied';
    END IF;
  ELSE
    INSERT INTO public.identities(
      auth_user_id, normalized_email, email_verified_at, status,
      synchronized_at, migration_review_required
    ) VALUES (
      provider.id, lower(btrim(provider.email)), provider.email_confirmed_at,
      'pending', checked_at, false
    ) RETURNING * INTO actor;
    created_identity := true;
  END IF;
  input := jsonb_build_object(
    'provider_subject', provider.id,
    'email_verified_at', provider.email_confirmed_at
  );
  replay := mmhr_private.r1_checked_receipt(actor.id,'identity.synchronize',correlation_id,input);
  IF replay IS NOT NULL THEN
    SELECT event.after_summary INTO replay_summary
    FROM public.security_command_receipts receipt
    JOIN public.audit_events event ON event.id=receipt.audit_event_id
    WHERE receipt.id=(replay->>'receipt_id')::uuid;
    IF replay_summary IS NOT NULL THEN
      RETURN replay_summary || jsonb_build_object('correlationId',correlation_id);
    END IF;
  END IF;
  before_status := actor.status::text;
  IF actor.normalized_email = lower(btrim(provider.email))
    AND actor.email_verified_at = provider.email_confirmed_at
    AND actor.synchronized_at IS NOT NULL THEN
    outcome := 'unchanged';
  ELSE
    outcome := 'synchronized';
    UPDATE public.identities SET normalized_email=lower(btrim(provider.email)),
      email_verified_at=provider.email_confirmed_at, synchronized_at=checked_at,
      updated_at=checked_at WHERE id=actor.id;
  END IF;
  IF created_identity THEN outcome := 'created'; END IF;
  INSERT INTO public.audit_events(
    actor_type, actor_identity_id, command, action, entity_type, entity_id,
    reason, correlation_id, idempotency_key, before_summary, after_summary, occurred_at
  ) VALUES (
    'user', actor.id, 'identity.synchronize', 'identity.synchronize', 'identity', actor.id::text,
    'Synchronize the verified caller identity', correlation_id, correlation_id::text,
    CASE WHEN outcome='created' THEN NULL ELSE jsonb_build_object('status',before_status) END,
    jsonb_build_object('identityId',actor.id,'status',actor.status,'outcome',outcome,'correlationId',correlation_id),
    checked_at
  ) RETURNING id INTO event_id;
  INSERT INTO public.security_command_receipts(
    actor_identity_id, command, idempotency_key, request_digest, entity_id,
    action, audit_event_id, created_at
  ) VALUES (
    actor.id, 'identity.synchronize', correlation_id,
    encode(sha256(convert_to(input::text,'UTF8')),'hex'), actor.id,
    'identity.synchronize', event_id, checked_at
  );
  RETURN jsonb_build_object(
    'identityId',actor.id,'status',actor.status,'outcome',outcome,
    'correlationId',correlation_id
  );
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_sync_my_identity(uuid) FROM PUBLIC, anon, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_sync_my_identity(uuid) TO authenticated;
