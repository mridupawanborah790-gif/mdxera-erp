-- ========================================================
-- MEDIMART RETAIL ERP: DEFINITIVE SUPPLIER MASTER SCHEMA
-- Handles pharmaceutical vendors, agencies, and distributors.
-- Features: Batch-ready ledger, payment details, and RLS isolation.
-- ========================================================

-- 1. PRE-REQUISITES
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. SECURITY HELPER (Ensures organizational data isolation)
-- SECURITY DEFINER allows it to bypass RLS to read organization information for the current user.
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  SELECT organization_id::text INTO found_org_id FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 3. DROP AND RECREATE SUPPLIERS TABLE
-- CASCADE handles dependent views like 'distributors'
DROP TABLE IF EXISTS public.suppliers CASCADE;

CREATE TABLE public.suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL, -- Isolated by Root Organization ID
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- User who last updated the record
    
    -- Core Business Identity
    name text NOT NULL,
    contact_person text,
    category text DEFAULT 'Wholesaler', -- Wholesaler, C&F, Manufacturer, Local Vendor
    
    -- Communication
    phone text,
    mobile text,
    email text,
    website text,
    
    -- Physical Location
    address text,
    address_line2 text,
    area text,
    pincode text,
    district text,
    state text,
    
    -- Statutory & Compliance
    gst_number text,
    pan_number text,
    drug_license text,
    food_license text, -- FSSAI
    
    -- Financial Tracking & Ledger
    opening_balance numeric DEFAULT 0, -- Initial balance at system start
    ledger jsonb DEFAULT '[]'::jsonb, -- Historical transaction log (Bills/Payments)
    
    -- Banking & Settlement Info
    payment_details jsonb DEFAULT '{
        "upi_id": "",
        "account_number": "",
        "bank_name": "",
        "ifsc_code": "",
        "branch_name": "",
        "payment_terms": "30 Days"
    }'::jsonb,
    
    -- System Controls
    is_active boolean DEFAULT true,
    is_blocked boolean DEFAULT false,
    remarks text,
    
    -- Audit Timestamps
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. PERFORMANCE INDEXING
-- Optimized for search-heavy accounts payable operations
CREATE INDEX IF NOT EXISTS idx_suppliers_org ON public.suppliers(organization_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(lower(name));
CREATE INDEX IF NOT EXISTS idx_suppliers_gst ON public.suppliers(gst_number);
CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON public.suppliers(phone);

-- 5. MULTI-TENANT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org isolation for suppliers" ON public.suppliers;

-- Strict Isolation: Users only access data belonging to their specific organization
CREATE POLICY "Org isolation for suppliers"
ON public.suppliers FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- 6. LEGACY COMPATIBILITY VIEW
-- Maps 'distributors' to 'suppliers' to prevent PGRST205 errors in older components
CREATE OR REPLACE VIEW public.distributors AS SELECT * FROM public.suppliers;

-- 7. AUTOMATED TIMESTAMP TRIGGER
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

-- 8. METADATA COMMENTS
COMMENT ON TABLE public.suppliers IS 'Pharmaceutical supplier and vendor master. Manages ledger balances and statutory data.';
COMMENT ON COLUMN public.suppliers.ledger IS 'JSONB array of TransactionLedgerItem objects. High-frequency ledger entries should be moved to a separate table in very large datasets.';
COMMENT ON COLUMN public.suppliers.opening_balance IS 'The initial credit or debit balance brought forward during system onboarding.';

-- 9. REFRESH API CACHE
NOTIFY pgrst, 'reload schema';