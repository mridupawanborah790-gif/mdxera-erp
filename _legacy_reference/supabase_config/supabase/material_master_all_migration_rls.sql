-- RLS hardening for demo migration source table.
-- Supports both the canonical source table name and a quoted legacy/table label: public."material_master_all(migration)".

BEGIN;

-- 1) Ensure canonical source table exists and lock down base privileges.
CREATE TABLE IF NOT EXISTS public.material_master_all (
    id text PRIMARY KEY,
    material_name text NOT NULL,
    item_code text,
    sku text,
    barcode text,
    pack text,
    uom text,
    hsn text,
    gst_rate numeric,
    category text,
    manufacturer text,
    mrp numeric,
    purchase_rate numeric,
    sale_rate numeric,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

REVOKE ALL ON TABLE public.material_master_all FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.material_master_all TO authenticated;
GRANT ALL ON TABLE public.material_master_all TO service_role;

ALTER TABLE public.material_master_all ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_master_all FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS material_master_all_read_authenticated ON public.material_master_all;
DROP POLICY IF EXISTS material_master_all_write_admin_or_service ON public.material_master_all;

CREATE POLICY material_master_all_read_authenticated
ON public.material_master_all
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY material_master_all_write_admin_or_service
ON public.material_master_all
FOR ALL
TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'role') = 'service_role', false)
  OR COALESCE((auth.jwt() ->> 'app_role') IN ('owner', 'admin', 'system'), false)
)
WITH CHECK (
  COALESCE((auth.jwt() ->> 'role') = 'service_role', false)
  OR COALESCE((auth.jwt() ->> 'app_role') IN ('owner', 'admin', 'system'), false)
);

-- 2) Apply the same RLS model if a quoted table exists as public."material_master_all(migration)".
DO $$
BEGIN
  IF to_regclass('public."material_master_all(migration)"') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."material_master_all(migration)" FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public."material_master_all(migration)" TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE public."material_master_all(migration)" TO service_role';

    EXECUTE 'ALTER TABLE public."material_master_all(migration)" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public."material_master_all(migration)" FORCE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS material_master_all_migration_read_authenticated ON public."material_master_all(migration)"';
    EXECUTE 'DROP POLICY IF EXISTS material_master_all_migration_write_admin_or_service ON public."material_master_all(migration)"';

    EXECUTE 'CREATE POLICY material_master_all_migration_read_authenticated ON public."material_master_all(migration)" FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY material_master_all_migration_write_admin_or_service ON public."material_master_all(migration)" FOR ALL TO authenticated USING (COALESCE((auth.jwt() ->> ''role'') = ''service_role'', false) OR COALESCE((auth.jwt() ->> ''app_role'') IN (''owner'', ''admin'', ''system''), false)) WITH CHECK (COALESCE((auth.jwt() ->> ''role'') = ''service_role'', false) OR COALESCE((auth.jwt() ->> ''app_role'') IN (''owner'', ''admin'', ''system''), false))';
  END IF;
END$$;

COMMIT;
