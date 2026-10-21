-- R7: enforce one commission event for each signed contract within an organization.
-- Existing duplicate rows must be resolved before this migration can apply.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.commission_events
    GROUP BY organization_id, contract_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Cannot enforce one commission event per contract: duplicate commission events exist';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS commission_events_contract_uq
  ON public.commission_events (organization_id, contract_id);
