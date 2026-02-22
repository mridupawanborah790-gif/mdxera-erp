-- ========================================================
-- MEDIMART RETAIL ERP: MASTER DATABASE SCHEMA
-- ========================================================

-- 1. EXTENSIONS & TYPES
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('owner', 'admin', 'manager', 'purchase', 'clerk', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. SECURITY HELPER FUNCTIONS
-- This function allows RLS policies to check the user's organization
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  SELECT organization_id::text INTO found_org_id FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 3. CORE TABLES RECREATION
DROP TABLE IF EXISTS public.profiles CASCADE;
CREATE TABLE public.profiles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id text NOT NULL,
    email text NOT NULL,
    full_name text,
    role public.user_role DEFAULT 'clerk',
    isActive boolean DEFAULT true,
    pharmacy_name text,
    manager_name text,
    address text,
    mobile text,
    retailer_gstin text,
    drug_license text,
    food_license text,
    pan_number text,
    bank_account_name text,
    bank_account_number text,
    bank_ifsc_code text,
    bank_upi_id text,
    authorized_signatory text,
    pharmacy_logo_url text,
    terms_and_conditions text,
    purchase_order_terms text,
    subscription_plan text DEFAULT 'starter',
    subscription_status text DEFAULT 'active',
    subscription_id text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

DROP TABLE IF EXISTS public.inventory CASCADE;
CREATE TABLE public.inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    brand text,
    category text DEFAULT 'General',
    manufacturer text,
    stock numeric DEFAULT 0,
    units_per_pack integer DEFAULT 1,
    pack_type text,
    unit_of_measurement text,
    pack_unit text,
    base_unit text,
    outer_pack text,
    units_per_outer_pack integer DEFAULT 0,
    min_stock_limit numeric DEFAULT 10,
    batch text NOT NULL,
    expiry date,
    purchase_price numeric DEFAULT 0,
    ptr numeric DEFAULT 0,
    mrp numeric DEFAULT 0,
    rate_a numeric DEFAULT 0,
    rate_b numeric DEFAULT 0,
    rate_c numeric DEFAULT 0,
    gst_percent numeric DEFAULT 0,
    hsn_code text,
    composition text,
    barcode text,
    deal integer DEFAULT 0,
    free integer DEFAULT 0,
    supplier_name text,
    rack_number text,
    cost numeric DEFAULT 0,
    value numeric DEFAULT 0,
    code text,
    description text,
    purchase_deal integer DEFAULT 0,
    purchase_free integer DEFAULT 0,
    tax_basis text DEFAULT '1-Tax Exclusive',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

DROP TABLE IF EXISTS public.transactions CASCADE;
CREATE TABLE public.transactions (
    id text PRIMARY KEY, -- Supports custom invoice numbers
    organization_id text NOT NULL,
    user_id uuid REFERENCES auth.users(id),
    date timestamptz NOT NULL DEFAULT now(),
    customer_name text NOT NULL,
    customer_id uuid,
    customer_phone text,
    referred_by text,
    items jsonb NOT NULL DEFAULT '[]'::jsonb,
    total numeric(15,2) DEFAULT 0,
    item_count integer DEFAULT 0,
    status text DEFAULT 'completed',
    payment_mode text DEFAULT 'Cash',
    bill_type text DEFAULT 'regular',
    subtotal numeric(15,2) DEFAULT 0,
    total_item_discount numeric(15,2) DEFAULT 0,
    total_gst numeric(15,2) DEFAULT 0,
    scheme_discount numeric(15,2) DEFAULT 0,
    round_off numeric(10,2) DEFAULT 0,
    amount_received numeric(15,2) DEFAULT 0,
    prescription_url text,
    e_way_bill_no text,
    e_way_bill_date date,
    billed_by_id uuid,
    billed_by_name text,
    tax_calculation_type text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

DROP TABLE IF EXISTS public.purchases CASCADE;
CREATE TABLE public.purchases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_serial_id text NOT NULL,
    organization_id text NOT NULL,
    user_id uuid REFERENCES auth.users(id),
    supplier text NOT NULL,
    invoice_number text NOT NULL,
    date date NOT NULL DEFAULT CURRENT_DATE,
    items jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_amount numeric(15,2) DEFAULT 0,
    subtotal numeric(15,2) DEFAULT 0,
    total_gst numeric(15,2) DEFAULT 0,
    total_item_discount numeric(15,2) DEFAULT 0,
    total_item_scheme_discount numeric(15,2) DEFAULT 0,
    scheme_discount numeric(15,2) DEFAULT 0,
    round_off numeric(10,2) DEFAULT 0,
    status text DEFAULT 'completed',
    reference_doc_number text,
    e_way_bill_no text,
    e_way_bill_date date,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

DROP TABLE IF EXISTS public.distributors CASCADE;
CREATE TABLE public.distributors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    gst_number text,
    pan_number text,
    phone text,
    email text,
    address text,
    state text,
    district text,
    drug_license text,
    payment_details jsonb DEFAULT '{}'::jsonb,
    ledger jsonb DEFAULT '[]'::jsonb,
    isActive boolean DEFAULT true,
    opening_balance numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

DROP TABLE IF EXISTS public.customers CASCADE;
CREATE TABLE public.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    phone text,
    email text,
    address text,
    area text,
    pincode text,
    district text,
    state text,
    gst_number text,
    drug_license text,
    pan_card text,
    ledger jsonb DEFAULT '[]'::jsonb,
    default_discount numeric DEFAULT 0,
    customer_type text DEFAULT 'regular',
    isActive boolean DEFAULT true,
    default_rate_tier text DEFAULT 'none',
    assigned_staff_id uuid,
    assigned_staff_name text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

DROP TABLE IF EXISTS public.medicine_master CASCADE;
CREATE TABLE public.medicine_master (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    material_code text NOT NULL,
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
    updated_at timestamptz DEFAULT now(),
    UNIQUE(organization_id, material_code)
);

DROP TABLE IF EXISTS public.distributor_product_map CASCADE;
CREATE TABLE public.distributor_product_map (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    distributor_id uuid NOT NULL,
    distributor_product_name text NOT NULL,
    master_medicine_id uuid NOT NULL,
    auto_apply boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

DROP TABLE IF EXISTS public.configurations CASCADE;
CREATE TABLE public.configurations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL UNIQUE,
    invoice_config jsonb,
    non_gst_invoice_config jsonb,
    purchase_order_config jsonb,
    purchase_config jsonb,
    physical_inventory_config jsonb,
    delivery_challan_config jsonb,
    sales_challan_config jsonb,
    master_shortcuts text[],
    display_options jsonb,
    modules jsonb,
    updated_at timestamptz DEFAULT now()
);

DROP TABLE IF EXISTS public.purchase_orders CASCADE;
CREATE TABLE public.purchase_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_id text NOT NULL,
    organization_id text NOT NULL,
    user_id uuid REFERENCES auth.users(id),
    date timestamptz NOT NULL DEFAULT now(),
    distributor_id uuid NOT NULL,
    distributor_name text NOT NULL,
    sender_email text,
    items jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'ordered',
    total_items integer DEFAULT 0,
    total_amount numeric(15,2) DEFAULT 0,
    remarks text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. APPLY ROW LEVEL SECURITY (RLS)
-- Iterate through all data tables to apply isolation
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (
        'inventory', 'transactions', 'purchases', 'distributors', 'customers', 
        'medicine_master', 'distributor_product_map', 'configurations', 
        'purchase_orders'
    )
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Org isolation policy" ON public.%I', tbl);
        EXECUTE format('CREATE POLICY "Org isolation policy" ON public.%I FOR ALL TO authenticated USING (organization_id = public.get_my_org_id()) WITH CHECK (organization_id = public.get_my_org_id())', tbl);
    END LOOP;
END $$;

-- Profiles are self-managed by the authenticated user
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are self-managed" ON public.profiles;
CREATE POLICY "Profiles are self-managed" ON public.profiles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 5. TRIGGER FOR UPDATED_AT
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
    FOR tbl IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (
        'profiles', 'inventory', 'transactions', 'purchases', 'distributors', 
        'customers', 'medicine_master', 'distributor_product_map', 
        'configurations', 'purchase_orders'
    )
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS tr_update_%I_modtime ON public.%I', tbl, tbl);
        EXECUTE format('CREATE TRIGGER tr_update_%I_modtime BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', tbl, tbl);
    END LOOP;
END $$;

-- 6. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_inventory_org ON public.inventory (organization_id);
CREATE INDEX IF NOT EXISTS idx_transactions_org ON public.transactions (organization_id);
CREATE INDEX IF NOT EXISTS idx_purchases_org ON public.purchases (organization_id);
CREATE INDEX IF NOT EXISTS idx_distributors_org ON public.distributors (organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_org ON public.customers (organization_id);
CREATE INDEX IF NOT EXISTS idx_med_master_material_code ON public.medicine_master (material_code);

NOTIFY pgrst, 'reload schema';