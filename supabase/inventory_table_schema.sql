-- ========================================================
-- MEDIMART RETAIL ERP: COMPLETE INVENTORY MASTER SCHEMA
-- Replaces existing 'inventory' table with full enterprise specification.
-- Handles batch-wise tracking, multi-tier pricing, and RLS isolation.
-- ========================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

-- 3. DROP AND RECREATE INVENTORY TABLE
-- CASCADE ensures dependent policies and triggers are also refreshed.
DROP TABLE IF EXISTS public.inventory CASCADE;

CREATE TABLE public.inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL, -- Isolated by Root Organization Identity
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Tracking last modifier
    
    -- Core Identity
    name text NOT NULL,
    brand text,
    category text DEFAULT 'General',
    manufacturer text,
    code text, -- Internal Organizational SKU Code
    barcode text,
    
    -- Batch & Stock Intelligence
    batch text NOT NULL,
    expiry date, -- Stored as ISO date for aging and expiry logic
    stock numeric NOT NULL DEFAULT 0, -- Total quantity in granular base units (e.g. tablets)
    min_stock_limit numeric DEFAULT 10,
    
    -- Packaging & Unit Conversions
    units_per_pack integer DEFAULT 1, -- Conversion factor (e.g. 10 tablets per strip)
    pack_type text, -- Display label e.g. "10's", "100ML", "Bottle"
    pack_unit text, -- The "Pack" unit name e.g. "Strip", "Box"
    base_unit text, -- The "Granular" unit name e.g. "Tablet", "Capsule"
    outer_pack text, -- e.g. "Carton"
    units_per_outer_pack integer DEFAULT 0,
    unit_of_measurement text, -- Secondary unit e.g. "ml", "gm", "mg"
    
    -- Pricing Structure (Per Pack)
    purchase_price numeric DEFAULT 0, -- Landing price from supplier
    ptr numeric DEFAULT 0, -- Price to Retailer (Suggested)
    mrp numeric NOT NULL DEFAULT 0, -- Maximum Retail Price
    rate_a numeric DEFAULT 0, -- Tier A Custom Selling Rate
    rate_b numeric DEFAULT 0, -- Tier B Custom Selling Rate
    rate_c numeric DEFAULT 0, -- Tier C Custom Selling Rate
    
    -- Accounting Helper Fields (Computed)
    cost numeric DEFAULT 0, -- Landed cost per single base unit
    value numeric DEFAULT 0, -- Current asset value of this batch (stock * cost)
    
    -- Statutory & Taxation
    gst_percent numeric DEFAULT 12,
    hsn_code text,
    tax_basis text DEFAULT '1-Tax Exclusive', -- e.g. Tax Inclusive vs Exclusive logic
    
    -- Commercial Schemes
    deal integer DEFAULT 0, -- Sale Scheme: Buy X
    free integer DEFAULT 0, -- Sale Scheme: Get Y
    purchase_deal integer DEFAULT 0, -- Purchase Scheme: Buy X
    purchase_free integer DEFAULT 0, -- Purchase Scheme: Get Y
    
    -- Physical/Warehouse Metadata
    composition text, -- Salt/Chemical description
    description text, -- Marketing description
    supplier_name text, -- Primary vendor name
    rack_number text, -- Warehouse location
    is_active boolean DEFAULT true,
    
    -- System Audit
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. PERFORMANCE INDEXING
-- Optimized for search-heavy pharmacy operations
CREATE INDEX IF NOT EXISTS idx_inventory_org ON public.inventory(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON public.inventory(lower(name));
CREATE INDEX IF NOT EXISTS idx_inventory_batch ON public.inventory(lower(batch));
CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON public.inventory(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON public.inventory(expiry);
CREATE INDEX IF NOT EXISTS idx_inventory_code ON public.inventory(code);
CREATE INDEX IF NOT EXISTS idx_inventory_org_stock ON public.inventory(organization_id, stock) WHERE stock <= min_stock_limit;

-- 5. MULTI-TENANT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org isolation for inventory" ON public.inventory;

-- Policy ensures users can only interact with data belonging to their specific organization
CREATE POLICY "Org isolation for inventory"
ON public.inventory FOR ALL
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

DROP TRIGGER IF EXISTS tr_update_inventory_modtime ON public.inventory;
CREATE TRIGGER tr_update_inventory_modtime 
BEFORE UPDATE ON public.inventory 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. METADATA COMMENTS
COMMENT ON TABLE public.inventory IS 'Pharmacy inventory master. Stores batch-wise stock, aging, and multi-tier pricing.';
COMMENT ON COLUMN public.inventory.stock IS 'Current inventory level in base units (e.g. total tablets). All calculations use this unit.';
COMMENT ON COLUMN public.inventory.cost IS 'Calculated landed cost per base unit for margin analysis.';

-- 8. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
