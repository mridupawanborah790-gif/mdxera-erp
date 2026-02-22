-- ========================================================
-- MEDIMART RETAIL ERP: GLOBAL RLS REPAIR SCRIPT (V4)
-- Iterates through base tables to ensure consistent tenant isolation.
-- This version handles dependent views by dropping them before
-- alteration and recreating them after.
-- ========================================================

DO $$
DECLARE
    tbl text;
    pol text;
    is_table boolean;
    -- Complete list of base tables to isolate (underlying storage)
    tables_to_secure text[] := ARRAY[
        'inventory', 'sales_bill', 'purchases', 'suppliers', 
        'customers', 'material_master', 'configurations', 'purchase_orders',
        'ewaybills', 'delivery_challans', 'sales_challans', 'categories',
        'sub_categories', 'promotions', 'sales_returns', 'purchase_returns',
        'customer_price_list', 'physical_inventory', 'team_members',
        'supplier_product_map'
    ];
BEGIN
    -- 1. DROP DEPENDENT LEGACY VIEWS
    -- These views often block ALTER TABLE operations on their base tables
    DROP VIEW IF EXISTS public.transactions CASCADE;
    DROP VIEW IF EXISTS public.medicine_master CASCADE;
    DROP VIEW IF EXISTS public.distributors CASCADE;

    FOREACH tbl IN ARRAY tables_to_secure
    LOOP
        -- 2. Check if relation exists and is a BASE TABLE ('r')
        SELECT EXISTS (
            SELECT 1 
            FROM pg_class c 
            JOIN pg_namespace n ON n.oid = c.relnamespace 
            WHERE n.nspname = 'public' 
              AND c.relname = tbl 
              AND c.relkind = 'r'
        ) INTO is_table;

        IF is_table THEN
            
            -- 3. DYNAMICALLY DROP ALL EXISTING POLICIES on this table
            -- This clears the way for the type change
            FOR pol IN 
                SELECT policyname 
                FROM pg_policies 
                WHERE schemaname = 'public' AND tablename = tbl
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
                RAISE NOTICE 'Dropped policy % on table %', pol, tbl;
            END LOOP;

            -- 4. Ensure organization_id is text for consistency
            -- Now that policies and views are gone, this is safe
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id TYPE text', tbl);
            
            -- 5. Ensure RLS is enabled
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
            
            -- 6. CREATE THE STANDARD ISOLATION POLICY
            -- Uses the get_my_org_id() helper to ensure strict multi-tenant siloing
            EXECUTE format(
                'CREATE POLICY "Org isolation policy" ON public.%I ' ||
                'FOR ALL TO authenticated ' ||
                'USING (organization_id::text = public.get_my_org_id()) ' ||
                'WITH CHECK (organization_id::text = public.get_my_org_id())', 
                tbl
            );
            
            RAISE NOTICE 'Secured and unified base table: %', tbl;
        ELSE
            RAISE NOTICE 'Skipping non-table relation or missing table: %', tbl;
        END IF;
    END LOOP;

    -- 7. RECREATE LEGACY COMPATIBILITY VIEWS
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'sales_bill' AND relkind = 'r') THEN
        CREATE OR REPLACE VIEW public.transactions AS SELECT * FROM public.sales_bill;
        RAISE NOTICE 'Recreated view: transactions';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'material_master' AND relkind = 'r') THEN
        CREATE OR REPLACE VIEW public.medicine_master AS SELECT * FROM public.material_master;
        RAISE NOTICE 'Recreated view: medicine_master';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'suppliers' AND relkind = 'r') THEN
        CREATE OR REPLACE VIEW public.distributors AS SELECT * FROM public.suppliers;
        RAISE NOTICE 'Recreated view: distributors';
    END IF;

END $$;

-- 8. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';