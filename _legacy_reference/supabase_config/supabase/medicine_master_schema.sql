-- ========================================================
-- MEDIMART RETAIL ERP: COMPLETE MEDICINE MASTER SCHEMA
-- Acts as the Global SKU Catalog for the organization.
-- Handles composition tracking, statutory data, and multi-tier rates.
-- ========================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. SECURITY HELPER (Ensures organizational data isolation)
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

-- 3. DROP AND RECREATE MEDICINE_MASTER
-- FIX: Explicitly drop the view first to avoid "is not a table" errors if it was previously created as a proxy
DROP VIEW IF EXISTS public.medicine_master;
DROP TABLE IF EXISTS public.medicine_master CASCADE;

CREATE TABLE public.medicine_master (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL, -- Isolated by Root Organization Identity
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Tracking last modifier
    
    -- Core Identity
    name text NOT NULL,
    material_code text NOT NULL, -- Mandatory SKU Code (unique per org)
    barcode text,
    brand text,
    manufacturer text,
    marketer text,
    
    -- Pharmaceutical Properties
    composition text, -- Salt/Chemical description
    pack text, -- e.g., "10's", "100ml Bottle"
    description text, -- Marketing/therapeutic description
    directions text, -- Usage instructions (e.g., "1-0-1 after meals")
    storage text, -- e.g., "Store in a cool dry place"
    uses text, -- Common therapeutic uses
    side_effects text, -- Potential side effects
    benefits text,
    
    -- Pricing Structure (Base MRP & Tiers)
    mrp numeric DEFAULT 0, -- Default Maximum Retail Price
    rate_a numeric DEFAULT 0, -- Tier A Custom Selling Rate
    rate_b numeric DEFAULT 0, -- Tier B Custom Selling Rate
    rate_c numeric DEFAULT 0, -- Tier C Custom Selling Rate
    
    -- Statutory & Taxation
    gst_rate numeric DEFAULT 12,
    hsn_code text,
    
    -- Operational Controls
    is_prescription_required boolean DEFAULT true,
    is_active boolean DEFAULT true,
    country_of_origin text DEFAULT 'India',
    return_days integer DEFAULT 0, -- Allowable days for sales return
    expiry_duration_months integer DEFAULT 24, -- Standard shelf life for auto-calc
    
    -- System Audit
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    -- Constraints
    CONSTRAINT medicine_master_code_org_unique UNIQUE(organization_id, material_code)
);

-- 4. PERFORMANCE INDEXING
-- Optimized for catalog search and nomenclature mapping
CREATE INDEX IF NOT EXISTS idx_med_master_org ON public.medicine_master(organization_id);
CREATE INDEX IF NOT EXISTS idx_med_master_name ON public.medicine_master(lower(name));
CREATE INDEX IF NOT EXISTS idx_med_master_code ON public.medicine_master(material_code);
CREATE INDEX IF NOT EXISTS idx_med_master_barcode ON public.medicine_master(barcode);
CREATE INDEX IF NOT EXISTS idx_med_master_composition ON public.medicine_master USING gin (composition gin_trgm_ops);

-- 5. MULTI-TENANT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.medicine_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org isolation for medicine_master" ON public.medicine_master;

-- Policy ensures users can only interact with materials belonging to their specific organization
CREATE POLICY "Org isolation for medicine_master"
ON public.medicine_master FOR ALL
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

DROP TRIGGER IF EXISTS tr_update_med_master_modtime ON public.medicine_master;
CREATE TRIGGER tr_update_med_master_modtime 
BEFORE UPDATE ON public.medicine_master 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. METADATA COMMENTS
COMMENT ON TABLE public.medicine_master IS 'Master catalog for all pharmaceutical products (SKUs). Used for inventory creation and nomenclature mapping.';
COMMENT ON COLUMN public.medicine_master.material_code IS 'Organizational unique identifier for the SKU. Used for search and vendor nomenclature linking.';
COMMENT ON COLUMN public.medicine_master.directions IS 'Stores usage instructions which can be automatically printed on invoice dosage slips.';

-- 8. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';