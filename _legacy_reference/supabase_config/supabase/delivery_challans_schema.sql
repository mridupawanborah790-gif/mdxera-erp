-- ========================================================
-- MEDIMART RETAIL ERP: DELIVERY CHALLANS (INWARD) SCHEMA
-- Handles supplier goods received notes before final bill entry.
-- ========================================================

-- Ensure UUID extension is enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. DROP EXISTING TABLE
-- CASCADE ensures dependent objects (like old policies) are also handled.
DROP TABLE IF EXISTS public.delivery_challans CASCADE;

-- 2. DELIVERY_CHALLANS TABLE
CREATE TABLE IF NOT EXISTS public.delivery_challans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL, -- Isolated by Root Organization Identity
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Recording clerk/manager
    
    -- Internal tracking
    challan_serial_id text NOT NULL, -- Internal audit number (e.g., DC-0001/24-25)
    
    -- Supplier Info
    supplier text NOT NULL, -- Supplier Name
    challan_number text, -- The physical ref number from supplier (if available)
    date timestamptz NOT NULL DEFAULT now(), -- Date of receipt
    
    -- Financials (Pro-forma values)
    total_amount numeric(15,2) DEFAULT 0,
    subtotal numeric(15,2) DEFAULT 0,
    total_gst numeric(15,2) DEFAULT 0,
    
    -- Item Data
    -- Stored as JSONB to allow for historical reconstruction without 
    -- dependency on live master catalog changes.
    -- Schema matches PurchaseItem array.
    items jsonb NOT NULL DEFAULT '[]'::jsonb, 
    
    -- Status & Lifecycle
    -- open: received but not yet moved to a Purchase Bill
    -- converted: items moved to a final Purchase Bill (PB)
    -- cancelled: voided
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'converted', 'cancelled')),
    remarks text,
    
    -- Audit Meta
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_delivery_challans_org ON public.delivery_challans (organization_id);
CREATE INDEX IF NOT EXISTS idx_delivery_challans_supplier ON public.delivery_challans (lower(supplier));
CREATE INDEX IF NOT EXISTS idx_delivery_challans_serial ON public.delivery_challans (challan_serial_id);
CREATE INDEX IF NOT EXISTS idx_delivery_challans_date ON public.delivery_challans (date);
CREATE INDEX IF NOT EXISTS idx_delivery_challans_status ON public.delivery_challans (status);

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.delivery_challans ENABLE ROW LEVEL SECURITY;

-- Security Helper (Assumption: Defined in main schema, re-defined here for independence)
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  -- Lookup organization identity linked to the current authenticated auth.uid()
  SELECT organization_id::text INTO found_org_id FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Isolation Policy: Users only access data belonging to their root organization
DROP POLICY IF EXISTS "Org isolation for delivery_challans" ON public.delivery_challans;
CREATE POLICY "Org isolation for delivery_challans"
ON public.delivery_challans FOR ALL
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

DROP TRIGGER IF EXISTS tr_update_delivery_challans_modtime ON public.delivery_challans;
CREATE TRIGGER tr_update_delivery_challans_modtime 
BEFORE UPDATE ON public.delivery_challans 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. METADATA DOCUMENTATION
COMMENT ON TABLE public.delivery_challans IS 'Records for incoming goods without a finalized purchase invoice. Isolated by organization_id.';
COMMENT ON COLUMN public.delivery_challans.items IS 'JSONB array of PurchaseItem objects. Snapshots the state of goods at arrival.';
COMMENT ON COLUMN public.delivery_challans.status IS 'Lifecycle state: open (pending bill), converted (billed), cancelled (voided).';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';