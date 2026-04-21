-- ========================================================
-- MEDIMART ERP: FIX MISSING TABLES (PGRST205) - REVISED
-- Run this in your Supabase SQL Editor
-- ========================================================

-- 1. SALES CHALLANS
CREATE TABLE IF NOT EXISTS public.sales_challans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    challan_serial_id text NOT NULL,
    customer_name text NOT NULL,
    customer_id uuid,
    customer_phone text,
    date timestamptz DEFAULT now(),
    items jsonb DEFAULT '[]'::jsonb,
    total_amount numeric DEFAULT 0,
    subtotal numeric DEFAULT 0,
    total_gst numeric DEFAULT 0,
    status text DEFAULT 'open',
    remarks text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. DELIVERY CHALLANS
CREATE TABLE IF NOT EXISTS public.delivery_challans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    challan_serial_id text NOT NULL,
    supplier text NOT NULL,
    challan_number text,
    date timestamptz DEFAULT now(),
    items jsonb DEFAULT '[]'::jsonb,
    total_amount numeric DEFAULT 0,
    subtotal numeric DEFAULT 0,
    total_gst numeric DEFAULT 0,
    status text DEFAULT 'open',
    remarks text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    image_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. SUB CATEGORIES
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

-- 5. PROMOTIONS
CREATE TABLE IF NOT EXISTS public.promotions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    name text NOT NULL,
    slug text,
    description text,
    start_date date,
    end_date date,
    status text DEFAULT 'draft',
    priority integer DEFAULT 0,
    applies_to text[],
    assignment jsonb DEFAULT '{}'::jsonb,
    discount_type text,
    discount_value numeric DEFAULT 0,
    max_discount_amount numeric,
    is_gst_inclusive boolean DEFAULT false,
    channels text[],
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 6. PHYSICAL INVENTORY
CREATE TABLE IF NOT EXISTS public.physical_inventory (
    id text PRIMARY KEY, -- Using the Serial ID as PK
    organization_id text NOT NULL,
    status text DEFAULT 'in_progress',
    start_date timestamptz DEFAULT now(),
    end_date timestamptz,
    reason text,
    items jsonb DEFAULT '[]'::jsonb,
    total_variance_value numeric DEFAULT 0,
    performed_by_id uuid,
    performed_by_name text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 7. SECURITY: DISABLE RLS (MATCHING CURRENT SETUP)
DO $$
DECLARE
    tbl text;
BEGIN
    -- Corrected syntax: FOREACH ... IN ARRAY
    FOREACH tbl IN ARRAY ARRAY['sales_challans', 'delivery_challans', 'categories', 'sub_categories', 'promotions', 'physical_inventory']
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl) THEN
            EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
        END IF;
    END LOOP;
END $$;

-- 8. FORCE SCHEMA RELOAD
NOTIFY pgrst, 'reload schema';