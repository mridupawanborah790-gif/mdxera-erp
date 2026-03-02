-- ========================================================
-- MEDIMART RETAIL ERP: COMPLETE CUSTOMERS MASTER SCHEMA
-- Manages patient profiles, clinic accounts, and retailers.
-- Handles receivable tracking, area mapping, and RLS isolation.
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

-- 3. DROP AND RECREATE CUSTOMERS TABLE
-- CASCADE ensures dependent policies and triggers are also refreshed.
DROP TABLE IF EXISTS public.customers CASCADE;

CREATE TABLE public.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL, -- Isolated by Root Organization Identity
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Tracking last modifier
    
    -- Core Identity
    name text NOT NULL,
    customer_type text DEFAULT 'regular', -- regular (Patient), retail (B2B / Pharmacy)
    phone text,
    mobile text,
    email text,
    
    -- Location & Area Mapping
    address text,
    address_line2 text,
    area text, -- Neighborhood / Beat
    pincode text,
    district text,
    state text,
    
    -- Statutory & Compliance
    gst_number text,
    pan_number text,
    drug_license text,
    
    -- Sales & Commercial Logic
    default_discount numeric DEFAULT 0, -- Standard discount auto-applied in POS
    default_rate_tier text DEFAULT 'none', -- none, rateA, rateB, rateC
    credit_limit numeric DEFAULT 0, -- Max outstanding allowed
    payment_terms text DEFAULT 'Due on Receipt',
    
    -- CRM & Assignment
    assigned_staff_id uuid, -- Link to team_members
    assigned_staff_name text, -- Denormalized for fast display
    referred_by text, -- Primary Doctor/Clinic reference
    
    -- Financial Tracking
    opening_balance numeric DEFAULT 0, -- Initial debit balance brought forward
    customer_group text DEFAULT 'Sundry Debtors',
    control_gl_id uuid references public.gl_master(id) on delete restrict,
    current_balance numeric DEFAULT 0, -- Dynamic summary of ledger (Receivable)
    ledger jsonb DEFAULT '[]'::jsonb, -- Historical transaction log (Bills/Receipts)
    
    -- System Controls
    is_active boolean DEFAULT true,
    is_blocked boolean DEFAULT false,
    remarks text,
    
    -- System Audit
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. PERFORMANCE INDEXING
-- Optimized for search-heavy accounts receivable and POS operations
CREATE INDEX IF NOT EXISTS idx_customers_org ON public.customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(lower(name));
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_area ON public.customers(lower(area));
CREATE INDEX IF NOT EXISTS idx_customers_type ON public.customers(organization_id, customer_type);

-- 5. MULTI-TENANT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org isolation for customers" ON public.customers;

-- Policy ensures users can only interact with data belonging to their specific organization
CREATE POLICY "Org isolation for customers"
ON public.customers FOR ALL
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

DROP TRIGGER IF EXISTS tr_update_customers_modtime ON public.customers;
CREATE TRIGGER tr_update_customers_modtime 
BEFORE UPDATE ON public.customers 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. METADATA COMMENTS
COMMENT ON TABLE public.customers IS 'Pharmacy customer/patient master. Stores credit limits, area mapping, and receivables.';
COMMENT ON COLUMN public.customers.ledger IS 'JSONB array of ledger entries. Tracks credit sales and payment receipts.';
COMMENT ON COLUMN public.customers.current_balance IS 'Calculated outstanding amount. Positive indicates money owed to the pharmacy.';

-- 8. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
