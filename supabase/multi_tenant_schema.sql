
-- ========================================================
-- MEDIMART RETAIL ERP: MULTI-TENANT SYSTEM SCHEMA
-- Enforces organization-wise isolation at the database level.
-- ========================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. SECURITY HELPER FUNCTIONS
-- Extracts the organization_id for the current authenticated user from their profile.
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  SELECT organization_id::text INTO found_org_id FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 3. PROFILES & TRIGGER
-- Profiles link auth users to a root organization identity.
CREATE TABLE IF NOT EXISTS public.profiles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id text NOT NULL, -- Root tenant identifier
    email text NOT NULL,
    full_name text,
    role text DEFAULT 'clerk',
    is_active boolean DEFAULT true,
    pharmacy_name text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Trigger for automatic organization_id management
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  target_org_id text;
BEGIN
  -- 1. Check if organization_id is passed in user metadata (for invited team members)
  IF new.raw_user_meta_data->>'organization_id' IS NOT NULL THEN
    target_org_id := new.raw_user_meta_data->>'organization_id';
  ELSE
    -- 2. If no ID, generate a new one (for root account signups)
    target_org_id := gen_random_uuid()::text;
  END IF;

  INSERT INTO public.profiles (user_id, organization_id, email, full_name, role)
  VALUES (
    new.id,
    target_org_id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'role', 'owner')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Safe re-creation of the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. APPLY RLS TO ALL RELEVANT TABLES
-- This logic ensures isolation for every table that contains 'organization_id'.
DO $$
DECLARE
    tbl text;
BEGIN
    -- Query for all tables in the public schema that have an organization_id column
    -- excluding the ones we handle with custom policies (like 'profiles' or 'licenses')
    FOR tbl IN 
        SELECT DISTINCT t.table_name 
        FROM information_schema.tables t
        JOIN information_schema.columns c ON t.table_name = c.table_name
        WHERE t.table_schema = 'public' 
          AND c.column_name = 'organization_id'
          AND t.table_name NOT IN ('profiles', 'licenses')
          AND t.table_type = 'BASE TABLE'
    LOOP
        -- Enable RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
        
        -- Drop any existing policies to avoid conflicts
        EXECUTE format('DROP POLICY IF EXISTS "Tenant isolation" ON public.%I', tbl);
        
        -- Create a strict tenant isolation policy
        -- Uses get_my_org_id() to enforce matching ID on all operations
        EXECUTE format('CREATE POLICY "Tenant isolation" ON public.%I FOR ALL TO authenticated USING (organization_id = public.get_my_org_id()) WITH CHECK (organization_id = public.get_my_org_id())', tbl);
        
        -- Performance index for organization lookups
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (organization_id)', 'idx_' || tbl || '_org', tbl);
    END LOOP;
END $$;

-- Special policy for profiles: Users can only manage their own profile.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are self-managed" ON public.profiles;
CREATE POLICY "Profiles are self-managed" ON public.profiles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
