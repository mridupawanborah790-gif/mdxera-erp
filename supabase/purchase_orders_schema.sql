
-- ========================================================
-- MEDIMART ERP: PURCHASE ORDERS SCHEMA & RLS ISOLATION
-- ========================================================

CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    user_id uuid REFERENCES auth.users(id),
    serial_id text NOT NULL,
    date timestamptz NOT NULL DEFAULT now(),
    distributor_id uuid NOT NULL,
    distributor_name text NOT NULL,
    sender_email text,
    items jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'ordered',
    sync_status text DEFAULT 'pending',
    total_items integer DEFAULT 0,
    total_amount numeric(15,2) DEFAULT 0,
    remarks text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Ensure column type alignment
ALTER TABLE public.purchase_orders ALTER COLUMN organization_id TYPE text;

-- Enable RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

-- Apply Robust Org Isolation Policy
-- Using the public.get_my_org_id() helper for consistent security behavior
DROP POLICY IF EXISTS "Org isolation for purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Org isolation policy" ON public.purchase_orders;

CREATE POLICY "Org isolation policy" 
ON public.purchase_orders FOR ALL 
TO authenticated 
USING (organization_id = public.get_my_org_id()) 
WITH CHECK (organization_id = public.get_my_org_id());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_po_org_id ON public.purchase_orders (organization_id);
CREATE INDEX IF NOT EXISTS idx_po_serial ON public.purchase_orders (serial_id);

NOTIFY pgrst, 'reload schema';
