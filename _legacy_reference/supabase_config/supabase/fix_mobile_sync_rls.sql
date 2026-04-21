-- Fix RLS for Magic Mobile Link Sync
-- This script ensures the sync tables exist and have the correct permissive RLS for mobile uploads.

-- 1. Ensure mobile_purchase_sync exists
CREATE TABLE IF NOT EXISTS public.mobile_purchase_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  organization_id text NOT NULL,
  user_id text NOT NULL,
  device_id text NOT NULL,
  invoice_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'synced' CHECK (status IN ('synced', 'imported', 'failed')),
  imported_at timestamptz,
  import_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Ensure mobile_bill_sync_queue exists
CREATE TABLE IF NOT EXISTS public.mobile_bill_sync_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id text NOT NULL,
    organization_id text NOT NULL,
    user_id text NOT NULL,
    device_id text NOT NULL,
    status text NOT NULL DEFAULT 'synced' CHECK (status IN ('synced', 'imported', 'failed')),
    payload jsonb NOT NULL,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    imported_at timestamptz
);

-- 3. Setup RLS for mobile_purchase_sync
ALTER TABLE public.mobile_purchase_sync ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org isolation for mobile_purchase_sync" ON public.mobile_purchase_sync;
DROP POLICY IF EXISTS "Allow anonymous insert for mobile_purchase_sync" ON public.mobile_purchase_sync;
DROP POLICY IF EXISTS "Allow org select for mobile_purchase_sync" ON public.mobile_purchase_sync;
DROP POLICY IF EXISTS "Allow org update for mobile_purchase_sync" ON public.mobile_purchase_sync;

-- Allow phones (anon) to upload
CREATE POLICY "Allow anonymous insert for mobile_purchase_sync"
ON public.mobile_purchase_sync FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Only ERP (authenticated) can see/read the bills
CREATE POLICY "Allow org select for mobile_purchase_sync"
ON public.mobile_purchase_sync FOR SELECT TO authenticated
USING (organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Allow org update for mobile_purchase_sync"
ON public.mobile_purchase_sync FOR UPDATE TO authenticated
USING (organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

-- 4. Setup RLS for mobile_bill_sync_queue
ALTER TABLE public.mobile_bill_sync_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org isolation for mobile_bill_sync_queue" ON public.mobile_bill_sync_queue;
DROP POLICY IF EXISTS "Allow anonymous insert for mobile_bill_sync_queue" ON public.mobile_bill_sync_queue;
DROP POLICY IF EXISTS "Allow org select for mobile_bill_sync_queue" ON public.mobile_bill_sync_queue;

CREATE POLICY "Allow anonymous insert for mobile_bill_sync_queue"
ON public.mobile_bill_sync_queue FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow org select for mobile_bill_sync_queue"
ON public.mobile_bill_sync_queue FOR SELECT TO authenticated
USING (organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

-- 5. Add performance indexes if missing
CREATE INDEX IF NOT EXISTS idx_mobile_purchase_sync_session ON public.mobile_purchase_sync (session_id);
CREATE INDEX IF NOT EXISTS idx_mobile_bill_sync_queue_session ON public.mobile_bill_sync_queue (session_id);

NOTIFY pgrst, 'reload schema';
