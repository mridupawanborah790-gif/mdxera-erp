
-- ========================================================
-- MEDIMART ERP: MEDICINE MASTER SCHEMA & RLS ISOLATION
-- ========================================================

-- 1. Ensure Table exists with correct constraints
CREATE TABLE IF NOT EXISTS public.medicine_master (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    composition text,
    pack text,
    barcode text,
    rate_a numeric DEFAULT 0,
    rate_b numeric DEFAULT 0,
    rate_c numeric DEFAULT 0,
    benefits text,
    side_effects text,
    directions text,
    uses text,
    storage text,
    marketer text,
    country_of_origin text DEFAULT 'India',
    return_days integer DEFAULT 0,
    expiry_duration_months integer DEFAULT 24,
    is_prescription_required boolean DEFAULT true,
    image_url text,
    brand text,
    description text,
    manufacturer text,
    gst_rate numeric DEFAULT 12,
    hsn_code text,
    is_active boolean DEFAULT true,
    mrp text DEFAULT '0',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. PROFILE SYNC TRIGGER (CRITICAL FIX)
-- This ensures that when a team member is invited (auth.signUp), 
-- a public.profiles record is automatically created so RLS lookup works.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  org_id_to_use text;
BEGIN
  -- Check if organization_id is provided in raw_user_meta_data
  IF new.raw_user_meta_data->>'organization_id' IS NOT NULL AND (new.raw_user_meta_data->>'organization_id') != '' THEN
    org_id_to_use := new.raw_user_meta_data->>'organization_id';
  ELSE
    -- If not provided or is empty, generate a new UUID for the organization_id
    org_id_to_use := gen_random_uuid()::text;
  END IF;

  INSERT INTO public.profiles (user_id, organization_id, email, full_name, role)
  VALUES (
    new.id, -- This is the auth.users.id, which maps to profiles.user_id
    org_id_to_use,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'role', 'clerk')::public.user_role
  )
  ON CONFLICT (user_id) DO UPDATE SET 
    organization_id = EXCLUDED.organization_id,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create trigger safely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. UPDATED GET_ORG_ID FUNCTION
-- SECURITY DEFINER ensures it can read the profiles table even during RLS evaluation.
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
  SELECT organization_id::text FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 4. APPLY ROBUST RLS
ALTER TABLE public.medicine_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only manage medicines in their org" ON public.medicine_master;
CREATE POLICY "Users can only manage medicines in their org"
ON public.medicine_master FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_medicine_master_org ON public.medicine_master(organization_id);
CREATE INDEX IF NOT EXISTS idx_medicine_master_name ON public.medicine_master(lower(name));

NOTIFY pgrst, 'reload schema';