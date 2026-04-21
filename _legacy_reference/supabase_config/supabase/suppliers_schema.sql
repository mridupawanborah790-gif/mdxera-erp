-- ========================================================
-- MEDIMART RETAIL ERP: SUPPLIERS MASTER SCHEMA
-- Renames 'distributors' to 'suppliers' and enforces RLS isolation.
-- ========================================================

-- 1. CLEANUP OLD STRUCTURE
DROP TABLE IF EXISTS public.distributors CASCADE;
DROP TABLE IF EXISTS public.suppliers CASCADE;

-- 2. CREATE SUPPLIERS TABLE
CREATE TABLE public.suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL, -- Isolated by Root Organization
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Tracking modifier
    
    -- Identity & Contact
    name text NOT NULL,
    phone text,
    email text,
    address text,
    state text,
    district text,
    
    -- Compliance & Statutory
    gst_number text,
    pan_number text,
    drug_license text,
    
    -- Financials & Payments
    payment_details jsonb DEFAULT '{}'::jsonb, -- Store UPI ID, A/c Number, IFSC
    ledger jsonb DEFAULT '[]'::jsonb, -- Transaction history with running balance
    opening_balance numeric DEFAULT 0,
    
    -- Status
    is_active boolean DEFAULT true,
    
    -- Metadata
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_suppliers_org ON public.suppliers(organization_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(lower(name));
CREATE INDEX IF NOT EXISTS idx_suppliers_gst ON public.suppliers(gst_number);

-- 4. MULTI-TENANT SECURITY (RLS)
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Security Helper (Ensures lookup via profiles table linked to current auth.uid)
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  SELECT organization_id::text INTO found_org_id FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Strict Isolation Policy: Users only access data belonging to their organization
DROP POLICY IF EXISTS "Org isolation for suppliers" ON public.suppliers;
CREATE POLICY "Org isolation for suppliers"
ON public.suppliers FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- 5. AUTOMATED TIMESTAMP TRIGGER
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

-- Documentation Comments
COMMENT ON TABLE public.suppliers IS 'Master catalog of pharmaceutical suppliers and vendors with ledger tracking.';
COMMENT ON COLUMN public.suppliers.ledger IS 'JSONB array of TransactionLedgerItem objects tracking bills and payments.';

NOTIFY pgrst, 'reload schema';