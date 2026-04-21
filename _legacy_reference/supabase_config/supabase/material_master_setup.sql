
-- ========================================================
-- MEDIMART RETAIL ERP: MATERIAL MASTER TABLE REPLACEMENT
-- Replaces 'medicine_master' with 'material_master'
-- ID type set to TEXT for external ID compatibility
-- ========================================================

-- 1. DROP OLD TABLE
DROP TABLE IF EXISTS public.material_master CASCADE;

-- 2. CREATE NEW MATERIAL_MASTER TABLE
CREATE TABLE IF NOT EXISTS public.material_master (
    id text NOT NULL DEFAULT gen_random_uuid()::text, -- Primary Key as TEXT with string UUID default
    organization_id text NOT NULL,
    user_id uuid NULL,
    
    -- Identity
    name text NOT NULL,
    material_code text NOT NULL, -- Internal SKU Code
    barcode text NULL,
    
    -- Pharmaceutical Details
    composition text NULL,
    pack text NULL,
    manufacturer text NULL,
    marketer text NULL,
    brand text NULL,
    description text NULL,
    directions text NULL, -- Usage instructions (e.g. 1-0-1)
    
    -- Pricing & Statutory
    gst_rate numeric NULL DEFAULT 12,
    hsn_code text NULL,
    mrp text NULL DEFAULT '0'::text, -- Stored as text for flexible formatting
    rate_a numeric NULL DEFAULT 0,
    rate_b numeric NULL DEFAULT 0,
    rate_c numeric NULL DEFAULT 0,
    
    -- Controls
    is_prescription_required boolean NULL DEFAULT true,
    is_active boolean NULL DEFAULT true,
    country_of_origin text NULL DEFAULT 'India'::text,
    
    -- Metadata
    created_at timestamp with time zone NULL DEFAULT now(),
    updated_at timestamp with time zone NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT material_master_pkey PRIMARY KEY (id),
    CONSTRAINT material_master_organization_id_material_code_key UNIQUE (organization_id, material_code),
    CONSTRAINT material_master_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE SET NULL
) TABLESPACE pg_default;

-- 3. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_mat_master_org ON public.material_master USING btree (organization_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_mat_master_name ON public.material_master USING btree (lower(name)) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_mat_master_code ON public.material_master USING btree (material_code) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_mat_master_barcode ON public.material_master USING btree (barcode) TABLESPACE pg_default;

-- 4. SECURITY: ENABLE RLS & DEFINE POLICIES
ALTER TABLE public.material_master ENABLE ROW LEVEL SECURITY;

-- Security isolation policy
DROP POLICY IF EXISTS "Org isolation for material_master" ON public.material_master;
CREATE POLICY "Org isolation for material_master"
ON public.material_master FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- 5. TRIGGER FOR UPDATED_AT
DROP TRIGGER IF EXISTS tr_update_mat_master_modtime ON public.material_master;
CREATE TRIGGER tr_update_mat_master_modtime 
BEFORE UPDATE ON public.material_master 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Notify PostgREST to refresh schema cache
NOTIFY pgrst, 'reload schema';
