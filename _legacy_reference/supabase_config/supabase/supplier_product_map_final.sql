
-- ========================================================
-- MEDIMART RETAIL ERP: DEFINITIVE NOMENCLATURE SCHEMA
-- Fixes persistence and visibility for Supplier Product Mappings
-- ========================================================

-- 1. CLEANUP EXISTING OBJECTS
-- We drop any existing views or tables to ensure a clean state
DROP VIEW IF EXISTS public.distributor_product_map CASCADE;
DROP TABLE IF EXISTS public.supplier_product_map CASCADE;

-- 2. CREATE TABLE
CREATE TABLE public.supplier_product_map (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL, -- Root identity lock
    
    -- Links
    supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    master_medicine_id uuid NOT NULL REFERENCES public.material_master(id) ON DELETE CASCADE,
    
    -- Nomenclature Data
    supplier_product_name text NOT NULL, -- Raw name as it appears on vendor bills
    
    -- Logic
    auto_apply boolean DEFAULT true,
    
    -- Audit
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. CASE-INSENSITIVE UNIQUE INDEX
-- This ensures a vendor can only have one master SKU link per raw product name string
CREATE UNIQUE INDEX idx_spm_unique_mapping 
ON public.supplier_product_map (organization_id, supplier_id, lower(supplier_product_name));

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_spm_org_id ON public.supplier_product_map(organization_id);
CREATE INDEX IF NOT EXISTS idx_spm_supplier_id ON public.supplier_product_map(supplier_id);
CREATE INDEX IF NOT EXISTS idx_spm_master_id ON public.supplier_product_map(master_medicine_id);

-- 5. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.supplier_product_map ENABLE ROW LEVEL SECURITY;

-- Ensure helper exists
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
  SELECT organization_id::text FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Strict Multi-tenant Isolation Policy
DROP POLICY IF EXISTS "Org isolation policy" ON public.supplier_product_map;
CREATE POLICY "Org isolation policy"
ON public.supplier_product_map FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- 6. COMPATIBILITY LAYER
-- Maps the legacy 'distributor' naming to the 'supplier' table
CREATE OR REPLACE VIEW public.distributor_product_map AS 
SELECT * FROM public.supplier_product_map;

-- 7. UPDATED_AT TRIGGER
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
