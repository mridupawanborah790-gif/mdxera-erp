-- ========================================================
-- MEDIMART ERP: ADD MATERIAL CODE TO MEDICINE MASTER
-- Migration: 20240522_add_material_code
-- ========================================================

DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'medicine_master') THEN
        -- 1. Add the column as nullable initially to prevent errors with existing data
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='medicine_master' AND column_name='material_code') THEN
            ALTER TABLE public.medicine_master ADD COLUMN material_code TEXT;
            
            -- 2. Seed existing records with a unique temporary value based on the ID
            -- This ensures we can apply the NOT NULL constraint without violation
            UPDATE public.medicine_master 
            SET material_code = 'MM-' || upper(substring(id::text, 1, 8)) 
            WHERE material_code IS NULL;
            
            -- 3. Apply the NOT NULL constraint
            ALTER TABLE public.medicine_master ALTER COLUMN material_code SET NOT NULL;
            
            -- 4. Apply a unique constraint within the organization
            -- This ensures no two products in the same pharmacy share a material code
            ALTER TABLE public.medicine_master 
            ADD CONSTRAINT medicine_master_material_code_org_key UNIQUE (organization_id, material_code);
            
            -- 5. Add a comment for ERP metadata documentation
            COMMENT ON COLUMN public.medicine_master.material_code IS 'Organizational unique identifier for the SKU. Used for search and mapping.';
            
            -- 6. Create an index for high-performance searching
            CREATE INDEX IF NOT EXISTS idx_medicine_master_material_code ON public.medicine_master (material_code);
        END IF;
    END IF;
END $$;

-- Force PostgREST to reload the schema cache so the new column is immediately visible to the API
NOTIFY pgrst, 'reload schema';