
-- ========================================================
-- MEDIMART RETAIL ERP: DEFINITIVE INVENTORY MASTER SCHEMA
-- ========================================================

-- 1. Ensure Profiles and Security Helper exist
CREATE TABLE IF NOT EXISTS public.profiles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id text NOT NULL,
    email text NOT NULL,
    full_name text,
    role text DEFAULT 'owner',
    created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  SELECT organization_id::text INTO found_org_id FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 2. RECREATE INVENTORY TABLE
DROP TABLE IF EXISTS public.inventory CASCADE;

CREATE TABLE public.inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Identity
    name text NOT NULL,
    brand text,
    category text DEFAULT 'General',
    manufacturer text,
    code text,
    barcode text,
    
    -- Batch & Stock
    batch text NOT NULL,
    expiry date,
    stock numeric NOT NULL DEFAULT 0,
    min_stock_limit numeric DEFAULT 10,
    
    -- Packaging
    units_per_pack integer DEFAULT 1,
    pack_type text,
    pack_unit text,
    base_unit text,
    outer_pack text,
    units_per_outer_pack integer DEFAULT 0,
    unit_of_measurement text,
    
    -- Pricing (Per Pack)
    purchase_price numeric DEFAULT 0,
    ptr numeric DEFAULT 0,
    mrp numeric NOT NULL DEFAULT 0,
    rate_a numeric DEFAULT 0,
    rate_b numeric DEFAULT 0,
    rate_c numeric DEFAULT 0,
    
    -- Accounting 
    cost numeric DEFAULT 0,
    value numeric DEFAULT 0,
    
    -- Statutory
    gst_percent numeric DEFAULT 12,
    hsn_code text,
    tax_basis text DEFAULT '1-Tax Exclusive',
    
    -- Schemes
    deal integer DEFAULT 0,
    free integer DEFAULT 0,
    purchase_deal integer DEFAULT 0,
    purchase_free integer DEFAULT 0,
    
    -- Metadata
    composition text,
    description text,
    supplier_name text,
    rack_number text,
    is_active boolean DEFAULT true,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. INDEXING
CREATE INDEX IF NOT EXISTS idx_inventory_org ON public.inventory(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON public.inventory(lower(name));

-- 4. ROW LEVEL SECURITY (The common reason data "doesn't show")
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org isolation for inventory" ON public.inventory;
CREATE POLICY "Org isolation for inventory"
ON public.inventory FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- 5. AUTH TRIGGER (Auto-create profile)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, organization_id, email, full_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'organization_id', gen_random_uuid()::text),
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', 'User')
  ) ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created 
AFTER INSERT ON auth.users 
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

NOTIFY pgrst, 'reload schema';
