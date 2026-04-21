
-- ========================================================
-- MEDIMART RETAIL ERP: POS CONFIGURATION UPGRADE
-- Migration: 20240523_split_pos_qty
-- Replaces 'colQty' with 'colPQty' and 'colLQty'
-- ========================================================

DO $$ 
BEGIN
    -- 1. IDENTIFY ALL CONFIGURATIONS
    -- We use jsonb_set with a built-up fields object to ensure we don't destroy other settings
    
    UPDATE public.configurations
    SET modules = jsonb_set(
        modules,
        '{pos,fields}',
        (modules->'pos'->'fields') 
        - 'colQty' -- Remove the old merged field
        || '{"colPQty": true, "colLQty": true}'::jsonb -- Add the new granular fields
    )
    WHERE modules ? 'pos' AND (modules->'pos'->'fields') ? 'colQty';

    -- 2. Ensure default value for organization profiles that might have empty modules
    UPDATE public.configurations
    SET modules = jsonb_insert(
        COALESCE(modules, '{}'::jsonb),
        '{pos}',
        '{
            "visible": true,
            "fields": {
                "colDate": true, "colCustomer": true, "colPhone": true, "colReferred": true,
                "colName": true, "colBatch": true, "colExpiry": true, "colMrp": true, "colPQty": true, "colLQty": true,
                "colFree": true, "colRate": true, "colDisc": true, "colGst": true,
                "colSch": true, "colAmount": true, "optPrescription": true,
                "optBillingCategory": true, "intelHub": true, "intelProfit": true,
                "intelIdentity": true, "intelPricing": true
            }
        }'::jsonb
    )
    WHERE NOT (modules ? 'pos');

END $$;

NOTIFY pgrst, 'reload schema';
