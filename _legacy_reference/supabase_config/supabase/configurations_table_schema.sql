
-- ========================================================
-- MEDIMART RETAIL ERP: GLOBAL CONFIGURATIONS SCHEMA
-- Stores voucher numbering, UI preferences, and logic flags.
-- ========================================================

-- Ensure UUID extension is enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. CONFIGURATIONS TABLE
CREATE TABLE IF NOT EXISTS public.configurations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL UNIQUE, -- Root Identity Lock
    
    -- Voucher Numbering JSON Configurations
    invoice_config jsonb DEFAULT '{
        "prefix": "INV",
        "startingNumber": 1,
        "paddingLength": 7,
        "useFiscalYear": true,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb,
    
    non_gst_invoice_config jsonb DEFAULT '{
        "prefix": "NG",
        "startingNumber": 1,
        "paddingLength": 7,
        "useFiscalYear": true,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb,
    
    purchase_config jsonb DEFAULT '{
        "prefix": "PB-",
        "startingNumber": 1,
        "paddingLength": 7,
        "useFiscalYear": true,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb,
    
    purchase_order_config jsonb DEFAULT '{
        "prefix": "PUR-",
        "startingNumber": 1,
        "paddingLength": 8,
        "useFiscalYear": false,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb,
    
    delivery_challan_config jsonb DEFAULT '{
        "prefix": "DC-",
        "startingNumber": 1,
        "paddingLength": 6,
        "useFiscalYear": false,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb,
    
    sales_challan_config jsonb DEFAULT '{
        "prefix": "SC-",
        "startingNumber": 1,
        "paddingLength": 6,
        "useFiscalYear": false,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb,
    
    medicine_master_config jsonb DEFAULT '{
        "prefix": "SKU-",
        "startingNumber": 1,
        "paddingLength": 6,
        "useFiscalYear": false,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb,

    physical_inventory_config jsonb DEFAULT '{
        "prefix": "PHY-",
        "startingNumber": 1,
        "paddingLength": 6,
        "useFiscalYear": false,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb,

    -- UI/UX & Visibility Preferences
    master_shortcuts text[] DEFAULT '{"pos", "automatedPurchaseEntry", "inventory", "salesHistory", "distributors", "customers", "reports", "configuration"}',
    
    display_options jsonb DEFAULT '{
        "showMultipleRates": false,
        "strictStock": false,
        "showPurchaseRateInPOS": false,
        "expiryThreshold": 90,
        "defaultRateTier": "mrp",
        "calculationMode": "standard",
        "askCalculationOnBilling": true,
        "showBillDiscountOnPrint": true,
        "showItemWiseDiscountOnPrint": true,
        "enableNegativeStock": false,
        "printCopies": 1
    }'::jsonb,
    
    modules jsonb DEFAULT '{}'::jsonb,
    sidebar jsonb DEFAULT '{"isSidebarCollapsed": false}'::jsonb,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org isolation for configurations" ON public.configurations;
CREATE POLICY "Org isolation for configurations"
ON public.configurations FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_configurations_org ON public.configurations (organization_id);

-- 4. UPDATED_AT TRIGGER
DROP TRIGGER IF EXISTS update_configurations_updated_at ON public.configurations;
CREATE TRIGGER update_configurations_updated_at
BEFORE UPDATE ON public.configurations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- NOTE: The handle_new_org_configuration trigger is removed from here
-- because configuration initialization is now handled directly inside 
-- public.handle_new_user() to prevent signup timeout/errors.

NOTIFY pgrst, 'reload schema';
