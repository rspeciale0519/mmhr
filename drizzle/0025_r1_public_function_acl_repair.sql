-- R1 security repair: public API functions are authenticated-only.
-- Revoke inherited PUBLIC access before granting the reviewed caller role.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint

DO $$
DECLARE
  function_row record;
BEGIN
  FOR function_row IN
    SELECT procedure.proname AS name,
      pg_get_function_identity_arguments(procedure.oid) AS arguments
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public' AND procedure.proname LIKE 'mmhr_%'
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
      function_row.name, function_row.arguments
    );
  END LOOP;
END
$$;
