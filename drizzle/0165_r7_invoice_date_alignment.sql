-- Proposed replacement for generated ALTER TYPE statements after SQL review.
-- The physical columns have been DATE since 0021. This step records that model.
DO $invoice_date_alignment$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'finance_invoices' AND c.relkind = 'r'
  ) OR (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = pg_catalog.to_regclass('public.finance_invoices')
      AND a.attname IN ('issue_date', 'due_date')
      AND a.attnum > 0 AND NOT a.attisdropped
      AND a.atttypid = 'pg_catalog.date'::pg_catalog.regtype
      AND a.atttypmod = -1 AND NOT a.attnotnull
  ) <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '42804',
      MESSAGE = 'Invoice date schema alignment requires existing nullable DATE columns';
  END IF;
END;
$invoice_date_alignment$;
