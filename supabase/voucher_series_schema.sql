
-- ========================================================
-- MEDIMART RETAIL ERP: VOUCHER SERIES & CONFIG SCHEMA
-- Handles custom numbering for Sales, Purchases, POs, etc.
-- ========================================================

-- 1. ENSURE CONFIGURATIONS TABLE
CREATE TABLE IF NOT EXISTS public.configurations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL UNIQUE, -- Root Org ID
    
    -- Sales Series
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
    
    -- Purchase Series
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
    
    -- Logistics & Audit Series
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
    
    physical_inventory_config jsonb DEFAULT '{
        "prefix": "PHY-",
        "startingNumber": 1,
        "paddingLength": 6,
        "useFiscalYear": false,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb,

    -- UI/UX Preferences
    master_shortcuts text[] DEFAULT '{"pos", "automatedPurchaseEntry", "inventory", "salesHistory", "distributors", "customers", "reports", "configuration"}',
    display_options jsonb DEFAULT '{
        "expiryThreshold": 90,
        "defaultRateTier": "mrp",
        "enableNegativeStock": false,
        "printCopies": 1,
        "defaultTaxBasis": "1-Tax Exclusive"
    }'::jsonb,
    modules jsonb DEFAULT '{}'::jsonb,
    sidebar jsonb DEFAULT '{"isSidebarCollapsed": false}'::jsonb,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. APPLY ROW LEVEL SECURITY
ALTER TABLE public.configurations ENABLE ROW LEVEL SECURITY;

-- Isolation Policy
DROP POLICY IF EXISTS "Org isolation for config" ON public.configurations;
CREATE POLICY "Org isolation for config"
ON public.configurations FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- 3. UPDATED_AT TRIGGER
DROP TRIGGER IF EXISTS tr_update_config_modtime ON public.configurations;
CREATE TRIGGER tr_update_config_modtime 
BEFORE UPDATE ON public.configurations 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- NOTE: The redundant tr_on_profile_create_config trigger is removed.
-- Configuration initialization is now handled directly inside 
-- public.handle_new_user() to prevent signup timeout/errors.

NOTIFY pgrst, 'reload schema';
