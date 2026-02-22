-- ========================================================
-- MEDIMART ERP: REPAIR MISSING CORE TABLES (PGRST205 FIX)
-- ========================================================

-- Ensure UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Security Helper (Standardized)
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  SELECT organization_id::text INTO found_org_id FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 1. PURCHASE ORDERS
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    serial_id text NOT NULL,
    date timestamptz NOT NULL DEFAULT now(),
    distributor_id uuid NOT NULL,
    distributor_name text NOT NULL,
    sender_email text,
    items jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'ordered',
    sync_status text DEFAULT 'pending',
    total_items integer DEFAULT 0,
    total_amount numeric(15,2) DEFAULT 0,
    remarks text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. E-WAY BILLS
CREATE TABLE IF NOT EXISTS public.ewaybills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    "eWayBillNo" text NOT NULL,
    "eWayBillDate" timestamptz,
    "validUntil" timestamptz,
    "supplyType" text,
    "subSupplyType" text,
    "documentType" text,
    "documentNo" text,
    "documentDate" date,
    "fromGstin" text,
    "fromTrdName" text,
    "fromAddr1" text,
    "fromAddr2" text,
    "fromPlace" text,
    "fromPincode" integer,
    "fromStateCode" integer,
    "toGstin" text,
    "toTrdName" text,
    "toAddr1" text,
    "toAddr2" text,
    "toPlace" text,
    "toPincode" integer,
    "toStateCode" integer,
    "transactionType" text,
    "totalValue" numeric DEFAULT 0,
    "cgstValue" numeric DEFAULT 0,
    "sgstValue" numeric DEFAULT 0,
    "igstValue" numeric DEFAULT 0,
    "cessValue" numeric DEFAULT 0,
    "transportMode" text,
    "vehicleNo" text,
    "vehicleType" text,
    status text DEFAULT 'Generated',
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

-- 5. TEAM MEMBERS (Staff Identities)
CREATE TABLE IF NOT EXISTS public.team_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    technical_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    email text NOT NULL,
    name text NOT NULL,
    role text DEFAULT 'clerk',
    status text DEFAULT 'active',
    employee_id text,
    department text,
    is_locked boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 6. PROMOTIONS
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

-- 7. ENABLE RLS & ISOLATION POLICIES
DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['purchase_orders', 'ewaybills', 'categories', 'sub_categories', 'team_members', 'promotions']
    LOOP
        -- Enable RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
        
        -- Create Org Isolation Policy
        EXECUTE format('DROP POLICY IF EXISTS "Org isolation policy" ON public.%I', tbl);
        EXECUTE format(
            'CREATE POLICY "Org isolation policy" ON public.%I ' ||
            'FOR ALL TO authenticated ' ||
            'USING (organization_id = public.get_my_org_id()) ' ||
            'WITH CHECK (organization_id = public.get_my_org_id())',
            tbl
        );
        
        -- Performance Index
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (organization_id)', 'idx_' || tbl || '_org', tbl);
    END LOOP;
END $$;

-- 8. TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['purchase_orders', 'ewaybills', 'categories', 'sub_categories', 'team_members', 'promotions']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS tr_update_%I_modtime ON public.%I', tbl, tbl);
        EXECUTE format('CREATE TRIGGER tr_update_%I_modtime BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', tbl, tbl);
    END LOOP;
END $$;

-- 9. FORCE CACHE RELOAD
NOTIFY pgrst, 'reload schema';