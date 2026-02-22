
-- ========================================================
-- MEDIMART RETAIL ERP: VENDOR NOMENCLATURE SCHEMA (FIXED)
-- Maps supplier-specific item names to internal master SKUs.
-- ========================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. SECURITY HELPER
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  SELECT organization_id::text INTO found_org_id FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 3. SAFE DROP AND RECREATE SUPPLIER_PRODUCT_MAP
DO $$ 
BEGIN
    -- Check if it's a view
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'supplier_product_map' AND c.relkind = 'v') THEN
        DROP VIEW public.supplier_product_map CASCADE;
    -- Check if it's a table
    ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'supplier_product_map' AND c.relkind = 'r') THEN
        DROP TABLE public.supplier_product_map CASCADE;
    END IF;
END $$;

CREATE TABLE public.supplier_product_map (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    
    -- Foreign Key Links
    supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    master_medicine_id uuid NOT NULL REFERENCES public.material_master(id) ON DELETE CASCADE,
    
    -- Nomenclature Details
    supplier_product_name text NOT NULL, -- The "Raw" string found on supplier bills
    
    -- Operational Logic
    auto_apply boolean DEFAULT true,
    
    -- System Audit
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. CASE-INSENSITIVE UNIQUE INDEX (Correct way to handle lower() in uniqueness)
-- This prevents the "syntax error at or near '('" error by moving the logic to an index.
CREATE UNIQUE INDEX idx_spm_unique_mapping 
ON public.supplier_product_map (organization_id, supplier_id, lower(supplier_product_name));

-- 5. PERFORMANCE INDEXING
CREATE INDEX IF NOT EXISTS idx_spm_org ON public.supplier_product_map(organization_id);
CREATE INDEX IF NOT EXISTS idx_spm_master_link ON public.supplier_product_map(master_medicine_id);

-- 6. MULTI-TENANT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.supplier_product_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org isolation for supplier_product_map" ON public.supplier_product_map;

CREATE POLICY "Org isolation for supplier_product_map"
ON public.supplier_product_map FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- 7. AUTOMATED TIMESTAMP TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_update_spm_modtime ON public.supplier_product_map;
CREATE TRIGGER tr_update_spm_modtime 
BEFORE UPDATE ON public.supplier_product_map 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
