-- ========================================================
-- MEDIMART ERP: AUDIT COLUMN SYNCHRONIZATION
-- Adds 'created_by_id' to all tracking tables to fix sync errors.
-- ========================================================

DO $$ 
DECLARE
    tbl text;
    tables_to_fix text[] := ARRAY[
        'inventory', 
        'sales_bill', 
        'purchases', 
        'suppliers', 
        'customers', 
        'material_master', 
        'purchase_orders', 
        'sales_challans', 
        'delivery_challans', 
        'physical_inventory'
    ];
BEGIN 
    FOREACH tbl IN ARRAY tables_to_fix
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            
            -- 1. Add the missing created_by_id column
            -- This column is used for record-level audit (who created the record)
            -- while organization_id handles the multi-tenant isolation.
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = tbl AND column_name = 'created_by_id') THEN
                EXECUTE format('ALTER TABLE public.%I ADD COLUMN created_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL', tbl);
                RAISE NOTICE 'Added created_by_id to table %', tbl;
            END IF;

            -- 2. Data Migration: If an ambiguous 'user_id' column exists and contains data, 
            -- and it's NOT the primary key, we copy its value to 'created_by_id' for continuity.
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = tbl AND column_name = 'user_id') THEN
                -- Verify user_id is not the primary key before attempting migration logic
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints tc 
                    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                    WHERE tc.table_name = tbl AND kcu.column_name = 'user_id' AND tc.constraint_type = 'PRIMARY KEY'
                ) THEN
                    EXECUTE format('UPDATE public.%I SET created_by_id = user_id WHERE created_by_id IS NULL AND user_id IS NOT NULL', tbl);
                END IF;
            END IF;

        END IF;
    END LOOP;
END $$;

-- 3. Add helpful comments for schema documentation
COMMENT ON COLUMN public.purchases.created_by_id IS 'Audit field storing the UUID of the staff member who recorded this purchase.';
COMMENT ON COLUMN public.sales_bill.created_by_id IS 'Audit field storing the UUID of the staff member who generated this invoice.';

-- 4. Reload the PostgREST schema cache so the columns are immediately visible to the API
NOTIFY pgrst, 'reload schema';