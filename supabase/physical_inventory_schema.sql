-- ========================================================
-- MEDIMART RETAIL ERP: PHYSICAL INVENTORY (STOCK AUDIT) SCHEMA
-- Handles periodic stock counts, variance adjustments, and audit logs.
-- ========================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. DROP EXISTING TABLE
-- CASCADE handles dependent policies and triggers.
DROP TABLE IF EXISTS public.physical_inventory CASCADE;

-- 2. PHYSICAL_INVENTORY TABLE
CREATE TABLE IF NOT EXISTS public.physical_inventory (
    -- Primary Key: Uses the generated Serial ID (e.g., PHY-000001) for accounting consistency
    id text PRIMARY KEY, 
    organization_id text NOT NULL, -- Root tenant identifier
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Current active user
    
    -- Audit Metadata
    status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
    start_date timestamptz NOT NULL DEFAULT now(),
    end_date timestamptz,
    reason text, -- Purpose of the audit (e.g., Monthly, Expiry Check)
    
    -- Calculation Summary
    total_variance_value numeric(15,2) DEFAULT 0, -- Monetary impact of discrepancies
    
    -- Item Data
    -- Stored as JSONB to snapshot the system state vs physical count at the moment of audit.
    -- Schema: Array of {inventoryItemId, name, brand, batch, expiry, systemStock, physicalCount, variance, cost}
    items jsonb NOT NULL DEFAULT '[]'::jsonb,
    
    -- Performer Details (cached for audit log persistence even if user is removed)
    performed_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    performed_by_name text,
    
    -- System Timestamps
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_phy_inv_org ON public.physical_inventory (organization_id);
CREATE INDEX IF NOT EXISTS idx_phy_inv_status ON public.physical_inventory (status);
CREATE INDEX IF NOT EXISTS idx_phy_inv_start_date ON public.physical_inventory (start_date);
CREATE INDEX IF NOT EXISTS idx_phy_inv_perf_id ON public.physical_inventory (performed_by_id);

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.physical_inventory ENABLE ROW LEVEL SECURITY;

-- Security Helper Function (Assumed defined in root profiles schema)
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

-- Strict Isolation Policy: Users can only interact with audits belonging to their specific organization.
DROP POLICY IF EXISTS "Org isolation for physical_inventory" ON public.physical_inventory;
CREATE POLICY "Org isolation for physical_inventory"
ON public.physical_inventory FOR ALL
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

DROP TRIGGER IF EXISTS tr_update_phy_inv_modtime ON public.physical_inventory;
CREATE TRIGGER tr_update_phy_inv_modtime 
BEFORE UPDATE ON public.physical_inventory 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. METADATA COMMENTS
COMMENT ON TABLE public.physical_inventory IS 'Stores stock audit sessions, comparing system stock levels with actual physical counts.';
COMMENT ON COLUMN public.physical_inventory.id IS 'Primary identifier, typically formatted as a human-readable voucher number (e.g., PHY-0001).';
COMMENT ON COLUMN public.physical_inventory.items IS 'Snapshotted discrepancy data stored as a JSONB array.';
COMMENT ON COLUMN public.physical_inventory.total_variance_value IS 'The sum of (variance * cost) for all items, representing inventory shrinkage or surplus.';

-- Notify PostgREST to reload the schema cache so changes are immediately available to the API
NOTIFY pgrst, 'reload schema';