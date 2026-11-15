-- Hosted runtime worker login. Hand-written; no table, column, or policy changes.
-- Forward: a hosted deployment has no renewer for the 1-10 minute ephemeral
-- worker login. This migration adds one separate kind of longer-lived login,
-- named mmhr_hosted_worker_<32 hex>, for the runtime DATABASE_URL of a hosted
-- development deployment. It has the same role flags and the same single
-- mmhr_worker membership as an ephemeral login, and nothing more:
-- - only a SCRAM-SHA-256 verifier is accepted; a plain password never reaches
--   the database;
-- - the expiry is required and is 1 hour to 90 days ahead;
-- - at most 2 hosted logins exist at one time (one live, one for rotation);
-- - create and renew also refuse a login with a direct grant, an owned object,
--   a policy reference, or a role setting.
-- r1_worker_role_is_safe accepts a hosted member under exactly the conditions
-- of an ephemeral member. Only the member name test changes.
-- The ephemeral functions and the ephemeral cleanup keep their exact name
-- pattern, so they never touch a hosted login. Expired hosted logins have
-- their own cleanup function.
-- The identity intent dispatch functions (0010) still accept only an
-- ephemeral session_user with a 10 minute expiry. A hosted login cannot run
-- that worker. This is intentional and fails closed.
-- Disable and remove do not require r1_worker_role_is_safe. They only take
-- access away, so an operator can lock out a hosted login while the role
-- graph is unsafe. Each still checks the name and the mmhr_worker membership.
-- Every new function is SECURITY DEFINER with an empty search_path. EXECUTE is
-- revoked from PUBLIC and every application role; only the migration owner
-- calls them. The end of this file verifies those grants.
-- Recovery: see the end of this file.
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('mmhr.r1.worker.cleanup', 0)
);--> statement-breakpoint

-- No hosted login may exist before the reviewed functions own that name space.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname ~ '^mmhr_hosted_worker_[0-9a-f]{32}$'
  ) THEN
    RAISE EXCEPTION 'Hosted worker logins already exist outside the reviewed functions';
  END IF;
END
$$;--> statement-breakpoint

-- Same body as 0001. Only the member name test accepts the hosted pattern.
CREATE OR REPLACE FUNCTION "mmhr_private"."r1_worker_role_is_safe"()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "pg_catalog"."pg_roles" AS "worker"
		WHERE "worker"."rolname" = 'mmhr_worker'
			AND NOT "worker"."rolcanlogin"
			AND NOT "worker"."rolsuper"
			AND NOT "worker"."rolcreatedb"
			AND NOT "worker"."rolcreaterole"
			AND NOT "worker"."rolinherit"
			AND NOT "worker"."rolreplication"
			AND NOT "worker"."rolbypassrls"
			AND NOT EXISTS (
				SELECT 1
				FROM "pg_catalog"."pg_auth_members"
				WHERE "member" = "worker"."oid"
			)
			AND 1 = (
				SELECT count(*)
				FROM "pg_catalog"."pg_auth_members" AS "owner_membership"
				INNER JOIN "pg_catalog"."pg_roles" AS "owner_role"
					ON "owner_role"."oid" = "owner_membership"."member"
				INNER JOIN "pg_catalog"."pg_roles" AS "grantor_role"
					ON "grantor_role"."oid" = "owner_membership"."grantor"
				WHERE "owner_membership"."roleid" = "worker"."oid"
					AND "owner_role"."rolname" = current_user
					AND "grantor_role"."rolsuper"
					AND "owner_membership"."admin_option"
					AND NOT "owner_membership"."inherit_option"
					AND NOT "owner_membership"."set_option"
			)
			AND NOT EXISTS (
				SELECT 1
				FROM "pg_catalog"."pg_auth_members" AS "membership"
				INNER JOIN "pg_catalog"."pg_roles" AS "member_role"
					ON "member_role"."oid" = "membership"."member"
				INNER JOIN "pg_catalog"."pg_roles" AS "membership_grantor"
					ON "membership_grantor"."oid" = "membership"."grantor"
				WHERE "membership"."roleid" = "worker"."oid"
					AND NOT (
						(
							"member_role"."rolname" = current_user
							AND "membership_grantor"."rolsuper"
							AND "membership"."admin_option"
							AND NOT "membership"."inherit_option"
							AND NOT "membership"."set_option"
						)
						OR (
							("member_role"."rolname" ~ '^mmhr_worker_[0-9a-f]{32}$' OR "member_role"."rolname" ~ '^mmhr_hosted_worker_[0-9a-f]{32}$')
							AND NOT "member_role"."rolsuper"
							AND NOT "member_role"."rolcreatedb"
							AND NOT "member_role"."rolcreaterole"
							AND "member_role"."rolinherit"
							AND NOT "member_role"."rolreplication"
							AND NOT "member_role"."rolbypassrls"
							AND "member_role"."rolvaliduntil" IS NOT NULL
							AND NOT "membership"."admin_option"
							AND "membership"."inherit_option"
							AND "membership"."set_option"
							AND 1 = (
							SELECT count(*)
							FROM "pg_catalog"."pg_auth_members" AS "forward_membership"
							WHERE "forward_membership"."member" = "member_role"."oid"
						)
							AND 1 = (
							SELECT count(*)
							FROM "pg_catalog"."pg_auth_members" AS "reverse_membership"
							WHERE "reverse_membership"."roleid" = "member_role"."oid"
						)
							AND EXISTS (
							SELECT 1
							FROM "pg_catalog"."pg_auth_members" AS "ownership"
							INNER JOIN "pg_catalog"."pg_roles" AS "owner_role"
								ON "owner_role"."oid" = "ownership"."member"
							INNER JOIN "pg_catalog"."pg_roles" AS "grantor_role"
								ON "grantor_role"."oid" = "ownership"."grantor"
							WHERE "ownership"."roleid" = "member_role"."oid"
								AND "owner_role"."rolname" = current_user
								AND "grantor_role"."rolsuper"
								AND "ownership"."admin_option"
								AND NOT "ownership"."inherit_option"
								AND NOT "ownership"."set_option"
						)
						)
					)
			)
	)
