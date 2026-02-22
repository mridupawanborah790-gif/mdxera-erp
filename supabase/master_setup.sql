
-- ========================================================
-- MEDIMART RETAIL ERP: FULL SYSTEM SETUP (OPEN SCHEMA)
-- ========================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. CORE ENUMS
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('owner', 'admin', 'manager', 'purchase', 'clerk', 'viewer');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. UTILITY FUNCTIONS
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. TABLE CREATIONS

-- PROFILES
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
    role public.user_role DEFAULT 'owner',
    subscription_plan text DEFAULT 'starter',
    subscription_status text DEFAULT 'active',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- TEAM MEMBERS
CREATE TABLE IF NOT EXISTS public.team_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    email text NOT NULL,
    name text,
    role public.user_role NOT NULL,
    status text DEFAULT 'active',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- MEDICINE MASTER
CREATE TABLE IF NOT EXISTS public.medicine_master (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    name text NOT NULL,
    material_code text NOT NULL,
    composition text,
    pack text,
    barcode text,
    brand text,
    manufacturer text,
    marketer text,
    description text,
    gst_rate numeric DEFAULT 0,
    hsn_code text,
    mrp numeric DEFAULT 0,
    rate_a numeric DEFAULT 0,
    rate_b numeric DEFAULT 0,
    rate_c numeric DEFAULT 0,
    is_prescription_required boolean DEFAULT true,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(organization_id, material_code)
);

-- INVENTORY
CREATE TABLE IF NOT EXISTS public.inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    name text NOT NULL,
    batch text NOT NULL,
    expiry date,
    stock numeric DEFAULT 0,
    units_per_pack integer DEFAULT 1,
    purchase_price numeric DEFAULT 0,
    ptr numeric DEFAULT 0,
    mrp numeric DEFAULT 0,
    rate_a numeric DEFAULT 0,
    rate_b numeric DEFAULT 0,
    rate_c numeric DEFAULT 0,
    gst_percent numeric DEFAULT 0,
    hsn_code text,
    barcode text,
    brand text,
    category text,
    composition text,
    supplier_name text,
    rack_number text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.transactions (
    id text PRIMARY KEY,
    organization_id text NOT NULL,
    date timestamptz DEFAULT now(),
    customer_name text NOT NULL,
    customer_id uuid,
    customer_phone text,
    items jsonb DEFAULT '[]'::jsonb,
    total numeric DEFAULT 0,
    subtotal numeric DEFAULT 0,
    total_gst numeric DEFAULT 0,
    total_item_discount numeric DEFAULT 0,
    scheme_discount numeric DEFAULT 0,
    round_off numeric DEFAULT 0,
    payment_mode text DEFAULT 'Cash',
    status text DEFAULT 'completed',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- PURCHASES
CREATE TABLE IF NOT EXISTS public.purchases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    purchase_serial_id text NOT NULL,
    supplier text NOT NULL,
    invoice_number text NOT NULL,
    date date DEFAULT CURRENT_DATE,
    items jsonb DEFAULT '[]'::jsonb,
    total_amount numeric DEFAULT 0,
    subtotal numeric DEFAULT 0,
    total_gst numeric DEFAULT 0,
    status text DEFAULT 'completed',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- E-WAY BILLS
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

-- SALES RETURNS
CREATE TABLE IF NOT EXISTS public.sales_returns (
    id text PRIMARY KEY,
    organization_id text NOT NULL,
    date timestamptz DEFAULT now(),
    "originalInvoiceId" text NOT NULL,
    "customerName" text NOT NULL,
    "customerId" uuid,
    items jsonb DEFAULT '[]'::jsonb,
    "totalRefund" numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- PURCHASE RETURNS
CREATE TABLE IF NOT EXISTS public.purchase_returns (
    id text PRIMARY KEY,
    organization_id text NOT NULL,
    date timestamptz DEFAULT now(),
    "originalPurchaseInvoiceId" text NOT NULL,
    supplier text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb,
    "totalValue" numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- DISTRIBUTORS
CREATE TABLE IF NOT EXISTS public.distributors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    name text NOT NULL,
    gst_number text,
    pan_number text,
    phone text,
    email text,
    address text,
    district text,
    state text,
    payment_details jsonb DEFAULT '{}'::jsonb,
    ledger jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    opening_balance numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- CUSTOMERS
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
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
    customer_type text DEFAULT 'regular',
    default_discount numeric DEFAULT 0,
    ledger jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 5. ROBUST SANITIZATION TRIGGERS
-- These act as a safety net if the app bypasses camelCase sanitization

CREATE OR REPLACE FUNCTION public.fn_coerce_numeric_safety() RETURNS TRIGGER AS $$
BEGIN
    -- This function can be expanded to generic logic, but explicit table triggers are faster.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.fn_coerce_med_master_numeric() RETURNS TRIGGER AS $$
BEGIN
    NEW.gst_rate := COALESCE(NEW.gst_rate, 0);
    NEW.mrp := COALESCE(NEW.mrp, 0);
    NEW.rate_a := COALESCE(NEW.rate_a, 0);
    NEW.rate_b := COALESCE(NEW.rate_b, 0);
    NEW.rate_c := COALESCE(NEW.rate_c, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_coerce_med_master ON public.medicine_master;
CREATE TRIGGER tr_coerce_med_master BEFORE INSERT OR UPDATE ON public.medicine_master
FOR EACH ROW EXECUTE FUNCTION public.fn_coerce_med_master_numeric();

CREATE OR REPLACE FUNCTION public.fn_coerce_inventory_numeric() RETURNS TRIGGER AS $$
BEGIN
    NEW.stock := COALESCE(NEW.stock, 0);
    NEW.purchase_price := COALESCE(NEW.purchase_price, 0);
    NEW.ptr := COALESCE(NEW.ptr, 0);
    NEW.mrp := COALESCE(NEW.mrp, 0);
    NEW.rate_a := COALESCE(NEW.rate_a, 0);
    NEW.rate_b := COALESCE(NEW.rate_b, 0);
    NEW.rate_c := COALESCE(NEW.rate_c, 0);
    NEW.gst_percent := COALESCE(NEW.gst_percent, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_coerce_inventory ON public.inventory;
CREATE TRIGGER tr_coerce_inventory BEFORE INSERT OR UPDATE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.fn_coerce_inventory_numeric();

-- 6. PERMISSIVE SECURITY (DISABLE RLS)
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
    END LOOP;
END $$;

-- 7. AUTH & CONFIG TRIGGERS
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
    full_name = EXCLUDED.full_name,
    pharmacy_name = EXCLUDED.pharmacy_name;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. INDEXES
CREATE INDEX IF NOT EXISTS idx_inv_name ON public.inventory (lower(name));
CREATE INDEX IF NOT EXISTS idx_inv_batch ON public.inventory (lower(batch));
CREATE INDEX IF NOT EXISTS idx_tx_date ON public.transactions (date);
CREATE INDEX IF NOT EXISTS idx_pur_supplier ON public.purchases (lower(supplier));

NOTIFY pgrst, 'reload schema';
