-- Ensure public.physical_inventory exposes an `id` column expected by the app layer.
-- Safe to run multiple times.

BEGIN;

-- 1) Guarantee `id` column exists.
ALTER TABLE IF EXISTS public.physical_inventory
  ADD COLUMN IF NOT EXISTS id text;

-- 2) Backfill `id` from legacy `voucher_no` when available.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'physical_inventory'
      AND column_name = 'voucher_no'
  ) THEN
    EXECUTE $sql$
      UPDATE public.physical_inventory
      SET id = voucher_no
      WHERE (id IS NULL OR id = '')
        AND voucher_no IS NOT NULL
        AND voucher_no <> ''
    $sql$;
  END IF;
END $do$;

-- 3) Backfill any remaining rows with generated IDs.
UPDATE public.physical_inventory
SET id = gen_random_uuid()::text
WHERE id IS NULL OR id = '';

-- 4) Re-point primary key to `id`.
DO $do$
DECLARE
  pk_name text;
BEGIN
  SELECT c.conname
  INTO pk_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE c.contype = 'p'
    AND n.nspname = 'public'
    AND t.relname = 'physical_inventory';

  IF pk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.physical_inventory DROP CONSTRAINT %I', pk_name);
  END IF;

  EXECUTE 'ALTER TABLE public.physical_inventory ALTER COLUMN id SET NOT NULL';
  EXECUTE 'ALTER TABLE public.physical_inventory ADD PRIMARY KEY (id)';
END $do$;

-- 5) Optional: keep legacy `voucher_no` aligned if column exists.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'physical_inventory'
      AND column_name = 'voucher_no'
  ) THEN
    EXECUTE $sql$
      UPDATE public.physical_inventory
      SET voucher_no = id
      WHERE voucher_no IS NULL OR voucher_no = ''
    $sql$;
  END IF;
END $do$;

COMMIT;

-- Refresh PostgREST/Supabase schema cache.
NOTIFY pgrst, 'reload schema';