$$;--> statement-breakpoint

-- The exact shape of one hosted login. Stricter than the shared check: the
-- login must also have no direct dependency (grant, owned object, policy) and
-- no role setting, so its only authority is the mmhr_worker membership.
CREATE FUNCTION mmhr_private.r1_hosted_worker_login_is_safe(login_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT login_name IS NOT NULL
    AND login_name ~ '^mmhr_hosted_worker_[0-9a-f]{32}$'
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles AS r
      WHERE r.rolname = login_name
        AND r.rolcanlogin
        AND r.rolinherit
        AND NOT r.rolsuper
        AND NOT r.rolcreatedb
        AND NOT r.rolcreaterole
        AND NOT r.rolreplication
        AND NOT r.rolbypassrls
        AND r.rolvaliduntil IS NOT NULL
        AND 1 = (
          SELECT count(*) FROM pg_catalog.pg_auth_members AS m WHERE m.member = r.oid
        )
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.pg_auth_members AS m
          INNER JOIN pg_catalog.pg_roles AS g ON g.oid = m.roleid
          WHERE m.member = r.oid
            AND g.rolname = 'mmhr_worker'
            AND NOT m.admin_option
            AND m.inherit_option
            AND m.set_option
        )
        AND 1 = (
          SELECT count(*) FROM pg_catalog.pg_auth_members AS m WHERE m.roleid = r.oid
        )
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.pg_auth_members AS m
          INNER JOIN pg_catalog.pg_roles AS o ON o.oid = m.member
          INNER JOIN pg_catalog.pg_roles AS gr ON gr.oid = m.grantor
          WHERE m.roleid = r.oid
            AND o.rolname = current_user
            AND gr.rolsuper
            AND m.admin_option
            AND NOT m.inherit_option
            AND NOT m.set_option
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_shdepend AS d
          WHERE d.refclassid = 'pg_catalog.pg_authid'::pg_catalog.regclass
            AND d.refobjid = r.oid
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_db_role_setting AS s WHERE s.setrole = r.oid
        )
    )
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_create_hosted_worker_login(
  login_name text,
  password_verifier text,
  expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF login_name IS NULL OR login_name !~ '^mmhr_hosted_worker_[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'Invalid hosted worker login name';
  END IF;
  IF password_verifier IS NULL
    OR password_verifier !~ '^SCRAM-SHA-256[$]4096:[A-Za-z0-9+/]+={0,2}[$][A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$' THEN
    RAISE EXCEPTION 'Invalid hosted worker password verifier';
  END IF;
  IF expires_at IS NULL
    OR expires_at < clock_timestamp() + interval '1 hour'
    OR expires_at > clock_timestamp() + interval '90 days' THEN
    RAISE EXCEPTION 'Invalid hosted worker expiry';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mmhr.r1.worker.cleanup', 0)
  );
  IF NOT mmhr_private.r1_worker_role_is_safe() THEN
    RAISE EXCEPTION 'Shared worker role is missing or unsafe';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = login_name) THEN
    RAISE EXCEPTION 'Hosted worker login already exists';
  END IF;
  -- Expired and disabled hosted logins still count until they are removed.
  IF 2 <= (
    SELECT count(*) FROM pg_catalog.pg_roles
    WHERE rolname ~ '^mmhr_hosted_worker_[0-9a-f]{32}$'
  ) THEN
    RAISE EXCEPTION 'Hosted worker login limit reached';
  END IF;

  EXECUTE format(
    'CREATE ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L VALID UNTIL %L',
    login_name,
    password_verifier,
    expires_at
  );
  EXECUTE format(
    'GRANT mmhr_worker TO %I WITH ADMIN FALSE, INHERIT TRUE, SET TRUE',
    login_name
  );
  IF NOT mmhr_private.r1_hosted_worker_login_is_safe(login_name)
    OR NOT mmhr_private.r1_worker_role_is_safe() THEN
    RAISE EXCEPTION 'Hosted worker login owner membership is unsafe';
  END IF;
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_renew_hosted_worker_login(
  login_name text,
  expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF login_name IS NULL OR login_name !~ '^mmhr_hosted_worker_[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'Invalid hosted worker login name';
  END IF;
  IF expires_at IS NULL
    OR expires_at < clock_timestamp() + interval '1 hour'
    OR expires_at > clock_timestamp() + interval '90 days' THEN
    RAISE EXCEPTION 'Invalid hosted worker expiry';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mmhr.r1.worker.cleanup', 0)
  );
  IF NOT mmhr_private.r1_worker_role_is_safe() THEN
    RAISE EXCEPTION 'Shared worker role is missing or unsafe';
  END IF;
  -- An expired or disabled login is not revived; create a new one instead.
  IF NOT mmhr_private.r1_hosted_worker_login_is_safe(login_name)
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles
      WHERE rolname = login_name AND rolvaliduntil > clock_timestamp()
    ) THEN
    RAISE EXCEPTION 'Hosted worker login is missing, expired, or unsafe';
  END IF;

  EXECUTE format('ALTER ROLE %I VALID UNTIL %L', login_name, expires_at);
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_disable_hosted_worker_login(login_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  login_oid oid;
BEGIN
  IF login_name IS NULL OR login_name !~ '^mmhr_hosted_worker_[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'Invalid hosted worker login name';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mmhr.r1.worker.cleanup', 0)
  );
  SELECT oid INTO login_oid FROM pg_catalog.pg_roles WHERE rolname = login_name;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS m
    INNER JOIN pg_catalog.pg_roles AS g ON g.oid = m.roleid
    WHERE m.member = login_oid AND g.rolname = 'mmhr_worker'
  ) THEN
    RAISE EXCEPTION 'Hosted worker login is unsafe';
  END IF;

  EXECUTE format(
    'ALTER ROLE %I NOLOGIN PASSWORD NULL VALID UNTIL %L',
    login_name,
    clock_timestamp()
  );
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_remove_hosted_worker_login(login_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  hosted_login record;
  activity record;
BEGIN
  IF login_name IS NULL OR login_name !~ '^mmhr_hosted_worker_[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'Invalid hosted worker login name';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mmhr.r1.worker.cleanup', 0)
  );
  SELECT * INTO hosted_login FROM pg_catalog.pg_roles WHERE rolname = login_name;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF hosted_login.rolcanlogin
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members AS m
      INNER JOIN pg_catalog.pg_roles AS g ON g.oid = m.roleid
      WHERE m.member = hosted_login.oid AND g.rolname = 'mmhr_worker'
    ) THEN
    RAISE EXCEPTION 'Hosted worker login must be disabled before removal';
  END IF;
  FOR activity IN
    SELECT pid
    FROM pg_catalog.pg_stat_activity
    WHERE usename = login_name
      AND pid <> pg_catalog.pg_backend_pid()
  LOOP
    IF NOT pg_catalog.pg_terminate_backend(activity.pid, 5000) THEN
      RAISE EXCEPTION 'Hosted worker session could not be terminated';
    END IF;
  END LOOP;
  PERFORM pg_catalog.pg_stat_clear_snapshot();
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_stat_activity
    WHERE usename = login_name
      AND pid <> pg_catalog.pg_backend_pid()
  ) THEN
    RAISE EXCEPTION 'Hosted worker sessions could not be terminated';
  END IF;

  EXECUTE format('REVOKE mmhr_worker FROM %I', login_name);
  EXECUTE format('DROP ROLE %I', login_name);
