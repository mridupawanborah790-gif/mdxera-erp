
-- ========================================================
-- MEDIMART ERP: SCHEMA REPAIR (USER_ID CONSTRAINT)
-- Fixes: ERROR 23502 (null value in column "user_id")
-- ========================================================

DO $$ 
BEGIN 
    -- 1. FIX FOR PURCHASES TABLE
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchases') THEN
        -- Add user_id if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='user_id') THEN
            ALTER TABLE public.purchases ADD COLUMN user_id uuid REFERENCES auth.users(id);
        END IF;

        -- Ensure user_id is NULLABLE to prevent sync blocks (App handles organization-level isolation)
        ALTER TABLE public.purchases ALTER COLUMN user_id DROP NOT NULL;
    END IF;

    -- 2. FIX FOR TRANSACTIONS TABLE (Just in case)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='user_id') THEN
            ALTER TABLE public.transactions ADD COLUMN user_id uuid REFERENCES auth.users(id);
        END IF;
        ALTER TABLE public.transactions ALTER COLUMN user_id DROP NOT NULL;
    END IF;
END $$;

-- 3. RE-SYNC SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
