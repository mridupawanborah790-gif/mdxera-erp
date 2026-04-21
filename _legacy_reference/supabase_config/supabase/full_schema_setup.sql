-- ========================================================
-- MEDIMART RETAIL ERP: COMPLETELY OPEN DATABASE (BACKEND-LESS)
-- ========================================================

-- 1. Disable Row Level Security on ALL tables in public schema
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
        -- Drop any existing policies to be clean
        EXECUTE format('DROP POLICY IF EXISTS "Org isolation" ON public.%I', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Org isolation policy" ON public.%I', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for same org" ON public.%I', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for same org distributors" ON public.%I', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Profiles are self-managed" ON public.%I', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for same org customers" ON public.%I', tbl);
    END LOOP;
END $$;

-- 2. Drop the restrictive org lookup function and existing triggers
DROP FUNCTION IF EXISTS public.get_my_org_id() CASCADE;

-- 3. Simplify the profile creation trigger
-- This ensures the app always knows the user's org_id without complex checks.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, organization_id, email, full_name, pharmacy_name, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'organization_id', gen_random_uuid()::text),
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', 'System User'),
    COALESCE(new.raw_user_meta_data->>'pharmacy_name', 'Medimart Pharmacy'),
    'owner'
  ) ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    full_name = EXCLUDED.full_name;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply minimal non-blocking trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Ensure standard tables are broad and non-restrictive
-- Standardizing 'organization_id' as TEXT across the board.
ALTER TABLE IF EXISTS public.profiles ALTER COLUMN organization_id TYPE text;
ALTER TABLE IF EXISTS public.distributors ALTER COLUMN organization_id TYPE text;
ALTER TABLE IF EXISTS public.customers ALTER COLUMN organization_id TYPE text;
ALTER TABLE IF EXISTS public.inventory ALTER COLUMN organization_id TYPE text;
ALTER TABLE IF EXISTS public.transactions ALTER COLUMN organization_id TYPE text;
ALTER TABLE IF EXISTS public.purchases ALTER COLUMN organization_id TYPE text;
ALTER TABLE IF EXISTS public.medicine_master ALTER COLUMN organization_id TYPE text;

-- 5. Force schema reload for the API
NOTIFY pgrst, 'reload schema';
