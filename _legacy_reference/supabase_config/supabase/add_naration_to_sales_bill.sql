-- migration: add_narration_to_sales_bill.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_bill' AND column_name = 'narration') THEN
        ALTER TABLE public.sales_bill ADD COLUMN narration text;
        COMMENT ON COLUMN public.sales_bill.narration IS 'Manual narration or notes for the bill.';
    END IF;
END $$;

-- Explicitly recreate the compatibility view to include the new column
-- PostgREST often relies on views for certain compatible queries
CREATE OR REPLACE VIEW public.transactions AS 
SELECT 
    *,
    COALESCE(invoice_number, id) as display_invoice_number
FROM public.sales_bill;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
