-- ========================================================
-- MEDIMART RETAIL ERP: COMPLETE SUPPLIERS MASTER SCHEMA
-- Manages pharmaceutical distributors, vendors, and agencies.
-- Handles statutory compliance, payment info, and RLS isolation.
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

-- 3. DROP AND RECREATE SUPPLIERS TABLE
-- CASCADE ensures dependent policies and triggers are also refreshed.
DROP TABLE IF EXISTS public.suppliers CASCADE;

CREATE TABLE public.suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL, -- Isolated by Root Organization Identity
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Tracking last modifier
    
    -- Core Identity
    name text NOT NULL,
    brand_agencies text, -- e.g. "Authorized for Cipla, Sun Pharma"
    category text DEFAULT 'Wholesaler', -- Wholesaler, C&F, Manufacturer, Local Vendor
    contact_person text,
    
    -- Contact Information
    phone text,
    mobile text,
    email text,
    website text,
    
    -- Location Details
    address text,
    address_line2 text,
    pincode text,
    district text,
    state text,
    
    -- Statutory & Compliance
    gst_number text,
    pan_number text,
    drug_license text,
    food_license text, -- FSSAI
    tan_number text,
    
    -- Banking & Settlement Info
    payment_details jsonb DEFAULT '{
        "upi_id": "",
        "account_number": "",
        "bank_name": "",
        "ifsc_code": "",
        "branch_name": "",
        "payment_terms": "30 Days"
    }'::jsonb,
    
    -- Financial Tracking
    opening_balance numeric DEFAULT 0, -- Initial balance brought forward
    current_balance numeric DEFAULT 0, -- Dynamic summary of ledger
    ledger jsonb DEFAULT '[]'::jsonb, -- Historical transaction log (Bills/Payments)
    
    -- System Controls
    is_active boolean DEFAULT true,
    is_blocked boolean DEFAULT false,
    remarks text,
    
    -- System Audit
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. PERFORMANCE INDEXING
-- Optimized for search-heavy accounts payable operations
CREATE INDEX IF NOT EXISTS idx_suppliers_org ON public.suppliers(organization_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(lower(name));
CREATE INDEX IF NOT EXISTS idx_suppliers_gst ON public.suppliers(gst_number);
CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON public.suppliers(phone);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON public.suppliers(organization_id, is_active);

-- 5. MULTI-TENANT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org isolation for suppliers" ON public.suppliers;

-- Policy ensures users can only interact with data belonging to their specific organization
CREATE POLICY "Org isolation for suppliers"
ON public.suppliers FOR ALL
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

DROP TRIGGER IF EXISTS tr_update_suppliers_modtime ON public.suppliers;
CREATE TRIGGER tr_update_suppliers_modtime 
BEFORE UPDATE ON public.suppliers 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. METADATA COMMENTS
COMMENT ON TABLE public.suppliers IS 'Pharmaceutical supplier/distributor master. Stores compliance and ledger data.';
COMMENT ON COLUMN public.suppliers.ledger IS 'JSONB array of ledger entries. In larger deployments, move this to a separate ledger table.';
COMMENT ON COLUMN public.suppliers.opening_balance IS 'Initial credit/debit balance at the time of system migration.';

-- 8. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
