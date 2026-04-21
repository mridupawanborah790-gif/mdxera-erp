-- 1. Add the master_shortcut_order column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'configurations' 
        AND column_name = 'master_shortcut_order'
    ) THEN
        ALTER TABLE public.configurations 
        ADD COLUMN master_shortcut_order jsonb DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 2. Add a comment for clarity
COMMENT ON COLUMN public.configurations.master_shortcut_order IS 'Stores the custom display order (1-12) for dashboard gateway shortcuts.';

-- 3. Notify PostgREST to reload the schema
NOTIFY pgrst, 'reload schema';
