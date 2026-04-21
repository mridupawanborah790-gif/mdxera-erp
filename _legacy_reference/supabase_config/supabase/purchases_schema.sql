-- ========================================================
-- MEDIMART ERP: PURCHASES (INWARD BILLS) SCHEMA
-- Handles supplier invoice recording and stock increment logic
-- ========================================================

-- Ensure UUID extension is enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. DROP OLD TABLE
-- CASCADE ensures dependent objects (like old policies) are also handled.
DROP TABLE IF EXISTS public.purchases CASCADE;

-- 2. PURCHASES TABLE
CREATE TABLE IF NOT EXISTS public.purchases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL, -- Isolated by Root Organization Identity
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Recording clerk/manager
    
    -- Internal tracking
    purchase_serial_id text NOT NULL, -- Internal audit number (e.g., PB-0001/24-25)
    
    -- Supplier Info
    supplier text NOT NULL, -- Supplier Name
    invoice_number text NOT NULL, -- The physical bill number from supplier
    date date NOT NULL DEFAULT CURRENT_DATE, -- Date as printed on the bill
    
    -- Financials
    subtotal numeric(15,2) DEFAULT 0, -- Taxable value (total after item discounts, before taxes)
    total_gst numeric(15,2) DEFAULT 0, -- Total tax amount (GST)
    total_item_discount numeric(15,2) DEFAULT 0, -- Sum of all line item trade discounts
    total_item_scheme_discount numeric(15,2) DEFAULT 0, -- Sum of all line item scheme benefits
    scheme_discount numeric(15,2) DEFAULT 0, -- Lumpsum or bill-level cash discount
    round_off numeric(10,2) DEFAULT 0,
    total_amount numeric(15,2) DEFAULT 0, -- Final Net Payable (Grand Total)
    
    -- Item Data
    -- Stored as JSONB to allow for historical bill reconstruction without 
    -- being affected by future master catalog changes.
    items jsonb NOT NULL DEFAULT '[]'::jsonb, 
    
    -- Status & Compliance
    status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled', 'draft')),
    e_way_bill_no text,
    e_way_bill_date date,
    reference_doc_number text, -- Linked Purchase Order Serial ID
    idempotency_key text, -- Prevents duplicate submission issues
    linked_challans text[], -- Array of Delivery Challan IDs merged into this invoice
    
    -- Audit Meta
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_purchases_org ON public.purchases (organization_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases (lower(supplier));
CREATE INDEX IF NOT EXISTS idx_purchases_bill_no ON public.purchases (invoice_number);
CREATE INDEX IF NOT EXISTS idx_purchases_serial ON public.purchases (purchase_serial_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON public.purchases (date);

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

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
DROP POLICY IF EXISTS "Org isolation for purchases" ON public.purchases;
CREATE POLICY "Org isolation for purchases"
ON public.purchases FOR ALL
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

DROP TRIGGER IF EXISTS tr_update_purchases_modtime ON public.purchases;
CREATE TRIGGER tr_update_purchases_modtime 
BEFORE UPDATE ON public.purchases 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Documentation Comments for Database Metadata
COMMENT ON TABLE public.purchases IS 'Supplier inward invoices. Data is strictly siloed by organization_id.';
COMMENT ON COLUMN public.purchases.items IS 'JSONB array of PurchaseItem objects representing line-level data including batches and pricing.';
COMMENT ON COLUMN public.purchases.purchase_serial_id IS 'Generated internal system ID used for accounting registers.';

-- Notify PostgREST to refresh schema cache
NOTIFY pgrst, 'reload schema';