-- Drop any views or foreign keys depending on sales_returns.id before altering
-- Wait, there shouldn't be any depending on sales_returns.id. 

-- 1. Drop the primary key constraint on sales_returns
ALTER TABLE public.sales_returns DROP CONSTRAINT IF EXISTS sales_returns_pkey CASCADE;

-- 2. Alter the column type from uuid to text. Existing UUIDs will just become their text representation.
ALTER TABLE public.sales_returns ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.sales_returns ALTER COLUMN id SET DATA TYPE text USING id::text;

-- 3. Restore the primary key constraint
ALTER TABLE public.sales_returns ADD PRIMARY KEY (id);

-- Optional: Do the same for purchase_returns just in case to ensure standard behavior across return tables
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'purchase_returns' AND column_name = 'id' AND data_type = 'uuid') THEN
        ALTER TABLE public.purchase_returns DROP CONSTRAINT IF EXISTS purchase_returns_pkey CASCADE;
        ALTER TABLE public.purchase_returns ALTER COLUMN id DROP DEFAULT;
        ALTER TABLE public.purchase_returns ALTER COLUMN id SET DATA TYPE text USING id::text;
        ALTER TABLE public.purchase_returns ADD PRIMARY KEY (id);
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
