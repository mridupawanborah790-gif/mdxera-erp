-- ========================================================
-- MEDIMART RETAIL ERP: COMPLETE INVENTORY MASTER SCHEMA
-- Replaces existing 'inventory' table with full specification
-- ========================================================

-- 1. PRE-REQUISITES
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. SECURITY HELPER (Consistent across modules)
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  -- We query profiles which contains the link between auth.uid() and organization_id
  SELECT organization_id::text INTO found_org_id FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 3. DROP AND RECREATE INVENTORY TABLE
DROP TABLE IF EXISTS public.inventory CASCADE;

CREATE TABLE public.inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL, -- Isolated by Root Organization
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Tracking modifier
    
    -- Core Identity
    name text NOT NULL,
    brand text,
    category text DEFAULT 'General',
    manufacturer text,
    code text, -- Internal Product Code
    barcode text,
    
    -- Batch & Stock
    batch text NOT NULL,
    expiry date, -- Stored as ISO date for proper logic
    stock numeric DEFAULT 0, -- Total base units
    min_stock_limit numeric DEFAULT 10,
    
    -- Packaging Details
    units_per_pack integer DEFAULT 1,
    pack_type text, -- Display text e.g. "10's"
    pack_unit text, -- e.g. "Strip", "Box"
    base_unit text, -- e.g. "Tablet", "Capsule"
    outer_pack text,
    units_per_outer_pack integer DEFAULT 0,
    unit_of_measurement text, -- e.g. "ml", "gm"
    
    -- Pricing (Per Pack)
    purchase_price numeric DEFAULT 0,
    ptr numeric DEFAULT 0, -- Price to Retailer
    mrp numeric DEFAULT 0, -- Maximum Retail Price
    rate_a numeric DEFAULT 0, -- Custom Rate Tier A
    rate_b numeric DEFAULT 0, -- Custom Rate Tier B
    rate_c numeric DEFAULT 0, -- Custom Rate Tier C
    
    -- Calculation Helper fields (Stored for performance)
    cost numeric DEFAULT 0, -- Calculated cost per base unit
    value numeric DEFAULT 0, -- Total value (stock * cost)
    
    -- Statutory & Tax
    gst_percent numeric DEFAULT 0,
    hsn_code text,
    tax_basis text DEFAULT '1-Tax Exclusive',
    
    -- Commercial Schemes
    deal integer DEFAULT 0, -- Sales Scheme: Buy X
    free integer DEFAULT 0, -- Sales Scheme: Get Y
    purchase_deal integer DEFAULT 0, -- Purchase Scheme: Buy X
    purchase_free integer DEFAULT 0, -- Purchase Scheme: Get Y
    
    -- Metadata
    composition text,
    description text,
    supplier_name text,
    rack_number text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_inventory_org ON public.inventory(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON public.inventory(lower(name));
CREATE INDEX IF NOT EXISTS idx_inventory_batch ON public.inventory(lower(batch));
CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON public.inventory(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON public.inventory(expiry);
CREATE INDEX IF NOT EXISTS idx_inventory_code ON public.inventory(code);

-- 5. MULTI-TENANT SECURITY (RLS)
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org isolation for inventory" ON public.inventory;

-- Strict Isolation Policy: Users can only see/edit data belonging to their organization
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

-- Add documentation comments for the schema
COMMENT ON TABLE public.inventory IS 'Central repository for pharmacy batch-wise stock, pricing, and packaging configuration.';
COMMENT ON COLUMN public.inventory.stock IS 'Current inventory level in granular base units (e.g., total tablets).';
COMMENT ON COLUMN public.inventory.cost IS 'Internal field representing the calculated landed cost per single base unit.';

-- Notify API to reload the schema cache
NOTIFY pgrst, 'reload schema';