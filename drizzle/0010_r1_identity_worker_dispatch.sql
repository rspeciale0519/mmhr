-- Discovery is a read-only view of the existing transactional outbox. The
-- three leased commands remain the only worker mutation authority.
CREATE FUNCTION mmhr_private.mmhr_list_identity_intent_candidates()
RETURNS TABLE(intent_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE checked_at timestamptz := statement_timestamp();
BEGIN
  -- SECURITY DEFINER changes current_user. Check the actual connection login,
  -- including expired credentials on a connection that is already open.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = session_user AND r.rolname ~ '^mmhr_worker_[0-9a-f]{32}$'
      AND r.rolcanlogin AND r.rolinherit
      AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole
      AND NOT r.rolreplication AND NOT r.rolbypassrls
      AND r.rolvaliduntil > checked_at
      AND r.rolvaliduntil <= checked_at + interval '10 minutes'
  ) OR NOT mmhr_private.r1_worker_role_is_safe()
    OR pg_catalog.has_database_privilege(session_user,current_database(),'CREATE')
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_namespace n
      WHERE n.nspname IN ('public','mmhr_private','auth','storage')
        AND pg_catalog.has_schema_privilege(session_user,n.oid,'CREATE')
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public','mmhr_private','auth','storage')
        AND c.relkind IN ('r','p','v','m','f')
        AND (pg_catalog.has_table_privilege(session_user,c.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
          OR pg_catalog.has_any_column_privilege(session_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public','mmhr_private','auth','storage') AND c.relkind = 'S'
        AND pg_catalog.has_sequence_privilege(session_user,c.oid,'USAGE,SELECT,UPDATE')
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public','mmhr_private') AND p.prosecdef
        AND pg_catalog.has_function_privilege(session_user,p.oid,'EXECUTE')
        AND p.oid NOT IN (
          'mmhr_private.mmhr_list_identity_intent_candidates()'::regprocedure,
          'mmhr_private.mmhr_claim_identity_intent(uuid)'::regprocedure,
          'mmhr_private.mmhr_claim_identity_intent_reconciliation(uuid)'::regprocedure,
          'mmhr_private.mmhr_record_identity_intent_result(uuid,text,jsonb)'::regprocedure
        )
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Identity intent worker access denied';
  END IF;

  -- Do not claim or lock here. Another worker, cancellation, or authority
  -- change can win after this read; the existing mutation rechecks everything.
  RETURN QUERY
  SELECT i.id FROM public.identity_admin_intents i
  WHERE NOT i.manual_review_required
    AND (i.next_attempt_at IS NULL OR i.next_attempt_at <= checked_at)
    AND mmhr_private.r1_identity_intent_context_is_valid(i)
    AND mmhr_private.r1_identity_intent_history_is_valid(i)
    AND (
      i.lease_token IS NULL AND i.attempt_count < i.maximum_attempts
        AND i.state IN ('pending','failed')
        AND (
          i.operation = 'invitation_delivery'
            AND mmhr_private.r1_invitation_intent_is_ready(i,checked_at)
            AND (i.state = 'pending' OR (
              i.safe_error_code IS NOT DISTINCT FROM 'provider_rejected'
              AND i.next_attempt_at IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM public.identity_intent_attempts a
                WHERE a.intent_id = i.id AND a.attempt_number = i.attempt_count
                  AND a.mode = 'dispatch' AND a.outcome = 'failed'
                  AND a.safe_error_code = 'provider_rejected'
                  AND a.next_action = 'retry' AND a.completed_at IS NOT NULL
              )
            ))
          OR i.operation = 'mfa_enrollment_reset' AND i.state = 'pending'
            AND i.dispatch_count = 0 AND i.attempt_count = 0
            AND mmhr_private.r1_recovery_intent_is_ready(i,checked_at)
        )
      OR i.state IN ('in_flight','outcome_unknown')
        AND (
          i.lease_token IS NOT NULL AND i.lease_expires_at <= checked_at
          OR i.state = 'outcome_unknown' AND i.lease_token IS NULL
            AND i.attempt_count < i.maximum_attempts
        )
    )
  -- Expired final leases must reach reconciliation, which records their
  -- manual-review state even when no further provider read is permitted.
  ORDER BY greatest(coalesce(i.next_attempt_at,i.created_at),
    CASE WHEN i.lease_token IS NOT NULL THEN i.lease_expires_at ELSE i.created_at END),i.id
  LIMIT 5;
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION mmhr_private.mmhr_list_identity_intent_candidates()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mmhr_private.mmhr_list_identity_intent_candidates() TO mmhr_worker;
