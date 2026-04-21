-- ========================================================
-- MEDIMART ERP: PROPER FIX MIGRATION
-- Standardizes Primary Keys to 'id' and drops conflicting FKs.
-- ========================================================

-- 1. DROP CONFLICTING CONSTRAINTS
-- These prevent record IDs from being saved because the database 
-- mistakenly thinks the Record ID must be a valid User ID.
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_user_id_fkey;
ALTER TABLE public.material_master DROP CONSTRAINT IF EXISTS material_master_user_id_fkey;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_user_id_fkey;
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_user_id_fkey;
ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_user_id_fkey;
ALTER TABLE public.sales_bill DROP CONSTRAINT IF EXISTS sales_bill_user_id_fkey;

-- 2. STANDARDIZE PRIMARY KEY NAMES BACK TO "id"
DO $$ 
BEGIN 
    -- Inventory
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'user_id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'id') THEN
        ALTER TABLE public.inventory RENAME COLUMN user_id TO id;
    END IF;

    -- Material Master
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'material_master' AND column_name = 'user_id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'material_master' AND column_name = 'id') THEN
        ALTER TABLE public.material_master RENAME COLUMN user_id TO id;
    END IF;

    -- Customers
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'user_id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'id') THEN
        ALTER TABLE public.customers RENAME COLUMN user_id TO id;
    END IF;

    -- Suppliers
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'user_id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'id') THEN
        ALTER TABLE public.suppliers RENAME COLUMN user_id TO id;
    END IF;

    -- Purchases
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchases' AND column_name = 'user_id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchases' AND column_name = 'id') THEN
        ALTER TABLE public.purchases RENAME COLUMN user_id TO id;
    END IF;

    -- Sales Bills
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_bill' AND column_name = 'user_id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_bill' AND column_name = 'id') THEN
        ALTER TABLE public.sales_bill RENAME COLUMN user_id TO id;
    END IF;
END $$;

-- 3. ADD MISSING HISTORY COLUMN
-- Required for the new MRP and Pack synchronization logic.
ALTER TABLE public.material_master 
ADD COLUMN IF NOT EXISTS master_price_maintains jsonb DEFAULT '[]'::jsonb;

-- 4. REFRESH SCHEMA
NOTIFY pgrst, 'reload schema';
