-- ========================================================
-- MEDIMART RETAIL ERP: SALES CHALLANS (DELIVERY NOTES) SCHEMA
-- Handles outward non-bill delivery tracking before invoicing.
-- ========================================================

-- Ensure UUID extension is enabled for primary keys
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. DROP EXISTING TABLE
-- CASCADE ensures dependent objects (like old policies) are also handled.
DROP TABLE IF EXISTS public.sales_challans CASCADE;

-- 2. SALES_CHALLANS TABLE
CREATE TABLE IF NOT EXISTS public.sales_challans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL, -- Isolated by Root Organization Identity
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Recording clerk/manager
    
    -- Internal Tracking
    challan_serial_id text NOT NULL, -- Internal audit number (e.g., SC-0001/24-25)
    
    -- Customer Info
    customer_name text NOT NULL,
    customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_phone text,
    
    -- Timing
    date timestamptz NOT NULL DEFAULT now(),
    
    -- Item Data
    -- Stored as JSONB to preserve the state of items at time of delivery
    -- Includes: name, batch, expiry, quantity, mrp, rate, etc.
    items jsonb NOT NULL DEFAULT '[]'::jsonb, 
    
    -- Financials (Pro-forma values)
    total_amount numeric(15,2) DEFAULT 0,
    subtotal numeric(15,2) DEFAULT 0,
    total_gst numeric(15,2) DEFAULT 0,
    
    -- Status Management
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'converted', 'cancelled')),
    remarks text,
    
    -- Audit Meta
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_sales_challans_org ON public.sales_challans (organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_challans_serial ON public.sales_challans (challan_serial_id);
CREATE INDEX IF NOT EXISTS idx_sales_challans_customer ON public.sales_challans (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_challans_date ON public.sales_challans (date);
CREATE INDEX IF NOT EXISTS idx_sales_challans_status ON public.sales_challans (status);

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.sales_challans ENABLE ROW LEVEL SECURITY;

-- Helper function to find org id (Assumed defined in main profile schema)
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  SELECT organization_id::text INTO found_org_id FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Strict Isolation Policy: Users only access data belonging to their root organization
DROP POLICY IF EXISTS "Org isolation for sales_challans" ON public.sales_challans;
CREATE POLICY "Org isolation for sales_challans"
ON public.sales_challans FOR ALL
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

DROP TRIGGER IF EXISTS tr_update_sales_challans_modtime ON public.sales_challans;
CREATE TRIGGER tr_update_sales_challans_modtime 
BEFORE UPDATE ON public.sales_challans 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Documentation Comments for Database Metadata
COMMENT ON TABLE public.sales_challans IS 'Records for goods sent out without an immediate tax invoice. Isolated by organization_id.';
COMMENT ON COLUMN public.sales_challans.items IS 'JSONB array of BillItem objects reflecting delivered items.';
COMMENT ON COLUMN public.sales_challans.status IS 'Lifecycle: open (active), converted (moved to sales_bill), cancelled (voided).';

-- Refresh API Cache
NOTIFY pgrst, 'reload schema';