END
$$;--> statement-breakpoint

-- Removes only hosted logins whose expiry has passed. A valid hosted login and
-- every ephemeral login are left unchanged.
CREATE FUNCTION mmhr_private.r1_remove_expired_hosted_worker_logins()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expired_login record;
  removed_count integer := 0;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mmhr.r1.worker.cleanup', 0)
  );
  FOR expired_login IN
    SELECT rolname
    FROM pg_catalog.pg_roles
    WHERE rolname ~ '^mmhr_hosted_worker_[0-9a-f]{32}$'
      AND rolvaliduntil IS NOT NULL
      AND rolvaliduntil <= clock_timestamp()
  LOOP
    PERFORM mmhr_private.r1_disable_hosted_worker_login(expired_login.rolname);
    PERFORM mmhr_private.r1_remove_hosted_worker_login(expired_login.rolname);
    removed_count := removed_count + 1;
  END LOOP;
  RETURN removed_count;
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION mmhr_private.r1_worker_role_is_safe()
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker, mmhr_rfp_notification_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r1_hosted_worker_login_is_safe(text)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker, mmhr_rfp_notification_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r1_create_hosted_worker_login(text, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker, mmhr_rfp_notification_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r1_renew_hosted_worker_login(text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker, mmhr_rfp_notification_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r1_disable_hosted_worker_login(text)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker, mmhr_rfp_notification_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r1_remove_hosted_worker_login(text)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker, mmhr_rfp_notification_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r1_remove_expired_hosted_worker_logins()
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker, mmhr_rfp_notification_worker;--> statement-breakpoint

-- Refuse the migration if any function is callable by PUBLIC or an
-- application role, is not SECURITY DEFINER, or has another search_path.
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'mmhr_private.r1_worker_role_is_safe()'::regprocedure,
    'mmhr_private.r1_hosted_worker_login_is_safe(text)'::regprocedure,
    'mmhr_private.r1_create_hosted_worker_login(text,text,timestamptz)'::regprocedure,
    'mmhr_private.r1_renew_hosted_worker_login(text,timestamptz)'::regprocedure,
    'mmhr_private.r1_disable_hosted_worker_login(text)'::regprocedure,
    'mmhr_private.r1_remove_hosted_worker_login(text)'::regprocedure,
    'mmhr_private.r1_remove_expired_hosted_worker_logins()'::regprocedure
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS p
      WHERE p.oid = fn AND p.prosecdef AND p.proconfig = ARRAY['search_path=""']::text[]
    ) OR EXISTS (
      -- A NULL ACL means the default EXECUTE grant to PUBLIC.
      SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = fn AND p.proacl IS NULL
    ) OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS p
      CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) AS acl
      WHERE p.oid = fn AND acl.grantee = 0
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS r
      WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'mmhr_worker',
          'mmhr_document_worker', 'mmhr_rfp_notification_worker')
        AND pg_catalog.has_function_privilege(r.oid, fn, 'EXECUTE')
    ) THEN
      RAISE EXCEPTION 'Hosted worker function % is not owner-only', fn;
    END IF;
  END LOOP;
END
$$;
-- Recovery (forward repair; no table data is involved):
-- 1. Remove every hosted login first. For each name from
--    `node scripts/hosted-worker-login.mjs list --project-ref <ref>`, run
--    `node scripts/hosted-worker-login.mjs remove <name> --project-ref <ref>`,
--    or as the migration owner: SELECT mmhr_private.r1_disable_hosted_worker_login('<name>');
--    then, in a new transaction, SELECT mmhr_private.r1_remove_hosted_worker_login('<name>');
--    Then replace or remove DATABASE_URL in the Vercel preview environment.
-- 2. Apply a new migration that drops the six functions created above and
--    restores the 0001 body of mmhr_private.r1_worker_role_is_safe().
--    Do step 1 before step 2. If a hosted login is still a member of
--    mmhr_worker, the 0001 check returns false and every ephemeral worker
--    create and renew fails closed until that login is removed.
-- 3. Never grant EXECUTE on these functions to an application role, and never
--    widen the name, expiry, or limit rules to repair a deployment.
