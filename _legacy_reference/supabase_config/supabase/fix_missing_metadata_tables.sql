
-- ========================================================
-- MEDIMART ERP: FIX MISSING TABLES (sub_categories & promotions)
-- Run this in your Supabase SQL Editor to resolve PGRST205 errors.
-- ========================================================

-- 1. Create sub_categories table
CREATE TABLE IF NOT EXISTS public.sub_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    image_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Create promotions table
CREATE TABLE IF NOT EXISTS public.promotions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    name text NOT NULL,
    slug text,
    description text,
    start_date date,
    end_date date,
    status text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'expired')),
    priority integer DEFAULT 0,
    applies_to text[], -- e.g., ARRAY['category', 'product']
    assignment jsonb DEFAULT '{}'::jsonb, -- Stores categoryIds, productIds, etc.
    discount_type text CHECK (discount_type IN ('flat', 'percent')),
    discount_value numeric DEFAULT 0,
    max_discount_amount numeric,
    is_gst_inclusive boolean DEFAULT false,
    channels text[], -- e.g., ARRAY['inStore', 'online']
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. Security Helper (Ensure it exists and is robust)
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  SELECT organization_id::text INTO found_org_id FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 4. Apply Row Level Security (RLS)
ALTER TABLE public.sub_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- 5. Create Isolation Policies
-- Policy for sub_categories
DROP POLICY IF EXISTS "Org isolation for sub_categories" ON public.sub_categories;
CREATE POLICY "Org isolation for sub_categories"
ON public.sub_categories FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- Policy for promotions
DROP POLICY IF EXISTS "Org isolation for promotions" ON public.promotions;
CREATE POLICY "Org isolation for promotions"
ON public.promotions FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- 6. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_sub_categories_org ON public.sub_categories (organization_id);
CREATE INDEX IF NOT EXISTS idx_sub_categories_cat ON public.sub_categories (category_id);
CREATE INDEX IF NOT EXISTS idx_promotions_org ON public.promotions (organization_id);
CREATE INDEX IF NOT EXISTS idx_promotions_status ON public.promotions (status);

-- 7. Automated Updated At Trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_update_sub_categories_modtime ON public.sub_categories;
CREATE TRIGGER tr_update_sub_categories_modtime BEFORE UPDATE ON public.sub_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_update_promotions_modtime ON public.promotions;
CREATE TRIGGER tr_update_promotions_modtime BEFORE UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Refresh Schema Cache
NOTIFY pgrst, 'reload schema';
