-- Ensure legacy databases have all voucher config columns used by reserve_voucher_number()

ALTER TABLE IF EXISTS public.configurations
    ADD COLUMN IF NOT EXISTS sales_challan_config jsonb DEFAULT '{
        "prefix": "SC-",
        "startingNumber": 1,
        "paddingLength": 6,
        "useFiscalYear": false,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb,
    ADD COLUMN IF NOT EXISTS delivery_challan_config jsonb DEFAULT '{
        "prefix": "DC-",
        "startingNumber": 1,
        "paddingLength": 6,
        "useFiscalYear": false,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb,
    ADD COLUMN IF NOT EXISTS physical_inventory_config jsonb DEFAULT '{
        "prefix": "PHY-",
        "startingNumber": 1,
        "paddingLength": 6,
        "useFiscalYear": false,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb;

-- Backfill NULLs if columns existed without defaults.
UPDATE public.configurations
SET
    sales_challan_config = COALESCE(sales_challan_config, '{
        "prefix": "SC-",
        "startingNumber": 1,
        "paddingLength": 6,
        "useFiscalYear": false,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb),
    delivery_challan_config = COALESCE(delivery_challan_config, '{
        "prefix": "DC-",
        "startingNumber": 1,
        "paddingLength": 6,
        "useFiscalYear": false,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb),
    physical_inventory_config = COALESCE(physical_inventory_config, '{
        "prefix": "PHY-",
        "startingNumber": 1,
        "paddingLength": 6,
        "useFiscalYear": false,
        "currentNumber": 1,
        "activeMode": "external"
    }'::jsonb)
WHERE
    sales_challan_config IS NULL
    OR delivery_challan_config IS NULL
    OR physical_inventory_config IS NULL;

NOTIFY pgrst, 'reload schema';
