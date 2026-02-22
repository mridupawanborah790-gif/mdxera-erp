-- ========================================================
-- MEDIMART ERP: ADD OPENING BALANCE TO DISTRIBUTORS
-- Fixes missing column issue during supplier creation
-- ========================================================

DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'distributors') THEN
        -- Add the opening_balance column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='distributors' AND column_name='opening_balance') THEN
            ALTER TABLE public.distributors ADD COLUMN opening_balance NUMERIC DEFAULT 0;
            
            -- Update the comment for documentation
            COMMENT ON COLUMN public.distributors.opening_balance IS 'Initial outstanding balance for the supplier used to seed the transaction ledger.';
        END IF;
    END IF;
END $$;

-- Force PostgREST to reload the schema cache so the new column is immediately visible to the API
NOTIFY pgrst, 'reload schema';