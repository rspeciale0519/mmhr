CREATE TYPE "public"."identity_intent_work_mode" AS ENUM('dispatch', 'reconciliation');--> statement-breakpoint
CREATE TABLE "identity_intent_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"mode" "identity_intent_work_mode" NOT NULL,
	"lease_token" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"outcome" text,
	"safe_error_code" text,
	"result_code" text,
	"next_action" text,
	CONSTRAINT "identity_intent_attempts_number_ck" CHECK ("identity_intent_attempts"."attempt_number" between 1 and 5),
	CONSTRAINT "identity_intent_attempts_expiry_ck" CHECK ("identity_intent_attempts"."lease_expires_at" > "identity_intent_attempts"."started_at"),
	CONSTRAINT "identity_intent_attempts_lifecycle_ck" CHECK (
      ("identity_intent_attempts"."completed_at" is null and "identity_intent_attempts"."outcome" is null and "identity_intent_attempts"."safe_error_code" is null
        and "identity_intent_attempts"."result_code" is null and "identity_intent_attempts"."next_action" is null)
      or ("identity_intent_attempts"."completed_at" is not null and "identity_intent_attempts"."completed_at" >= "identity_intent_attempts"."started_at"
        and "identity_intent_attempts"."outcome" is not null and "identity_intent_attempts"."next_action" is not null
        and "identity_intent_attempts"."outcome" in ('succeeded', 'failed', 'outcome_unknown')
        and "identity_intent_attempts"."next_action" in ('none', 'retry', 'reconcile', 'manual_review'))
    ),
	CONSTRAINT "identity_intent_attempts_error_ck" CHECK ("identity_intent_attempts"."safe_error_code" is null or "identity_intent_attempts"."safe_error_code" in (
      'invalid_request', 'provider_unavailable', 'provider_rejected', 'provider_response_invalid',
      'reset_limit_exceeded', 'factors_remaining', 'provider_outcome_unknown', 'delivery_unverifiable',
      'lease_expired', 'attempt_limit', 'authority_lost', 'request_expired'
    )),
	CONSTRAINT "identity_intent_attempts_result_ck" CHECK ("identity_intent_attempts"."result_code" is null or "identity_intent_attempts"."result_code" in (
      'invitation_provider_accepted', 'mfa_zero_factors'
    ))
);
--> statement-breakpoint
CREATE TABLE "mmhr_private"."recovery_policy_state" (
	"singleton_key" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"first_identity_id" uuid NOT NULL,
	"second_identity_id" uuid NOT NULL,
	"procedure_version" text NOT NULL,
	"product_approval_id" uuid NOT NULL,
	"security_approval_id" uuid NOT NULL,
	"operations_evidence_id" uuid NOT NULL,
	"rehearsal_evidence_id" uuid NOT NULL,
	"prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_policy_state_singleton_ck" CHECK ("mmhr_private"."recovery_policy_state"."singleton_key" = 1),
	CONSTRAINT "recovery_policy_state_pair_ck" CHECK ("mmhr_private"."recovery_policy_state"."first_identity_id" <> "mmhr_private"."recovery_policy_state"."second_identity_id"),
	CONSTRAINT "recovery_policy_state_procedure_ck" CHECK ("mmhr_private"."recovery_policy_state"."procedure_version" = 'outbound_preexisting_contact_v1'),
	CONSTRAINT "recovery_policy_state_approvals_ck" CHECK ("mmhr_private"."recovery_policy_state"."product_approval_id" <> "mmhr_private"."recovery_policy_state"."security_approval_id")
);
--> statement-breakpoint
ALTER TABLE "identity_admin_intents" ADD COLUMN "correlation_id" uuid;--> statement-breakpoint
ALTER TABLE "identity_admin_intents" ADD COLUMN "initiated_by_identity_id" uuid;--> statement-breakpoint
ALTER TABLE "identity_admin_intents" ADD COLUMN "auth_subject_id" uuid;--> statement-breakpoint
ALTER TABLE "identity_admin_intents" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "identity_admin_intents" ADD COLUMN "work_mode" "identity_intent_work_mode";--> statement-breakpoint
ALTER TABLE "identity_admin_intents" ADD COLUMN "dispatch_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_admin_intents" ADD COLUMN "manual_review_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_recovery_presence" ADD COLUMN "auth_subject_id" uuid;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "authorization_not_before" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_intent_attempts" ADD CONSTRAINT "identity_intent_attempts_intent_id_identity_admin_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."identity_admin_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."recovery_policy_state" ADD CONSTRAINT "recovery_policy_state_first_identity_id_identities_id_fk" FOREIGN KEY ("first_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."recovery_policy_state" ADD CONSTRAINT "recovery_policy_state_second_identity_id_identities_id_fk" FOREIGN KEY ("second_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_intent_attempts_number_uq" ON "identity_intent_attempts" USING btree ("intent_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_intent_attempts_lease_uq" ON "identity_intent_attempts" USING btree ("lease_token");--> statement-breakpoint
CREATE INDEX "identity_intent_attempts_correlation_idx" ON "identity_intent_attempts" USING btree ("correlation_id");--> statement-breakpoint
ALTER TABLE "identity_admin_intents" ADD CONSTRAINT "identity_admin_intents_initiated_by_identity_id_identities_id_fk" FOREIGN KEY ("initiated_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_admin_intents" ADD CONSTRAINT "identity_admin_intents_dispatch_count_ck" CHECK ("identity_admin_intents"."dispatch_count" >= 0 and "identity_admin_intents"."dispatch_count" <= "identity_admin_intents"."attempt_count" and ("identity_admin_intents"."operation" <> 'mfa_enrollment_reset' or "identity_admin_intents"."dispatch_count" <= 1));--> statement-breakpoint
ALTER TABLE "identity_admin_intents" ADD CONSTRAINT "identity_admin_intents_lease_context_ck" CHECK (("identity_admin_intents"."lease_token" is null and "identity_admin_intents"."work_mode" is null) or ("identity_admin_intents"."lease_token" is not null and "identity_admin_intents"."work_mode" is not null and "identity_admin_intents"."correlation_id" is not null and "identity_admin_intents"."initiated_by_identity_id" is not null and "identity_admin_intents"."lease_expires_at" is not null));
--> statement-breakpoint

-- New records are private by default. A worker can execute only the three
-- fixed functions below; it receives no table or Auth administration grant.
ALTER TABLE public.identity_intent_attempts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE mmhr_private.recovery_policy_state ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE public.identity_intent_attempts, mmhr_private.recovery_policy_state
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
CREATE POLICY identity_intent_attempts_runtime_deny ON public.identity_intent_attempts
  AS RESTRICTIVE FOR ALL TO anon, authenticated, mmhr_worker USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE TRIGGER recovery_policy_immutable BEFORE UPDATE OR DELETE ON mmhr_private.recovery_policy_state
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint
CREATE TRIGGER recovery_policy_no_truncate BEFORE TRUNCATE ON mmhr_private.recovery_policy_state
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint

-- Match the installed worker UUID validator before a claim can change state.
CREATE FUNCTION mmhr_private.r1_worker_uuid_is_valid(value text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT coalesce($1 ~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$',false)
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_recovery_policy_is_prepared()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM mmhr_private.recovery_policy_state p
    JOIN public.security_bootstrap_state b ON b.singleton_key = p.singleton_key
    WHERE b.state = 'consumed' AND b.target_identity_id = p.first_identity_id
      AND b.second_target_identity_id = p.second_identity_id
      AND p.procedure_version = 'outbound_preexisting_contact_v1'
  )
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_prepare_recovery_policy(
  first_identity_id uuid, second_identity_id uuid, product_approval_id uuid,
  security_approval_id uuid, operations_evidence_id uuid, rehearsal_evidence_id uuid,
  correlation_id uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE checked_at timestamptz;
BEGIN
  checked_at := mmhr_private.r1_lock_security();
  IF first_identity_id IS NULL OR second_identity_id IS NULL OR first_identity_id = second_identity_id
    OR product_approval_id IS NULL OR security_approval_id IS NULL OR product_approval_id = security_approval_id
    OR operations_evidence_id IS NULL OR rehearsal_evidence_id IS NULL OR correlation_id IS NULL
    OR EXISTS (SELECT 1 FROM mmhr_private.recovery_policy_state)
    OR NOT EXISTS (
      SELECT 1 FROM public.security_bootstrap_state b WHERE b.singleton_key = 1 AND b.state = 'consumed'
        AND b.target_identity_id = first_identity_id AND b.second_target_identity_id = second_identity_id
    )
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  PERFORM mmhr_private.r1_assert_administration_capacity(checked_at);
  INSERT INTO mmhr_private.recovery_policy_state(singleton_key,first_identity_id,second_identity_id,
    procedure_version,product_approval_id,security_approval_id,operations_evidence_id,rehearsal_evidence_id,prepared_at)
  VALUES(1,first_identity_id,second_identity_id,'outbound_preexisting_contact_v1',product_approval_id,
    security_approval_id,operations_evidence_id,rehearsal_evidence_id,checked_at);
  INSERT INTO public.audit_events(actor_type,actor_reference,command,action,entity_type,entity_id,
    reason,correlation_id,occurred_at)
  VALUES('system','reviewed-recovery-preparation','identity.recovery.prepare','identity.recovery.prepare',
    'recovery_policy','1','Record the approved pair and verified recovery procedure',correlation_id,checked_at);
END
$$;--> statement-breakpoint

-- Keep the fence after successful re-enrollment. A token from the reset second
-- cannot become an authorization credential again when the identity is active.
CREATE OR REPLACE FUNCTION mmhr_private.r1_request_identity_id()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  claims jsonb := auth.jwt();
  checked_at timestamptz := statement_timestamp();
  request_session uuid;
  actor uuid;
BEGIN
  IF claims ->> 'role' IS DISTINCT FROM 'authenticated'
    OR coalesce(claims ->> 'aal','') NOT IN ('aal1','aal2')
    OR coalesce(claims ->> 'exp','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims ->> 'iat','') !~ '^[0-9]{1,12}$'
    OR coalesce(claims ->> 'sub','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR coalesce(claims ->> 'session_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
  THEN RETURN NULL; END IF;
  request_session := (claims ->> 'session_id')::uuid;
  IF (claims ->> 'exp')::numeric <= extract(epoch FROM checked_at)
    OR (claims ->> 'iat')::numeric > floor(extract(epoch FROM checked_at))
    OR (claims ->> 'iat')::numeric >= (claims ->> 'exp')::numeric
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = request_session AND s.user_id = auth.uid()
      AND (s.not_after IS NULL OR s.not_after > checked_at))
  THEN RETURN NULL; END IF;
  IF claims ->> 'aal' = 'aal2' AND NOT mmhr_private.r1_session_is_aal2(auth.uid(),request_session,checked_at)
  THEN RETURN NULL; END IF;
  SELECT i.id INTO actor FROM public.identities i
    WHERE i.auth_user_id = auth.uid() AND mmhr_private.r1_verified_identity(i.id,false)
      AND (i.authorization_not_before IS NULL
        OR (claims ->> 'iat')::numeric > floor(extract(epoch FROM i.authorization_not_before))
          AND EXISTS (
            SELECT 1 FROM auth.sessions s WHERE s.id = request_session AND s.user_id = i.auth_user_id
              AND (s.created_at > i.authorization_not_before OR EXISTS (
                SELECT 1 FROM public.identity_recovery_presence p
                JOIN public.identity_recovery_requests r ON r.id = p.linked_request_id
                JOIN public.identity_admin_intents intent ON intent.recovery_request_id = r.id
                JOIN public.identity_intent_attempts first_attempt ON first_attempt.intent_id = intent.id
                  AND first_attempt.attempt_number = 1 AND first_attempt.mode = 'dispatch'
                WHERE p.target_identity_id = i.id AND p.auth_subject_id = i.auth_user_id
                  AND p.auth_session_id = request_session::text AND p.state = 'completed'
                  AND mmhr_private.r1_worker_uuid_is_valid(p.expected_replacement_factor_id)
                  AND r.recovery_presence_id = p.id AND r.target_identity_id = i.id
                  AND r.state = 'completed' AND r.action = 'mfa_enrollment_reset'
                  AND p.completed_at >= r.completed_at AND p.completed_at <= checked_at
                  AND intent.target_identity_id = i.id AND intent.auth_subject_id = i.auth_user_id
                  AND intent.initiated_by_identity_id = r.initiated_by_identity_id
                  AND intent.operation = 'mfa_enrollment_reset' AND intent.state = 'succeeded'
                  AND intent.result_code = 'mfa_zero_factors' AND intent.confirmed_factor_count = 0
                  AND intent.dispatch_count = 1 AND intent.completed_at = r.completed_at
                  AND first_attempt.started_at = i.authorization_not_before
                  AND mmhr_private.r1_identity_intent_history_is_valid(intent)
              ))
          ));
  RETURN actor;
END
$$;--> statement-breakpoint

-- Durable capacity checks are not request authorization. Freeze all AAL2
-- permission reads as well as writes while a reset target is contained.
CREATE OR REPLACE FUNCTION mmhr_private.r1_request_has_permission(
  permission_key text, organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE actor uuid := mmhr_private.r1_request_identity_id();
BEGIN
  IF actor IS NULL OR EXISTS (
    SELECT 1 FROM public.permission_definitions d WHERE d.key = permission_key
      AND d.minimum_assurance = 'aal2'
      AND EXISTS (SELECT 1 FROM public.identities i WHERE i.status = 'recovery_pending')
  ) THEN RETURN false; END IF;
  RETURN mmhr_private.r1_evaluate_permission(actor,permission_key,organization_id,
    auth.jwt() ->> 'aal',statement_timestamp(),false);
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_protect_identity_intent_attempt()
RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.completed_at IS NOT NULL OR NEW.completed_at IS NULL
    OR ROW(NEW.id,NEW.intent_id,NEW.attempt_number,NEW.mode,NEW.lease_token,NEW.correlation_id,
      NEW.started_at,NEW.lease_expires_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.intent_id,OLD.attempt_number,OLD.mode,OLD.lease_token,OLD.correlation_id,
      OLD.started_at,OLD.lease_expires_at)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER identity_intent_attempt_history BEFORE UPDATE OR DELETE ON public.identity_intent_attempts
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_protect_identity_intent_attempt();--> statement-breakpoint
CREATE TRIGGER identity_intent_attempt_no_truncate BEFORE TRUNCATE ON public.identity_intent_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_protect_identity_intent()
RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE retry_allowed boolean;
BEGIN
  IF TG_OP <> 'UPDATE'
    OR ROW(NEW.id,NEW.operation,NEW.target_identity_id,NEW.invitation_id,NEW.recovery_request_id,
      NEW.idempotency_key,NEW.correlation_id,NEW.initiated_by_identity_id,NEW.auth_subject_id,
      NEW.maximum_attempts,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.operation,OLD.target_identity_id,OLD.invitation_id,OLD.recovery_request_id,
      OLD.idempotency_key,OLD.correlation_id,OLD.initiated_by_identity_id,OLD.auth_subject_id,
      OLD.maximum_attempts,OLD.created_at)
    OR NEW.attempt_count < OLD.attempt_count OR NEW.attempt_count > OLD.attempt_count + 1
    OR NEW.dispatch_count < OLD.dispatch_count OR NEW.dispatch_count > OLD.dispatch_count + 1
    OR OLD.state IN ('succeeded','cancelled')
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  retry_allowed := OLD.operation = 'invitation_delivery' AND OLD.state = 'failed'
    AND OLD.safe_error_code IS NOT DISTINCT FROM 'provider_rejected' AND NOT OLD.manual_review_required
    AND OLD.next_attempt_at IS NOT NULL AND OLD.next_attempt_at <= clock_timestamp()
    AND EXISTS (SELECT 1 FROM public.identity_intent_attempts a WHERE a.intent_id = OLD.id
      AND a.attempt_number = OLD.attempt_count AND a.mode = 'dispatch' AND a.outcome = 'failed'
      AND a.safe_error_code = 'provider_rejected' AND a.next_action = 'retry' AND a.completed_at IS NOT NULL);
  IF OLD.state = 'failed' AND NOT (retry_allowed AND NEW.state = 'in_flight')
    OR NEW.state IS DISTINCT FROM OLD.state AND NOT (
      OLD.state = 'pending' AND NEW.state IN ('in_flight','cancelled')
      OR OLD.state = 'in_flight' AND NEW.state IN ('succeeded','failed','outcome_unknown')
      OR OLD.state = 'outcome_unknown' AND NEW.state IN ('succeeded','failed')
      OR retry_allowed AND NEW.state = 'in_flight'
    )
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER identity_admin_intents_state_transition ON public.identity_admin_intents;--> statement-breakpoint
CREATE TRIGGER identity_admin_intent_history BEFORE UPDATE OR DELETE ON public.identity_admin_intents
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_protect_identity_intent();--> statement-breakpoint
CREATE TRIGGER identity_admin_intent_no_truncate BEFORE TRUNCATE ON public.identity_admin_intents
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_identity_intent_context_is_valid(intent public.identity_admin_intents)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT mmhr_private.r1_worker_uuid_is_valid(($1).id::text)
    AND mmhr_private.r1_worker_uuid_is_valid(($1).correlation_id::text)
    AND mmhr_private.r1_worker_uuid_is_valid(($1).initiated_by_identity_id::text)
    AND ($1).maximum_attempts BETWEEN 1 AND 5
    AND (mmhr_private.r1_worker_uuid_is_valid(($1).idempotency_key) OR ($1).idempotency_key ~ '^[0-9a-f]{64}$')
    AND (($1).operation = 'invitation_delivery' AND ($1).invitation_id IS NOT NULL
      OR ($1).operation = 'mfa_enrollment_reset' AND mmhr_private.r1_worker_uuid_is_valid(($1).auth_subject_id::text)
        AND ($1).target_identity_id IS NOT NULL AND ($1).recovery_request_id IS NOT NULL)
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_identity_intent_history_is_valid(intent public.identity_admin_intents)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  latest public.identity_intent_attempts%ROWTYPE;
  previous public.identity_intent_attempts%ROWTYPE;
  recorded_count integer;
  recorded_dispatches integer;
  last_dispatch_at timestamptz;
BEGIN
  SELECT count(*),count(*) FILTER (WHERE a.mode = 'dispatch'),max(a.started_at) FILTER (WHERE a.mode = 'dispatch')
    INTO recorded_count,recorded_dispatches,last_dispatch_at
    FROM public.identity_intent_attempts a WHERE a.intent_id = intent.id;
  IF intent.attempt_count = 0 THEN
    RETURN intent.state = 'pending' AND intent.dispatch_count = 0 AND recorded_count = 0
      AND intent.lease_token IS NULL AND intent.work_mode IS NULL;
  END IF;
  IF recorded_count <> intent.attempt_count OR recorded_dispatches <> intent.dispatch_count
    OR intent.dispatch_count < 1 OR intent.attempt_count > intent.maximum_attempts
    OR intent.claimed_at IS DISTINCT FROM last_dispatch_at
    OR NOT EXISTS (SELECT 1 FROM public.identity_intent_attempts a
      WHERE a.intent_id = intent.id AND a.attempt_number = 1 AND a.mode = 'dispatch')
    OR EXISTS (SELECT 1 FROM public.identity_intent_attempts a WHERE a.intent_id = intent.id
      AND (a.attempt_number > intent.attempt_count OR a.correlation_id IS DISTINCT FROM intent.correlation_id
        OR a.started_at < intent.created_at
        OR a.attempt_number < intent.attempt_count AND a.completed_at IS NULL))
    OR EXISTS (
      SELECT 1 FROM public.identity_intent_attempts a
      JOIN public.identity_intent_attempts prior ON prior.intent_id = a.intent_id
        AND prior.attempt_number = a.attempt_number - 1
      WHERE a.intent_id = intent.id AND (
        prior.completed_at IS NULL OR prior.completed_at > a.started_at
        OR a.mode = 'dispatch' AND NOT (intent.operation = 'invitation_delivery'
          AND prior.mode = 'dispatch' AND prior.outcome IS NOT DISTINCT FROM 'failed'
          AND prior.safe_error_code IS NOT DISTINCT FROM 'provider_rejected' AND prior.next_action IS NOT DISTINCT FROM 'retry')
        OR a.mode = 'reconciliation' AND NOT (prior.outcome IS NOT DISTINCT FROM 'outcome_unknown'
          AND prior.next_action IS NOT DISTINCT FROM 'reconcile')
      )
    )
  THEN RETURN false; END IF;
  SELECT * INTO latest FROM public.identity_intent_attempts a
    WHERE a.intent_id = intent.id AND a.attempt_number = intent.attempt_count;
  IF NOT FOUND THEN RETURN false; END IF;
  IF intent.lease_token IS NOT NULL THEN
    IF latest.lease_token IS DISTINCT FROM intent.lease_token OR latest.mode IS DISTINCT FROM intent.work_mode
      OR latest.lease_expires_at IS DISTINCT FROM intent.lease_expires_at OR latest.completed_at IS NOT NULL
    THEN RETURN false; END IF;
    IF intent.work_mode = 'dispatch' THEN RETURN intent.state = 'in_flight'; END IF;
    SELECT * INTO previous FROM public.identity_intent_attempts a
      WHERE a.intent_id = intent.id AND a.attempt_number = intent.attempt_count - 1;
    RETURN FOUND AND intent.state = 'outcome_unknown' AND previous.outcome = 'outcome_unknown'
      AND previous.completed_at IS NOT DISTINCT FROM intent.completed_at
      AND previous.safe_error_code IS NOT DISTINCT FROM intent.safe_error_code;
  END IF;
  RETURN intent.work_mode IS NULL AND latest.completed_at IS NOT NULL
    AND latest.outcome IS NOT DISTINCT FROM intent.state::text
    AND latest.completed_at IS NOT DISTINCT FROM intent.completed_at
    AND latest.safe_error_code IS NOT DISTINCT FROM intent.safe_error_code
    AND latest.result_code IS NOT DISTINCT FROM intent.result_code;
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_identity_intent_audit(
  intent public.identity_admin_intents, action_key text, before_state text, after_state text, checked_at timestamptz
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_events(actor_type,actor_identity_id,actor_reference,command,action,
    entity_type,entity_id,reason,correlation_id,idempotency_key,before_summary,after_summary,occurred_at)
  VALUES('worker',intent.initiated_by_identity_id,'identity-intent-worker','identity.intent.process',action_key,
    'identity_intent',intent.id::text,'Process the existing authorized identity intent',intent.correlation_id,
    intent.idempotency_key,jsonb_build_object('state',before_state),jsonb_build_object('state',after_state),checked_at);
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_identity_intent_claim_json(intent public.identity_admin_intents)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE result jsonb; email text;
BEGIN
  result := jsonb_build_object('intentId',intent.id,'correlationId',intent.correlation_id,
    'idempotencyKey',intent.idempotency_key,'leaseToken',intent.lease_token,
    'leaseExpiresAt',to_char(intent.lease_expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'attemptNumber',intent.attempt_count,'maximumAttempts',intent.maximum_attempts,'operation',intent.operation);
  IF intent.operation = 'mfa_enrollment_reset' THEN
    RETURN result || jsonb_build_object('subjectId',intent.auth_subject_id);
  END IF;
  SELECT i.normalized_email INTO email FROM public.invitations i WHERE i.id = intent.invitation_id;
  RETURN result || jsonb_build_object('email',email);
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_recovery_intent_is_ready(intent public.identity_admin_intents, checked_at timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT mmhr_private.r1_recovery_policy_is_prepared()
    AND NOT EXISTS (SELECT 1 FROM public.identities i WHERE i.status = 'recovery_pending') AND EXISTS (
    SELECT 1 FROM public.identity_recovery_requests r
    JOIN public.identity_recovery_presence p ON p.id = r.recovery_presence_id
    JOIN public.identity_recovery_approvals a ON a.request_id = r.id
    JOIN public.identities target ON target.id = r.target_identity_id
    JOIN public.security_bootstrap_state b ON b.singleton_key = 1
    WHERE r.id = ($1).recovery_request_id AND r.state = 'approved' AND r.action = 'mfa_enrollment_reset'
      AND r.target_identity_id = ($1).target_identity_id AND r.initiated_by_identity_id = ($1).initiated_by_identity_id
      AND r.expires_at > $2 AND r.approved_at <= $2
      AND p.state = 'linked' AND p.linked_request_id = r.id AND p.target_identity_id = target.id
      AND p.auth_subject_id = ($1).auth_subject_id AND target.auth_user_id = p.auth_subject_id
      AND p.linked_at >= p.created_at AND p.linked_at < p.expires_at
      AND p.linked_at = r.created_at AND p.linked_at <= $2
      AND p.auth_session_id ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
      AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id::text = p.auth_session_id
        AND s.user_id = p.auth_subject_id AND (s.not_after IS NULL OR s.not_after > $2))
      AND a.decision = 'approved' AND a.assurance = 'aal2' AND a.pre_existing_contact_attested
      AND a.phone_check_result = 'confirmed' AND a.checked_at BETWEEN r.created_at AND $2
      AND a.evidence_reference ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
      AND a.approver_identity_id <> r.initiated_by_identity_id AND a.approver_identity_id <> r.target_identity_id
      AND a.approver_identity_id IN (b.target_identity_id,b.second_target_identity_id)
      AND r.initiated_by_identity_id IN (b.target_identity_id,b.second_target_identity_id)
      AND (r.target_identity_id NOT IN (b.target_identity_id,b.second_target_identity_id)
        OR r.target_identity_id = r.initiated_by_identity_id)
      AND mmhr_private.r1_verified_identity(target.id,false)
      AND mmhr_private.r1_is_super_admin(b.target_identity_id)
      AND mmhr_private.r1_is_super_admin(b.second_target_identity_id)
      AND mmhr_private.r1_evaluate_permission(r.initiated_by_identity_id,'identity.recovery.request',NULL::uuid,'aal2',$2,false)
      AND mmhr_private.r1_evaluate_permission(a.approver_identity_id,'identity.recovery.approve',NULL::uuid,'aal2',$2,false)
  )
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_invitation_intent_is_ready(intent public.identity_admin_intents, checked_at timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.identities i WHERE i.status = 'recovery_pending') AND EXISTS (
    SELECT 1 FROM public.invitations i JOIN public.orgs o ON o.id = i.org_id
    WHERE i.id = ($1).invitation_id AND i.status = 'pending' AND i.expires_at > $2
      AND i.created_by_identity_id = ($1).initiated_by_identity_id AND i.token IS NULL
      AND length(i.normalized_email) BETWEEN 3 AND 254 AND i.normalized_email = lower(btrim(i.normalized_email))
      AND o.status = 'active' AND NOT o.migration_review_required
      AND mmhr_private.r1_evaluate_permission(($1).initiated_by_identity_id,'org.members.invite',o.id,'aal2',$2,false)
  )
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.mmhr_claim_identity_intent(intent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE intent public.identity_admin_intents%ROWTYPE; checked_at timestamptz; prior_state text;
BEGIN
  IF intent_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input'; END IF;
  checked_at := mmhr_private.r1_lock_security();
  SELECT * INTO intent FROM public.identity_admin_intents i WHERE i.id = intent_id FOR UPDATE;
  IF NOT FOUND OR NOT mmhr_private.r1_identity_intent_context_is_valid(intent)
    OR NOT mmhr_private.r1_identity_intent_history_is_valid(intent)
    OR intent.manual_review_required OR intent.lease_token IS NOT NULL
    OR intent.attempt_count >= intent.maximum_attempts OR intent.state NOT IN ('pending','failed')
    OR intent.next_attempt_at > checked_at
  THEN RETURN NULL; END IF;
  IF intent.state = 'failed' AND NOT (intent.operation = 'invitation_delivery'
    AND intent.safe_error_code IS NOT DISTINCT FROM 'provider_rejected' AND intent.next_attempt_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.identity_intent_attempts a WHERE a.intent_id = intent.id
      AND a.attempt_number = intent.attempt_count AND a.mode = 'dispatch' AND a.outcome = 'failed'
      AND a.safe_error_code = 'provider_rejected' AND a.next_action = 'retry' AND a.completed_at IS NOT NULL))
  THEN RETURN NULL; END IF;
  IF intent.operation = 'mfa_enrollment_reset' THEN
    IF intent.state <> 'pending' OR intent.dispatch_count <> 0 OR intent.attempt_count <> 0
      OR NOT mmhr_private.r1_recovery_intent_is_ready(intent,checked_at)
    THEN RETURN NULL; END IF;
  ELSIF NOT mmhr_private.r1_invitation_intent_is_ready(intent,checked_at) THEN RETURN NULL;
  END IF;
  PERFORM mmhr_private.r1_assert_administration_capacity(checked_at);
  prior_state := intent.state;
  UPDATE public.identity_admin_intents i SET state = 'in_flight',attempt_count = i.attempt_count + 1,
    dispatch_count = i.dispatch_count + 1,claimed_at = checked_at,lease_expires_at = checked_at + interval '15 minutes',
    lease_token = gen_random_uuid(),work_mode = 'dispatch',next_attempt_at = NULL,completed_at = NULL,
    safe_error_code = NULL,result_code = NULL,updated_at = checked_at
  WHERE i.id = intent.id RETURNING * INTO intent;
  INSERT INTO public.identity_intent_attempts(intent_id,attempt_number,mode,lease_token,correlation_id,started_at,lease_expires_at)
  VALUES(intent.id,intent.attempt_count,'dispatch',intent.lease_token,intent.correlation_id,checked_at,intent.lease_expires_at);
  IF intent.operation = 'mfa_enrollment_reset' THEN
    UPDATE public.identities i SET status = 'recovery_pending',authorization_not_before = checked_at,updated_at = checked_at
      WHERE i.id = intent.target_identity_id;
    INSERT INTO public.audit_events(actor_type,actor_identity_id,actor_reference,command,action,entity_type,entity_id,
      reason,correlation_id,idempotency_key,before_summary,after_summary,occurred_at)
    VALUES('worker',intent.initiated_by_identity_id,'identity-intent-worker','identity.intent.process','identity.recovery.contain',
      'identity',intent.target_identity_id::text,'Contain the approved identity before the single reset attempt',
      intent.correlation_id,intent.idempotency_key,jsonb_build_object('status','active'),
      jsonb_build_object('status','recovery_pending'),checked_at);
  END IF;
  PERFORM mmhr_private.r1_identity_intent_audit(intent,'identity.intent.dispatch',prior_state,'in_flight',checked_at);
  RETURN mmhr_private.r1_identity_intent_claim_json(intent);
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION mmhr_private.r1_worker_uuid_is_valid(text),mmhr_private.r1_recovery_policy_is_prepared(),
  mmhr_private.r1_request_identity_id(),mmhr_private.r1_request_has_permission(text,uuid),
  mmhr_private.r1_prepare_recovery_policy(uuid,uuid,uuid,uuid,uuid,uuid,uuid),
  mmhr_private.r1_protect_identity_intent_attempt(),mmhr_private.r1_protect_identity_intent(),
  mmhr_private.r1_identity_intent_context_is_valid(public.identity_admin_intents),
  mmhr_private.r1_identity_intent_history_is_valid(public.identity_admin_intents),
  mmhr_private.r1_identity_intent_audit(public.identity_admin_intents,text,text,text,timestamptz),
  mmhr_private.r1_identity_intent_claim_json(public.identity_admin_intents),
  mmhr_private.r1_recovery_intent_is_ready(public.identity_admin_intents,timestamptz),
  mmhr_private.r1_invitation_intent_is_ready(public.identity_admin_intents,timestamptz),
  mmhr_private.mmhr_claim_identity_intent(uuid)
FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;

--> statement-breakpoint
CREATE FUNCTION mmhr_private.mmhr_claim_identity_intent_reconciliation(intent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE intent public.identity_admin_intents%ROWTYPE; checked_at timestamptz; prior_state text;
BEGIN
  IF intent_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input'; END IF;
  checked_at := mmhr_private.r1_lock_security();
  SELECT * INTO intent FROM public.identity_admin_intents i WHERE i.id = intent_id FOR UPDATE;
  IF NOT FOUND OR NOT mmhr_private.r1_identity_intent_context_is_valid(intent)
    OR intent.manual_review_required OR intent.state NOT IN ('in_flight','outcome_unknown')
    OR intent.state = 'in_flight' AND intent.lease_token IS NULL
    OR intent.next_attempt_at > checked_at
    OR intent.lease_token IS NOT NULL AND intent.lease_expires_at > checked_at
  THEN RETURN NULL; END IF;
  IF NOT mmhr_private.r1_identity_intent_history_is_valid(intent) THEN
    IF intent.lease_token IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
    END IF;
    RETURN NULL;
  END IF;
  IF intent.lease_token IS NOT NULL THEN
    prior_state := intent.state;
    UPDATE public.identity_intent_attempts a SET completed_at = checked_at,outcome = 'outcome_unknown',
      safe_error_code = 'lease_expired',next_action = CASE WHEN intent.attempt_count >= intent.maximum_attempts
        THEN 'manual_review' ELSE 'reconcile' END
      WHERE a.intent_id = intent.id AND a.lease_token = intent.lease_token AND a.completed_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    UPDATE public.identity_admin_intents i SET state = 'outcome_unknown',completed_at = checked_at,
      safe_error_code = 'lease_expired',lease_token = NULL,work_mode = NULL,
      manual_review_required = i.attempt_count >= i.maximum_attempts,updated_at = checked_at
      WHERE i.id = intent.id RETURNING * INTO intent;
    PERFORM mmhr_private.r1_identity_intent_audit(intent,'identity.intent.lease_expired',prior_state,'outcome_unknown',checked_at);
  END IF;
  IF intent.attempt_count >= intent.maximum_attempts OR intent.manual_review_required THEN RETURN NULL; END IF;
  -- Reconciliation cannot execute a provider write. It deliberately does not
  -- depend on an expired approval or an issuer who has since lost authority.
  UPDATE public.identity_admin_intents i SET attempt_count = i.attempt_count + 1,
    lease_expires_at = checked_at + interval '15 minutes',lease_token = gen_random_uuid(),
    work_mode = 'reconciliation',next_attempt_at = NULL,updated_at = checked_at
    WHERE i.id = intent.id RETURNING * INTO intent;
  INSERT INTO public.identity_intent_attempts(intent_id,attempt_number,mode,lease_token,correlation_id,started_at,lease_expires_at)
  VALUES(intent.id,intent.attempt_count,'reconciliation',intent.lease_token,intent.correlation_id,checked_at,intent.lease_expires_at);
  PERFORM mmhr_private.r1_identity_intent_audit(intent,'identity.intent.reconcile','outcome_unknown','outcome_unknown',checked_at);
  RETURN mmhr_private.r1_identity_intent_claim_json(intent);
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.mmhr_record_identity_intent_result(intent_id uuid, lease_token text, outcome jsonb)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  intent public.identity_admin_intents%ROWTYPE;
  attempt public.identity_intent_attempts%ROWTYPE;
  checked_at timestamptz;
  observed_at timestamptz;
  result_state text;
  v_result_code text;
  error_code text;
  v_next_action text;
  expected_keys text[];
  actual_keys text[];
  next_attempt timestamptz;
  manual_review boolean := false;
  prior_state text;
BEGIN
  IF intent_id IS NULL OR lease_token IS NULL
    OR lease_token !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR outcome IS NULL OR jsonb_typeof(outcome) <> 'object'
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input'; END IF;
  -- An old transaction snapshot can hide a factor committed before the Auth
  -- row lock. Each provider observation must use a fresh Read Committed view.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied';
  END IF;
  checked_at := mmhr_private.r1_lock_security();
  SELECT * INTO intent FROM public.identity_admin_intents i WHERE i.id = intent_id FOR UPDATE;
  IF NOT FOUND OR intent.lease_token IS DISTINCT FROM lease_token::uuid
    OR intent.state NOT IN ('in_flight','outcome_unknown') OR intent.work_mode IS NULL
  THEN RETURN 'stale_lease'; END IF;
  SELECT * INTO attempt FROM public.identity_intent_attempts a WHERE a.intent_id = intent.id
    AND a.lease_token = intent.lease_token AND a.attempt_number = intent.attempt_count AND a.completed_at IS NULL;
  IF NOT FOUND OR attempt.mode <> intent.work_mode OR attempt.correlation_id <> intent.correlation_id
    OR NOT mmhr_private.r1_identity_intent_context_is_valid(intent)
    OR NOT mmhr_private.r1_identity_intent_history_is_valid(intent)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  result_state := outcome ->> 'outcome';
  IF result_state = 'succeeded' THEN
    v_result_code := outcome ->> 'resultCode';
    v_next_action := 'none';
    IF intent.operation = 'invitation_delivery' THEN
      expected_keys := ARRAY['outcome','resultCode'];
      IF intent.work_mode <> 'dispatch' OR v_result_code IS DISTINCT FROM 'invitation_provider_accepted'
      THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input'; END IF;
    ELSE
      expected_keys := ARRAY['confirmedFactorCount','observedAt','outcome','resultCode'];
      IF v_result_code IS DISTINCT FROM 'mfa_zero_factors' OR outcome -> 'confirmedFactorCount' IS DISTINCT FROM '0'::jsonb
        OR jsonb_typeof(outcome -> 'observedAt') IS DISTINCT FROM 'string'
        OR coalesce(outcome ->> 'observedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input'; END IF;
      BEGIN
        observed_at := (outcome ->> 'observedAt')::timestamptz;
      EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input';
      END;
      -- Factor inserts take a foreign-key KEY SHARE lock on this Auth row.
      -- FOR UPDATE holds the zero-factor observation through request completion.
      PERFORM 1 FROM auth.users u WHERE u.id = intent.auth_subject_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
      checked_at := clock_timestamp();
      IF observed_at < date_trunc('milliseconds',attempt.started_at) OR observed_at > checked_at
        OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = intent.auth_subject_id
          AND u.deleted_at IS NULL AND NOT u.is_anonymous)
        OR EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = intent.auth_subject_id)
        OR NOT EXISTS (
          SELECT 1 FROM public.identity_recovery_requests r
          JOIN public.identity_recovery_presence p ON p.id = r.recovery_presence_id
          JOIN public.identities i ON i.id = r.target_identity_id
          WHERE r.id = intent.recovery_request_id AND r.state = 'approved'
            AND r.target_identity_id = intent.target_identity_id AND r.initiated_by_identity_id = intent.initiated_by_identity_id
            AND p.state = 'linked' AND p.linked_request_id = r.id AND p.target_identity_id = i.id
            AND p.auth_subject_id = intent.auth_subject_id AND i.auth_user_id = intent.auth_subject_id
            AND i.status = 'recovery_pending' AND i.authorization_not_before IS NOT NULL
        )
      THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
    END IF;
  ELSIF result_state = 'failed' THEN
    expected_keys := ARRAY['code','outcome','retry'];
    error_code := outcome ->> 'code';
    IF intent.work_mode <> 'dispatch'
      OR coalesce(error_code,'') NOT IN ('invalid_request','provider_unavailable','provider_rejected',
        'provider_response_invalid','reset_limit_exceeded','factors_remaining')
      OR coalesce(outcome ->> 'retry','') NOT IN ('safe','never','manual_review')
      OR outcome ->> 'retry' = 'safe' AND (intent.operation <> 'invitation_delivery' OR error_code <> 'provider_rejected')
    THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input'; END IF;
    IF outcome ->> 'retry' = 'safe' AND intent.attempt_count < intent.maximum_attempts THEN
      v_next_action := 'retry';
      next_attempt := checked_at + interval '30 seconds' * power(2,intent.attempt_count - 1);
    ELSE
      manual_review := outcome ->> 'retry' <> 'never' OR intent.operation = 'mfa_enrollment_reset';
      v_next_action := CASE WHEN manual_review THEN 'manual_review' ELSE 'none' END;
    END IF;
  ELSIF result_state = 'outcome_unknown' THEN
    expected_keys := ARRAY['code','nextAction','outcome'];
    error_code := outcome ->> 'code';
    IF coalesce(error_code,'') NOT IN ('provider_outcome_unknown','provider_response_invalid','factors_remaining','delivery_unverifiable')
      OR coalesce(outcome ->> 'nextAction','') NOT IN ('reconcile','manual_review')
    THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input'; END IF;
    manual_review := outcome ->> 'nextAction' = 'manual_review' OR intent.attempt_count >= intent.maximum_attempts
      OR intent.operation = 'invitation_delivery';
    v_next_action := CASE WHEN manual_review THEN 'manual_review' ELSE 'reconcile' END;
    IF NOT manual_review THEN next_attempt := checked_at + interval '30 seconds' * power(2,intent.attempt_count - 1); END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input';
  END IF;
  SELECT array_agg(key ORDER BY key) INTO actual_keys FROM jsonb_object_keys(outcome) AS key;
  SELECT array_agg(key ORDER BY key) INTO expected_keys FROM unnest(expected_keys) AS key;
  IF actual_keys IS DISTINCT FROM expected_keys THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid security command input';
  END IF;
  prior_state := intent.state;
  UPDATE public.identity_intent_attempts a SET completed_at = checked_at,outcome = result_state,
    safe_error_code = error_code,result_code = v_result_code,next_action = v_next_action
    WHERE a.id = attempt.id;
  UPDATE public.identity_admin_intents i SET state = result_state::public.identity_intent_state,
    completed_at = checked_at,safe_error_code = error_code,result_code = v_result_code,
    confirmed_factor_count = CASE WHEN v_result_code = 'mfa_zero_factors' THEN 0 ELSE NULL END,
    next_attempt_at = next_attempt,manual_review_required = manual_review,lease_token = NULL,work_mode = NULL,updated_at = checked_at
    WHERE i.id = intent.id RETURNING * INTO intent;
  IF result_state = 'succeeded' AND intent.operation = 'mfa_enrollment_reset' THEN
    UPDATE public.identity_recovery_requests r SET state = 'completed',completed_at = checked_at,updated_at = checked_at
      WHERE r.id = intent.recovery_request_id;
    INSERT INTO public.audit_events(actor_type,actor_identity_id,actor_reference,command,action,entity_type,entity_id,
      reason,correlation_id,idempotency_key,before_summary,after_summary,occurred_at)
    VALUES('worker',intent.initiated_by_identity_id,'identity-intent-worker','identity.intent.process','identity.recovery.reset_confirmed',
      'identity_recovery_request',intent.recovery_request_id::text,'Confirm zero factors without reactivating the identity',
      intent.correlation_id,intent.idempotency_key,jsonb_build_object('state','approved'),jsonb_build_object('state','completed'),checked_at);
  END IF;
  PERFORM mmhr_private.r1_identity_intent_audit(intent,'identity.intent.result',prior_state,result_state,checked_at);
  RETURN 'recorded';
END
$$;--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_protect_invitation_binding()
RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF ROW(NEW.id,NEW.org_id,NEW.email,NEW.normalized_email,NEW.role,NEW.role_key,
      NEW.created_by_identity_id,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.org_id,OLD.email,OLD.normalized_email,OLD.role,OLD.role_key,
      OLD.created_by_identity_id,OLD.created_at,OLD.expires_at)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER invitations_fixed_binding BEFORE UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_protect_invitation_binding();--> statement-breakpoint
CREATE TRIGGER recovery_approval_history BEFORE UPDATE OR DELETE ON public.identity_recovery_approvals
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint
CREATE TRIGGER recovery_approval_no_truncate BEFORE TRUNCATE ON public.identity_recovery_approvals
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_protect_recovery_presence_binding()
RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.state IN ('completed','expired','cancelled')
    OR ROW(NEW.id,NEW.target_identity_id,NEW.auth_subject_id,NEW.auth_session_id,
      NEW.opaque_reference_hash,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.target_identity_id,OLD.auth_subject_id,OLD.auth_session_id,
      OLD.opaque_reference_hash,OLD.created_at,OLD.expires_at)
    OR OLD.linked_request_id IS NOT NULL AND ROW(NEW.linked_request_id,NEW.linked_at)
      IS DISTINCT FROM ROW(OLD.linked_request_id,OLD.linked_at)
    OR OLD.linked_request_id IS NULL AND NEW.linked_request_id IS NOT NULL AND NOT (
      OLD.state = 'pending' AND NEW.state = 'linked' AND NEW.linked_at >= OLD.created_at
      AND NEW.linked_at < OLD.expires_at AND EXISTS (
        SELECT 1 FROM public.identity_recovery_requests r WHERE r.id = NEW.linked_request_id
          AND r.recovery_presence_id = NEW.id AND r.target_identity_id = NEW.target_identity_id
          AND r.created_at = NEW.linked_at
      ))
    OR OLD.expected_replacement_factor_id IS NOT NULL
      AND NEW.expected_replacement_factor_id IS DISTINCT FROM OLD.expected_replacement_factor_id
    OR OLD.expected_replacement_factor_id IS NULL AND NEW.expected_replacement_factor_id IS NOT NULL AND NOT (
      OLD.state = 'linked' AND NEW.state = 'linked'
      AND NEW.expected_replacement_factor_id ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    )
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER recovery_presence_fixed_binding BEFORE UPDATE OR DELETE ON public.identity_recovery_presence
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_protect_recovery_presence_binding();--> statement-breakpoint
CREATE TRIGGER recovery_presence_no_truncate BEFORE TRUNCATE ON public.identity_recovery_presence
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_protect_recovery_request_binding()
RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.state IN ('completed','expired','cancelled')
    OR ROW(NEW.id,NEW.target_identity_id,NEW.recovery_presence_id,NEW.initiated_by_identity_id,
      NEW.action,NEW.reason,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.target_identity_id,OLD.recovery_presence_id,OLD.initiated_by_identity_id,
      OLD.action,OLD.reason,OLD.created_at,OLD.expires_at)
    OR OLD.approved_at IS NOT NULL AND NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR OLD.approved_at IS NULL AND NEW.approved_at IS NOT NULL
      AND NOT (OLD.state = 'pending' AND NEW.state = 'approved')
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER recovery_request_fixed_binding BEFORE UPDATE OR DELETE ON public.identity_recovery_requests
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_protect_recovery_request_binding();--> statement-breakpoint
CREATE TRIGGER recovery_request_no_truncate BEFORE TRUNCATE ON public.identity_recovery_requests
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();--> statement-breakpoint

CREATE FUNCTION mmhr_private.r1_protect_authorization_fence()
RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF OLD.authorization_not_before IS NOT NULL
    AND (NEW.authorization_not_before IS NULL OR NEW.authorization_not_before < OLD.authorization_not_before)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Security command denied'; END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER identity_authorization_fence_monotonic BEFORE UPDATE OF authorization_not_before ON public.identities
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_protect_authorization_fence();--> statement-breakpoint

REVOKE ALL ON FUNCTION mmhr_private.mmhr_claim_identity_intent_reconciliation(uuid),
  mmhr_private.mmhr_record_identity_intent_result(uuid,text,jsonb),mmhr_private.r1_protect_invitation_binding(),
  mmhr_private.r1_protect_recovery_presence_binding(),mmhr_private.r1_protect_recovery_request_binding(),
  mmhr_private.r1_protect_authorization_fence()
FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT USAGE ON SCHEMA mmhr_private TO mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mmhr_private.mmhr_claim_identity_intent(uuid),
  mmhr_private.mmhr_claim_identity_intent_reconciliation(uuid),mmhr_private.mmhr_record_identity_intent_result(uuid,text,jsonb)
TO mmhr_worker;
