
-- ========================================================
-- MEDIMART ERP: LEGACY COMPATIBILITY LAYER
-- Resolves PGRST205 "Could not find table in schema cache"
-- ========================================================

-- 1. Map 'medicine_master' to 'material_master'
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'material_master') THEN
        CREATE OR REPLACE VIEW public.medicine_master AS SELECT * FROM public.material_master;
    END IF;
END $$;

-- 2. Map 'transactions' to 'sales_bill'
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_bill') THEN
        CREATE OR REPLACE VIEW public.transactions AS SELECT * FROM public.sales_bill;
    END IF;
END $$;

-- 3. Map 'distributors' to 'suppliers'
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers') THEN
        CREATE OR REPLACE VIEW public.distributors AS SELECT * FROM public.suppliers;
    END IF;
END $$;

-- 4. Map 'ewaybills' to standardized names if needed
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ewaybills') THEN
        -- Standardize permissions if they were missed
        ALTER VIEW IF EXISTS public.medicine_master OWNER TO postgres;
        ALTER VIEW IF EXISTS public.transactions OWNER TO postgres;
        ALTER VIEW IF EXISTS public.distributors OWNER TO postgres;
    END IF;
END $$;

-- 5. Force PostgREST to reload the schema cache
NOTIFY pgrst, 'reload schema';
