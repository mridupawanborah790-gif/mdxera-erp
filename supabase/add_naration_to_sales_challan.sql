-- migration: add_narration_to_sales_challans.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_challans' AND column_name = 'narration') THEN
        ALTER TABLE public.sales_challans ADD COLUMN narration text;
        COMMENT ON COLUMN public.sales_challans.narration IS 'Manual narration or notes for the sales challan.';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
