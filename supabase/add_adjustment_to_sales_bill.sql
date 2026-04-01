-- migration: add_adjustment_to_sales_bill.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_bill' AND column_name = 'adjustment') THEN
        ALTER TABLE public.sales_bill ADD COLUMN adjustment numeric DEFAULT 0;
        COMMENT ON COLUMN public.sales_bill.adjustment IS 'Manual adjustment amount added to the bill total.';
    END IF;
END $$;
