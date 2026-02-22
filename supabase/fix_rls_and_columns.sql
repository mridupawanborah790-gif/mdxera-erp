
-- 1. FIX CONFIGURATIONS RLS
ALTER TABLE IF EXISTS public.configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org isolation for config" ON public.configurations;
CREATE POLICY "Org isolation for config" 
ON public.configurations FOR ALL 
TO authenticated 
USING (organization_id::text = (SELECT organization_id::text FROM public.profiles WHERE user_id = auth.uid())) 
WITH CHECK (organization_id::text = (SELECT organization_id::text FROM public.profiles WHERE user_id = auth.uid()));

-- 2. ENSURE PURCHASES HAS TOTAL_AMOUNT
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchases') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='amount') THEN
            ALTER TABLE public.purchases RENAME COLUMN amount TO total_amount;
        END IF;
        ALTER TABLE public.purchases ALTER COLUMN total_amount SET DEFAULT 0;
    END IF;
END $$;

-- 3. ADD MISSING SIDEBAR COLUMN TO CONFIGURATIONS
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'configurations') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='configurations' AND column_name='sidebar') THEN
            ALTER TABLE public.configurations ADD COLUMN sidebar jsonb DEFAULT '{"isSidebarCollapsed": false}'::jsonb;
        END IF;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
