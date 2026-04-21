-- ========================================================
-- MEDIMART ERP: SALES RETURNS SCHEMA & RLS ISOLATION
-- ========================================================

-- Ensure UUID extension is enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop existing table if it exists to allow recreation with updated schema
DROP TABLE IF EXISTS public.sales_returns CASCADE;

-- 1. SALES_RETURNS TABLE
CREATE TABLE IF NOT EXISTS public.sales_returns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL, -- Links to the organization profile
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- User who recorded the return
    date date NOT NULL DEFAULT CURRENT_DATE, -- Date of the sales return
    original_invoice_id text NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT, -- Reference to the original sales invoice
    customer_name text NOT NULL,
    customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    items jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array of SalesReturnItem objects
    total_refund numeric(15,2) DEFAULT 0,
    status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'draft', 'pending_approval', 'cancelled')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add comments for clarity and documentation
COMMENT ON TABLE public.sales_returns IS 'Records for customer returns against sales invoices (Credit Notes).';
COMMENT ON COLUMN public.sales_returns.id IS 'Primary key, unique identifier for each sales return.';
COMMENT ON COLUMN public.sales_returns.organization_id IS 'Foreign key to the organization profile, ensuring data isolation (TEXT UUID).';
COMMENT ON COLUMN public.sales_returns.user_id IS 'ID of the user who last recorded or updated this sales return.';
COMMENT ON COLUMN public.sales_returns.date IS 'Date when the sales return was recorded.';
COMMENT ON COLUMN public.sales_returns.original_invoice_id IS 'ID of the original sales transaction this return is linked to.';
COMMENT ON COLUMN public.sales_returns.customer_name IS 'Name of the customer returning items.';
COMMENT ON COLUMN public.sales_returns.customer_id IS 'ID of the customer returning items, if linked to a master customer.';
COMMENT ON COLUMN public.sales_returns.items IS 'JSONB array of items being returned, including quantity, reason, and original pricing details.';
COMMENT ON COLUMN public.sales_returns.total_refund IS 'The total monetary amount refunded or credited to the customer.';
COMMENT ON COLUMN public.sales_returns.status IS 'Current status of the sales return (e.g., completed, draft).';
COMMENT ON COLUMN public.sales_returns.created_at IS 'Timestamp when the record was created.';
COMMENT ON COLUMN public.sales_returns.updated_at IS 'Timestamp when the record was last updated.';

-- Indexes for improved query performance
CREATE INDEX IF NOT EXISTS idx_sales_returns_org_id ON public.sales_returns (organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_original_invoice_id ON public.sales_returns (original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON public.sales_returns (date);
CREATE INDEX IF NOT EXISTS idx_sales_returns_customer_id ON public.sales_returns (customer_id);

-- Enable Row Level Security (RLS) on the sales_returns table
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;

-- Drop existing RLS policy if it might conflict during schema updates/re-runs
DROP POLICY IF EXISTS "Users can only manage sales returns in their org" ON public.sales_returns;

-- Create an RLS policy to ensure authenticated users can only access sales returns
-- belonging to their specific organization.
-- The `public.get_my_org_id()` function is assumed to return the organization_id of the current user.
-- This policy applies to ALL (SELECT, INSERT, UPDATE, DELETE) operations.
CREATE POLICY "Users can only manage sales returns in their org"
ON public.sales_returns FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id()::text) -- Explicit cast to text for comparison
WITH CHECK (organization_id::text = public.get_my_org_id()::text); -- Explicit cast to text for inserts/updates

-- Trigger to automatically update the 'updated_at' timestamp
-- This function 'update_updated_at_column()' is assumed to be defined elsewhere in the schema.
DROP TRIGGER IF EXISTS tr_update_sales_returns_modtime ON public.sales_returns;
CREATE TRIGGER tr_update_sales_returns_modtime
BEFORE UPDATE ON public.sales_returns
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Notify PostgREST to reload the schema for immediate changes to the API endpoints
NOTIFY pgrst, 'reload schema';