-- ========================================================
-- MEDIMART RETAIL ERP: CATEGORIES SCHEMA & RLS ISOLATION
-- Handles top-level product classifications.
-- ========================================================

-- Ensure UUID extension is enabled for primary keys
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. DROP EXISTING TABLE
-- CASCADE ensures dependent objects (like sub_categories policies) are handled.
DROP TABLE IF EXISTS public.categories CASCADE;

-- 2. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL, -- Isolated by Root Organization Identity
    
    -- Identity
    name text NOT NULL,
    description text,
    image_url text, -- Store URL or Base64 for category icons
    
    -- Status
    is_active boolean DEFAULT true,
    
    -- Audit Meta
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_categories_org ON public.categories (organization_id);
CREATE INDEX IF NOT EXISTS idx_categories_name ON public.categories (lower(name));

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Security Helper (Assumes it exists in root profiles schema, defined here for safety)
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  SELECT organization_id::text INTO found_org_id FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Strict Isolation Policy: Users only access categories belonging to their root organization
DROP POLICY IF EXISTS "Org isolation for categories" ON public.categories;
CREATE POLICY "Org isolation for categories"
ON public.categories FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- 5. AUTOMATED TIMESTAMP TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_update_categories_modtime ON public.categories;
CREATE TRIGGER tr_update_categories_modtime 
BEFORE UPDATE ON public.categories 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Documentation Comments for Database Metadata
COMMENT ON TABLE public.categories IS 'Top-level product classification master. Isolated by organization_id.';
COMMENT ON COLUMN public.categories.name IS 'Display name of the category (e.g., Medicine, Personal Care).';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';