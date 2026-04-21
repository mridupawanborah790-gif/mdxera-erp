
-- ========================================================
-- MEDIMART RETAIL ERP: MASTER IDENTITY & ACCESS SCHEMA
-- Consolidates all logic for user signup and organization init.
-- ========================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CORE TYPES
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('owner', 'admin', 'manager', 'purchase', 'clerk', 'viewer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id text NOT NULL,
    email text NOT NULL,
    full_name text,
    pharmacy_name text,
    manager_name text,
    address text,
    address_line2 text,
    mobile text,
    pincode text,
    district text,
    state text,
    gstin text,
    retailer_gstin text,
    drug_license text,
    food_license text,
    pan_number text,
    dl_valid_to date,
    bank_account_name text,
    bank_account_number text,
    bank_ifsc_code text,
    bank_upi_id text,
    authorized_signatory text,
    pharmacy_logo_url text,
    terms_and_conditions text,
    purchase_order_terms text,
    role public.user_role DEFAULT 'clerk',
    subscription_plan text DEFAULT 'starter',
    subscription_status text DEFAULT 'active',
    subscription_id text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. PERFORMANCE INDEXING
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 5. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are self-managed" ON public.profiles;
CREATE POLICY "Profiles are self-managed" 
ON public.profiles FOR ALL 
TO authenticated 
USING (user_id = auth.uid()) 
WITH CHECK (user_id = auth.uid());

-- 6. SECURITY HELPER FUNCTION
-- Extracts the organization_id for the current authenticated user from their profile.
-- SECURITY DEFINER allows this function to bypass RLS on profiles to identify the caller's organization.
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  -- We query the profile directly. Since this is SECURITY DEFINER, it bypasses RLS.
  SELECT organization_id::text INTO found_org_id FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 7. MASTER AUTH TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  target_org_id text;
  new_role public.user_role;
  raw_role text;
BEGIN
  -- A. Determine Organization ID (from metadata or generate)
  target_org_id := COALESCE(new.raw_user_meta_data->>'organization_id', (SELECT md5(random()::text || clock_timestamp()::text)));
  
  -- B. Determine Role with fallback
  raw_role := new.raw_user_meta_data->>'role';
  BEGIN
    IF raw_role IS NOT NULL AND raw_role != '' THEN
      new_role := raw_role::public.user_role;
    ELSE
      new_role := 'owner'::public.user_role;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    new_role := 'owner'::public.user_role;
  END;

  -- C. Initialize Profile (Atomically)
  INSERT INTO public.profiles (
    user_id, 
    organization_id, 
    email, 
    full_name, 
    pharmacy_name, 
    role,
    manager_name
  )
  VALUES (
    new.id,
    target_org_id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', 'System User'),
    COALESCE(new.raw_user_meta_data->>'pharmacy_name', 'New Pharmacy'),
    new_role,
    COALESCE(new.raw_user_meta_data->>'full_name', 'System User')
  ) ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    full_name = EXCLUDED.full_name,
    pharmacy_name = EXCLUDED.pharmacy_name;

  -- D. Initialize Global Configurations
  BEGIN
    INSERT INTO public.configurations (organization_id)
    VALUES (target_org_id)
    ON CONFLICT (organization_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore config errors to ensure user creation succeeds
  END;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- 8. CLEANUP & BIND TRIGGER
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_setup ON auth.users;

CREATE TRIGGER on_auth_user_created 
AFTER INSERT ON auth.users 
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. AUTOMATED TIMESTAMP UPDATE
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_update_profiles_modtime ON public.profiles;
CREATE TRIGGER tr_update_profiles_modtime 
BEFORE UPDATE ON public.profiles 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
