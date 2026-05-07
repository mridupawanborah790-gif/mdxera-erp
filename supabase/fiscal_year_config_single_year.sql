-- Normalize Fiscal Year Configuration to single-year (YYYY) format.
-- Fields handled:
--  - fiscalYearStartDate
--  - fiscalYearEndDate
--  - currentFiscalYear
--  - voucherNumberingMode
--  - autoFiscalYearDetection
--  - allowBackdatedEntry
--  - lockPreviousFiscalYear

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'configurations'
      AND column_name = 'fiscal_year_config'
  ) THEN
    ALTER TABLE public.configurations
      ADD COLUMN fiscal_year_config jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

UPDATE public.configurations
SET fiscal_year_config = jsonb_build_object(
  'fiscalYearStartDate', COALESCE(fiscal_year_config->>'fiscalYearStartDate', to_char(make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 4, 1), 'YYYY-MM-DD')),
  'fiscalYearEndDate', COALESCE(fiscal_year_config->>'fiscalYearEndDate', to_char(make_date((EXTRACT(YEAR FROM CURRENT_DATE)::int) + 1, 3, 31), 'YYYY-MM-DD')),
  'currentFiscalYear',
    CASE
      WHEN COALESCE(fiscal_year_config->>'currentFiscalYear', '') ~ '^\d{4}$'
        THEN fiscal_year_config->>'currentFiscalYear'
      WHEN COALESCE(fiscal_year_config->>'currentFiscalYear', '') ~ '^\d{4}-\d{4}$'
        THEN split_part(fiscal_year_config->>'currentFiscalYear', '-', 1)
      WHEN COALESCE(fiscal_year_config->>'fiscalYearStartDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
        THEN split_part(fiscal_year_config->>'fiscalYearStartDate', '-', 1)
      ELSE to_char(make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 4, 1), 'YYYY')
    END,
  'voucherNumberingMode', COALESCE(NULLIF(fiscal_year_config->>'voucherNumberingMode', ''), 'reset'),
  'autoFiscalYearDetection', COALESCE((fiscal_year_config->>'autoFiscalYearDetection')::boolean, true),
  'allowBackdatedEntry', COALESCE((fiscal_year_config->>'allowBackdatedEntry')::boolean, true),
  'lockPreviousFiscalYear', COALESCE((fiscal_year_config->>'lockPreviousFiscalYear')::boolean, false)
);

-- Optional hard validation (uncomment if strict DB-level guard is required):
-- ALTER TABLE public.configurations
-- ADD CONSTRAINT chk_fy_current_year_yyyy
-- CHECK ((fiscal_year_config->>'currentFiscalYear') ~ '^\\d{4}$');
