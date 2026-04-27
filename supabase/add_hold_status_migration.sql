-- Migration: Add 'hold' status to transactions and vouchers
-- This script updates the check constraints on 'status' columns across critical tables.
-- Robustly handles missing columns or constraints.

DO $$
BEGIN
    -- 1. UPDATE PURCHASES TABLE
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'purchases' AND column_name = 'status') THEN
        ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
        ALTER TABLE public.purchases ADD CONSTRAINT purchases_status_check CHECK (status IN ('completed', 'cancelled', 'draft', 'hold'));
    END IF;

    -- 2. UPDATE SALES_BILL TABLE
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_bill' AND column_name = 'status') THEN
        ALTER TABLE public.sales_bill DROP CONSTRAINT IF EXISTS sales_bill_status_check;
        ALTER TABLE public.sales_bill ADD CONSTRAINT sales_bill_status_check CHECK (status IN ('completed', 'cancelled', 'draft', 'hold'));
    END IF;

    -- 3. UPDATE SALES_RETURNS TABLE
    -- Ensure status column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_returns' AND column_name = 'status') THEN
        ALTER TABLE public.sales_returns ADD COLUMN status text NOT NULL DEFAULT 'completed';
    END IF;
    -- Update constraint
    ALTER TABLE public.sales_returns DROP CONSTRAINT IF EXISTS sales_returns_status_check;
    ALTER TABLE public.sales_returns ADD CONSTRAINT sales_returns_status_check CHECK (status IN ('completed', 'draft', 'pending_approval', 'cancelled', 'hold'));

    -- 4. UPDATE PURCHASE_RETURNS TABLE
    -- Ensure status column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'purchase_returns' AND column_name = 'status') THEN
        ALTER TABLE public.purchase_returns ADD COLUMN status text NOT NULL DEFAULT 'completed';
    END IF;
    -- Update constraint
    ALTER TABLE public.purchase_returns DROP CONSTRAINT IF EXISTS purchase_returns_status_check;
    ALTER TABLE public.purchase_returns ADD CONSTRAINT purchase_returns_status_check CHECK (status IN ('completed', 'cancelled', 'draft', 'hold'));

END $$;

-- Notify schema cache reload
NOTIFY pgrst, 'reload schema';
