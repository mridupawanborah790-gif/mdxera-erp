-- Migration: Add pricing_mode column to relevant transaction tables
-- Affects: sales_bill, purchases, delivery_challans, sales_challans

DO $$
BEGIN
    -- 1. sales_bill
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_bill' AND column_name = 'pricing_mode') THEN
        ALTER TABLE public.sales_bill ADD COLUMN pricing_mode text DEFAULT 'mrp';
        COMMENT ON COLUMN public.sales_bill.pricing_mode IS 'Pricing mode used for this bill: mrp or rate.';
    END IF;

    -- 2. purchases
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchases' AND column_name = 'pricing_mode') THEN
        ALTER TABLE public.purchases ADD COLUMN pricing_mode text DEFAULT 'rate';
        COMMENT ON COLUMN public.purchases.pricing_mode IS 'Pricing mode used for this purchase: mrp or rate.';
    END IF;

    -- 3. delivery_challans
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_challans' AND column_name = 'pricing_mode') THEN
        ALTER TABLE public.delivery_challans ADD COLUMN pricing_mode text DEFAULT 'rate';
        COMMENT ON COLUMN public.delivery_challans.pricing_mode IS 'Pricing mode used for this challan: mrp or rate.';
    END IF;

    -- 4. sales_challans
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_challans' AND column_name = 'pricing_mode') THEN
        ALTER TABLE public.sales_challans ADD COLUMN pricing_mode text DEFAULT 'mrp';
        COMMENT ON COLUMN public.sales_challans.pricing_mode IS 'Pricing mode used for this challan: mrp or rate.';
    END IF;
END $$;

-- Reload schema for PostgREST
NOTIFY pgrst, 'reload schema';
