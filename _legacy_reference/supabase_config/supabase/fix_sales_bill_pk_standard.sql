
-- ========================================================
-- MEDIMART ERP: PRIMARY KEY STANDARDIZATION (ROBUST + NULL CHECK)
-- Reverts voucher_no back to id for API compatibility
-- Handles name collisions, dependent views, and null values
-- ========================================================

-- 1. DROP DEPENDENT VIEWS FIRST
DROP VIEW IF EXISTS public.transactions CASCADE;
DROP VIEW IF EXISTS public.medicine_master CASCADE;
DROP VIEW IF EXISTS public.distributors CASCADE;

DO $$ 
BEGIN
    -- 2. FIX SALES_BILL
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_bill') THEN
        -- Drop any conflicting policies
        DROP POLICY IF EXISTS "Org isolation for sales_bill" ON public.sales_bill;
        DROP POLICY IF EXISTS "Org isolation policy" ON public.sales_bill;

        -- Drop existing primary key constraint to allow column alterations
        ALTER TABLE public.sales_bill DROP CONSTRAINT IF EXISTS sales_bill_pkey CASCADE;
        ALTER TABLE public.sales_bill DROP CONSTRAINT IF EXISTS transactions_pkey CASCADE;

        -- If both id and voucher_no exist, 'id' is likely the UUID PK we want to discard
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_bill' AND column_name = 'id') 
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_bill' AND column_name = 'voucher_no') THEN
            ALTER TABLE public.sales_bill DROP COLUMN id;
        END IF;

        -- If voucher_no exists, rename it to id
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_bill' AND column_name = 'voucher_no') THEN
            ALTER TABLE public.sales_bill RENAME COLUMN voucher_no TO id;
        END IF;
        
        -- If user_id exists and isn't our desired PK, drop it
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_bill' AND column_name = 'user_id') THEN
            ALTER TABLE public.sales_bill DROP COLUMN user_id;
        END IF;

        -- CRITICAL: Fill null values in 'id' before setting NOT NULL
        -- Use a random UUID string for any orphaned records to maintain integrity
        UPDATE public.sales_bill SET id = gen_random_uuid()::text WHERE id IS NULL;

        -- Set the 'id' column (text) as the primary key
        ALTER TABLE public.sales_bill ALTER COLUMN id SET NOT NULL;
        ALTER TABLE public.sales_bill ADD PRIMARY KEY (id);

        -- Re-enable RLS and Policy
        ALTER TABLE public.sales_bill ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Org isolation policy" ON public.sales_bill FOR ALL TO authenticated 
        USING (organization_id::text = public.get_my_org_id()) 
        WITH CHECK (organization_id::text = public.get_my_org_id());
    END IF;

    -- 3. FIX PHYSICAL_INVENTORY
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'physical_inventory') THEN
        DROP POLICY IF EXISTS "Org isolation for physical_inventory" ON public.physical_inventory;
        DROP POLICY IF EXISTS "Org isolation policy" ON public.physical_inventory;

        ALTER TABLE public.physical_inventory DROP CONSTRAINT IF EXISTS physical_inventory_pkey CASCADE;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'physical_inventory' AND column_name = 'id') 
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'physical_inventory' AND column_name = 'voucher_no') THEN
            ALTER TABLE public.physical_inventory DROP COLUMN id;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'physical_inventory' AND column_name = 'voucher_no') THEN
            ALTER TABLE public.physical_inventory RENAME COLUMN voucher_no TO id;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'physical_inventory' AND column_name = 'user_id') THEN
            ALTER TABLE public.physical_inventory DROP COLUMN user_id;
        END IF;

        -- CRITICAL: Fill null values in 'id' before setting NOT NULL
        UPDATE public.physical_inventory SET id = gen_random_uuid()::text WHERE id IS NULL;

        ALTER TABLE public.physical_inventory ALTER COLUMN id SET NOT NULL;
        ALTER TABLE public.physical_inventory ADD PRIMARY KEY (id);

        ALTER TABLE public.physical_inventory ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Org isolation policy" ON public.physical_inventory FOR ALL TO authenticated 
        USING (organization_id::text = public.get_my_org_id()) 
        WITH CHECK (organization_id::text = public.get_my_org_id());
    END IF;
END $$;

-- 4. RECREATE COMPATIBILITY VIEWS
CREATE OR REPLACE VIEW public.transactions AS SELECT * FROM public.sales_bill;
CREATE OR REPLACE VIEW public.medicine_master AS SELECT * FROM public.material_master;
CREATE OR REPLACE VIEW public.distributors AS SELECT * FROM public.suppliers;

NOTIFY pgrst, 'reload schema';
