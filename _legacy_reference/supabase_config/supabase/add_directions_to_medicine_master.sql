
-- ========================================================
-- MEDIMART ERP: ADD DIRECTIONS TO MEDICINE MASTER
-- Support for "Usage Directions (Dosage/Instructions)"
-- ========================================================

DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'medicine_master') THEN
        -- Add the directions column if it doesn't already exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='medicine_master' AND column_name='directions') THEN
            ALTER TABLE public.medicine_master ADD COLUMN directions TEXT;
            
            -- Add descriptive comment for the ERP metadata
            COMMENT ON COLUMN public.medicine_master.directions IS 'Stores usage directions, dosage instructions, or administration frequency (e.g., 1-0-1 after meals).';
        END IF;
    END IF;
END $$;

-- Refresh the PostgREST schema cache to make the new column visible to the API
NOTIFY pgrst, 'reload schema';
