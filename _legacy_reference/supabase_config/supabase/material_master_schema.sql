
-- ========================================================
-- MEDIMART RETAIL ERP: MATERIAL MASTER (CENTRAL SKU) SCHEMA
-- This is the authoritative table for the Global SKU Catalog.
-- Handles composition, pricing tiers, and statutory compliance.
-- ========================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. SECURITY HELPER
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  -- Lookup organization identity linked to the current authenticated user
  SELECT organization_id::text INTO found_org_id FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 3. DROP AND RECREATE MATERIAL_MASTER
-- Check for both table and view to prevent conflict errors
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'material_master' AND c.relkind = 'v') THEN
        DROP VIEW public.material_master CASCADE;
    ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'material_master' AND c.relkind = 'r') THEN
        DROP TABLE public.material_master CASCADE;
    END IF;
END $$;

CREATE TABLE public.material_master (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Identity & Search
    name text NOT NULL,
    material_code text NOT NULL, -- Internal SKU Identifier (e.g., SKU-1001)
    barcode text,
    brand text,
    manufacturer text,
    marketer text,
    
    -- Pharmaceutical Specifications
    composition text, -- Salt / Chemical formula
    pack text, -- e.g., "10's", "100ml Bottle"
    description text,
    directions text, -- Usage instructions (e.g., "1-0-1 after meals")
    storage text,
    uses text,
    side_effects text,
    benefits text,
    
    -- Pricing & Tiers
    mrp numeric DEFAULT 0, -- Standard Maximum Retail Price
    rate_a numeric DEFAULT 0, -- Tier A Custom Rate
    rate_b numeric DEFAULT 0, -- Tier B Custom Rate
    rate_c numeric DEFAULT 0, -- Tier C Custom Rate
    
    -- Statutory & Tax
    gst_rate numeric DEFAULT 12,
    hsn_code text,
    
    -- Controls
    is_prescription_required boolean DEFAULT true,
    is_active boolean DEFAULT true,
    country_of_origin text DEFAULT 'India',
    
    -- Metadata
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    -- Unique constraint per organization
    CONSTRAINT material_master_code_org_unique UNIQUE(organization_id, material_code)
);

-- 4. PERFORMANCE INDEXING
CREATE INDEX IF NOT EXISTS idx_mat_master_org ON public.material_master(organization_id);
CREATE INDEX IF NOT EXISTS idx_mat_master_name ON public.material_master(lower(name));
CREATE INDEX IF NOT EXISTS idx_mat_master_code ON public.material_master(material_code);
CREATE INDEX IF NOT EXISTS idx_mat_master_comp ON public.material_master USING gin (composition gin_trgm_ops);

-- 5. MULTI-TENANT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.material_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org isolation for material_master" ON public.material_master;

CREATE POLICY "Org isolation for material_master"
ON public.material_master FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- 6. AUTOMATED TIMESTAMP TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_update_mat_master_modtime ON public.material_master;
CREATE TRIGGER tr_update_mat_master_modtime 
BEFORE UPDATE ON public.material_master 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. LEGACY PROXY VIEW (For backward compatibility)
CREATE OR REPLACE VIEW public.medicine_master AS SELECT * FROM public.material_master;

-- 8. RELOAD API CACHE
NOTIFY pgrst, 'reload schema';
