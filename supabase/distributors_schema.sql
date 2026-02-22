-- ========================================================
-- MEDIMART ERP: DISTRIBUTORS TABLE SCHEMA & RLS ISOLATION
-- Ensures all distributor data is siloed by organization_id
-- ========================================================

-- Ensure UUID extension is enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to automatically update 'updated_at' timestamp
-- This function is assumed to be defined globally if not already.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing table if it exists to allow recreation with updated schema
-- CASCADE ensures dependent objects (like policies/triggers) are also handled.
-- This is useful for development, but in production, careful ALTER statements are preferred.
DROP TABLE IF EXISTS public.distributors CASCADE;

-- 1. DISTRIBUTORS TABLE
CREATE TABLE IF NOT EXISTS public.distributors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL, -- Links to the organization profile
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- User who last modified the distributor record
    name text NOT NULL,
    gst_number text,
    pan_number text,
    phone text,
    email text, -- Added email field
    address text,
    state text,
    district text,
    drug_license text,
    payment_details jsonb DEFAULT '{}'::jsonb, -- Store UPI ID, account number, IFSC code
    ledger jsonb DEFAULT '[]'::jsonb, -- Financial ledger entries for this distributor
    is_active boolean DEFAULT true, -- Indicates if the distributor is active
    opening_balance numeric DEFAULT 0, -- Initial outstanding balance, useful for ledger setup
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add comments for clarity and documentation
COMMENT ON TABLE public.distributors IS 'Supplier or distributor information, including contact details, compliance, payment info, and financial ledger.';
COMMENT ON COLUMN public.distributors.id IS 'Primary key, unique identifier for each distributor.';
COMMENT ON COLUMN public.distributors.organization_id IS 'Foreign key to the organization profile, ensuring data isolation (TEXT UUID).';
COMMENT ON COLUMN public.distributors.user_id IS 'ID of the user who last modified this distributor record.';
COMMENT ON COLUMN public.distributors.name IS 'Legal or trade name of the distributor.';
COMMENT ON COLUMN public.distributors.gst_number IS 'GST Identification Number of the distributor.';
COMMENT ON COLUMN public.distributors.pan_number IS 'PAN (Permanent Account Number) of the distributor.';
COMMENT ON COLUMN public.distributors.phone IS 'Contact phone number of the distributor.';
COMMENT ON COLUMN public.distributors.email IS 'Contact email address of the distributor.';
COMMENT ON COLUMN public.distributors.address IS 'Physical address of the distributor.';
COMMENT ON COLUMN public.distributors.state IS 'State where the distributor is located.';
COMMENT ON COLUMN public.distributors.district IS 'District where the distributor is located.';
COMMENT ON COLUMN public.distributors.drug_license IS 'Drug License number of the distributor.';
COMMENT ON COLUMN public.distributors.payment_details IS 'JSONB object for bank account, UPI ID, etc.';
COMMENT ON COLUMN public.distributors.ledger IS 'JSONB array of financial transactions (bills, payments, opening balance) with running balance.';
COMMENT ON COLUMN public.distributors.is_active IS 'Boolean flag indicating if the distributor is currently active.';
COMMENT ON COLUMN public.distributors.opening_balance IS 'The initial outstanding balance for the distributor, used to seed the ledger.';
COMMENT ON COLUMN public.distributors.created_at IS 'Timestamp when the record was created.';
COMMENT ON COLUMN public.distributors.updated_at IS 'Timestamp when the record was last updated.';

-- Indexes for improved query performance
CREATE INDEX IF NOT EXISTS idx_distributors_organization_id ON public.distributors (organization_id);
CREATE INDEX IF NOT EXISTS idx_distributors_name ON public.distributors (lower(name));
CREATE INDEX IF NOT EXISTS idx_distributors_gst_number ON public.distributors (gst_number);


-- Enable Row Level Security (RLS) on the distributors table
ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;

-- Drop existing RLS policy if it might conflict during schema updates/re-runs
DROP POLICY IF EXISTS "Users can only manage distributors in their org" ON public.distributors;

-- Create an RLS policy to ensure authenticated users can only access distributors
-- belonging to their specific organization.
-- The `public.get_my_org_id()` function is assumed to return the organization_id of the current user.
-- This policy applies to ALL (SELECT, INSERT, UPDATE, DELETE) operations.
CREATE POLICY "Users can only manage distributors in their org"
ON public.distributors FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id()::text) -- Explicit cast to text for comparison
WITH CHECK (organization_id::text = public.get_my_org_id()::text); -- Explicit cast to text for inserts/updates


-- Drop existing trigger if it might conflict during schema updates/re-runs
DROP TRIGGER IF EXISTS update_distributors_updated_at ON public.distributors;

-- Apply the trigger to automatically update 'updated_at' before any row update
CREATE TRIGGER update_distributors_updated_at
BEFORE UPDATE ON public.distributors
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Notify PostgREST to reload the schema for immediate changes to the API endpoints
NOTIFY pgrst, 'reload schema';