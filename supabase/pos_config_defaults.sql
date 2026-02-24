
-- ========================================================
-- MEDIMART RETAIL ERP: POS CONFIGURATION SEED
-- Ensures the 'pos' module has all required field flags 
-- defined in the organization configurations.
-- ========================================================

DO $$ 
BEGIN
    -- Update all existing configurations to include the new POS visibility fields
    -- COALESCE and jsonb_set ensure we don't wipe out other existing module settings.
    UPDATE public.configurations
    SET modules = jsonb_set(
        COALESCE(modules, '{}'::jsonb),
        '{pos}',
        '{
            "visible": true,
            "fields": {
                "colDate": true,
                "colCustomer": true,
                "colPhone": true,
                "colReferred": true,
                "colName": true,
                "colBatch": true,
                "colExpiry": true,
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
        }'::jsonb
    )
    WHERE organization_id IS NOT NULL;
END $$;

NOTIFY pgrst, 'reload schema';
