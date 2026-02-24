
-- ========================================================
-- MEDIMART RETAIL ERP: PURCHASE CONFIGURATION SEED
-- Ensures the 'purchase' module has all required field flags 
-- defined in the organization configurations.
-- ========================================================

DO $$ 
BEGIN
    -- Update all existing configurations to include the new Purchase visibility fields
    -- Default: Hide everything, then show only requested entry and summary fields
    UPDATE public.configurations
    SET modules = jsonb_set(
        COALESCE(modules, '{}'::jsonb),
        '{purchase}',
        '{
            "visible": true,
            "fields": {
                "fieldSupplier": true,
                "fieldInvoiceNo": true,
                "fieldDate": true,
                "colName": true,
                "colBrand": true,
                "colBatch": true,
                "colExpiry": true,
                "colPack": true,
                "colMrp": true,
                "colQty": true,
                "colPurRate": true,
                "colDisc": true,
                "colSch": true,
                "colAmount": true,
                "sumGross": true,
                "sumTradeDisc": true,
                "sumSchDisc": true,
                "sumTaxable": true,
                "sumGst": true
            }
        }'::jsonb
    )
    WHERE organization_id IS NOT NULL;
END $$;

NOTIFY pgrst, 'reload schema';
