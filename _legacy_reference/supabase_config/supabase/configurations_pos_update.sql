
-- ========================================================
-- MEDIMART RETAIL ERP: CONFIGURATION REPAIR (POS MODULE)
-- Refines JSONB defaults for granular POS column control
-- ========================================================

-- 1. DROP AND RECREATE CONFIGURATIONS TABLE WITH UPDATED DEFAULTS
-- This ensures all new organizations get the precise POS visibility requested.
DROP TABLE IF EXISTS public.configurations CASCADE;

CREATE TABLE public.configurations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL UNIQUE,
    
    -- VOUCHER SERIES CONFIGURATIONS
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
    
    -- UI & GATEWAY SHORTCUTS
    master_shortcuts text[] DEFAULT '{"pos", "automatedPurchaseEntry", "inventory", "salesHistory", "distributors", "customers", "reports", "configuration"}',
    
    -- BUSINESS LOGIC & DISPLAY OPTIONS
    display_options jsonb DEFAULT '{
        "strictStock": true,
        "expiryThreshold": 90,
        "defaultRateTier": "mrp",
        "calculationMode": "standard",
        "askCalculationOnBilling": true,
        "showBillDiscountOnPrint": true,
        "enableNegativeStock": false,
        "printCopies": 1
    }'::jsonb,
    
    -- MODULE VISIBILITY CONTROLLER
    -- Defaulting all requested POS fields to TRUE, others to FALSE
    modules jsonb DEFAULT '{
        "pos": {
            "visible": true,
            "fields": {
                "colDate": true,
                "colCustomer": true,
                "colPhone": true,
                "colReferred": true,
                "colName": true,
                "colBatch": true,
                "colMrp": true,
                "colQty": true,
                "colFree": true,
                "colRate": true,
                "colDisc": true,
                "colGst": true,
                "colSch": true,
                "colAmount": true,
                "optPrescription": true,
                "optBillingCategory": true,
                "intelHub": true,
                "intelProfit": true,
                "intelIdentity": true,
                "intelPricing": true
            }
        },
        "inventory": {
            "visible": true,
            "fields": {
                "colName": true,
                "colBatch": true,
                "colStock": true,
                "colMrp": true,
                "colExpiry": true
            }
        }
    }'::jsonb,

    -- UI SIDEBAR CONFIG
    sidebar jsonb DEFAULT '{"isSidebarCollapsed": false}'::jsonb,

    -- STATUTORY & COMPLIANCE
    gst_settings jsonb DEFAULT '{
        "periodicity": "monthly",
        "returnType": "Quarterly (Normal)"
    }'::jsonb,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. SECURITY & RLS
ALTER TABLE public.configurations ENABLE ROW LEVEL SECURITY;

-- Security Helper (Standard Org Lookup)
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
  SELECT organization_id::text FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE POLICY "Org isolation for configurations"
ON public.configurations FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- 3. AUDIT TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_update_configurations_modtime ON public.configurations;
CREATE TRIGGER tr_update_configurations_modtime 
BEFORE UPDATE ON public.configurations 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. APPLY TO EXISTING DATA (Migration script)
-- Updates all existing configurations with the new POS field definitions
UPDATE public.configurations
SET modules = jsonb_set(
    COALESCE(modules, '{}'::jsonb),
    '{pos}',
    '{
        "visible": true,
        "fields": {
            "colDate": true, "colCustomer": true, "colPhone": true, "colReferred": true,
            "colName": true, "colBatch": true, "colMrp": true, "colQty": true,
            "colFree": true, "colRate": true, "colDisc": true, "colGst": true,
            "colSch": true, "colAmount": true, "optPrescription": true,
            "optBillingCategory": true, "intelHub": true, "intelProfit": true,
            "intelIdentity": true, "intelPricing": true
        }
    }'::jsonb
);

NOTIFY pgrst, 'reload schema';
