-- ========================================================
-- MEDIMART ERP: EMERGENCY REVERT MIGRATION
-- Reverts 'id' back to 'user_id' to return to previous state.
-- ========================================================

DO $$ 
BEGIN 
    -- Fix Inventory: Rename id back to user_id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'user_id') THEN
        ALTER TABLE public.inventory RENAME COLUMN id TO user_id;
    END IF;

    -- Fix Material Master
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'material_master' AND column_name = 'id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'material_master' AND column_name = 'user_id') THEN
        ALTER TABLE public.material_master RENAME COLUMN id TO user_id;
    END IF;

    -- Fix Customers
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'user_id') THEN
        ALTER TABLE public.customers RENAME COLUMN id TO user_id;
    END IF;

    -- Fix Suppliers
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'user_id') THEN
        ALTER TABLE public.suppliers RENAME COLUMN id TO user_id;
    END IF;

    -- Fix Purchases
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchases' AND column_name = 'id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchases' AND column_name = 'user_id') THEN
        ALTER TABLE public.purchases RENAME COLUMN id TO user_id;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
