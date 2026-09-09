CREATE TABLE "lead_rate_limits" (
	"rate_key" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_rate_limits_pk" PRIMARY KEY("rate_key","window_started_at"),
	CONSTRAINT "lead_rate_limits_key_ck" CHECK ("lead_rate_limits"."rate_key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "lead_rate_limits_count_ck" CHECK ("lead_rate_limits"."request_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "lead_rate_limits_window_idx" ON "lead_rate_limits" USING btree ("window_started_at");
--> statement-breakpoint

-- Forward: rehearse locally, deploy response handling, then apply this migration.
-- Recovery: contain public capture at the release gate and retain leads/audits.
-- Do not restore an unlimited RPC or delete customer records to recover access.
ALTER TABLE public.lead_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_rate_limits_deny ON public.lead_rate_limits AS RESTRICTIVE
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
--> statement-breakpoint

-- Aggregate data-abuse ceiling: 100 newly accepted leads per UTC 15-minute
-- window. This is NOT per-client network protection. Deployment edge controls
-- must handle that separately. Neither caller headers nor cookies identify a bucket.
-- Keep at most 96 small, non-personal window records per day. No public cleanup
-- path can delete history or contend with arbitrary caller-selected windows.
CREATE FUNCTION mmhr_private.r2a_consume_lead_rate_limit()
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  current_window_started_at timestamptz := to_timestamp(floor(extract(epoch from clock_timestamp()) / 900) * 900);
  accepted_count integer;
BEGIN
  INSERT INTO public.lead_rate_limits AS limits (rate_key, window_started_at, request_count, updated_at)
  VALUES (repeat('0', 64), current_window_started_at, 1, clock_timestamp())
  ON CONFLICT ON CONSTRAINT lead_rate_limits_pk DO UPDATE
    SET request_count = limits.request_count + 1, updated_at = clock_timestamp()
    WHERE limits.request_count < 100
  RETURNING limits.request_count INTO accepted_count;
  RETURN FOUND;
END
$$;
--> statement-breakpoint

-- Keep the table and helpers closed to raw runtime roles. The fixed command
-- below is the only public entry point and owns the durable limit.
REVOKE ALL ON TABLE public.lead_rate_limits FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
REVOKE ALL ON FUNCTION mmhr_private.r2a_consume_lead_rate_limit() FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_create_lead(
  full_name text, company text, work_email text, phone text, source text,
  consent_at timestamptz, idempotency_key uuid
)
RETURNS TABLE (lead_id uuid, status text, owner_identity_id uuid, outcome_code text, correlation_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  event_correlation uuid := gen_random_uuid();
  lead_result record;
BEGIN
  BEGIN
    SELECT * INTO STRICT lead_result FROM mmhr_private.r2a_create_lead_impl(
      full_name, company, work_email, phone, source, consent_at, idempotency_key
    );
    IF lead_result.outcome_code = 'created' THEN
      IF NOT mmhr_private.r2a_consume_lead_rate_limit() THEN
        RAISE EXCEPTION USING ERRCODE = 'P4290', MESSAGE = 'Lead write limit reached';
      END IF;
    END IF;
  EXCEPTION WHEN SQLSTATE 'P4290' THEN
    -- The subtransaction rolls back the provisional lead AND its audit event.
    -- Replays, conflicts and invalid inputs do not consume accepted-write capacity.
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid, 'rate_limited'::text, event_correlation;
    RETURN;
  END;
  RETURN QUERY SELECT lead_result.lead_id, lead_result.status,
    lead_result.owner_identity_id, lead_result.outcome_code, lead_result.correlation_id;
END
$$;

REVOKE ALL ON FUNCTION public.mmhr_create_lead(text, text, text, text, text, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_create_lead(text, text, text, text, text, timestamptz, uuid)
  TO anon, authenticated;
COMMENT ON FUNCTION public.mmhr_create_lead(text, text, text, text, text, timestamptz, uuid)
  IS 'R2A audited lead capture with an aggregate ceiling of 100 accepted writes per 15-minute window; not per-client network protection.';
