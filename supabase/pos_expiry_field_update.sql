-- ========================================================
-- MEDIMART RETAIL ERP: POS EXPIRY FIELD BACKFILL
-- Adds `colExpiry` default visibility for POS line item configuration.
-- Run in Supabase SQL editor.
-- ========================================================

DO $$
BEGIN
    UPDATE public.configurations
    SET modules = jsonb_set(
        COALESCE(modules, '{}'::jsonb),
        '{pos,fields,colExpiry}',
        'true'::jsonb,
        true
    )
    WHERE organization_id IS NOT NULL;
END $$;

NOTIFY pgrst, 'reload schema';
