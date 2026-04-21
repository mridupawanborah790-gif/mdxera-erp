-- ========================================================
-- MEDIMART RETAIL ERP: PURCHASE FREE FIELD BACKFILL
-- Adds `colFree` default visibility for Purchase Entry configuration.
-- Run in Supabase SQL editor.
-- ========================================================

DO $$
BEGIN
    UPDATE public.configurations
    SET modules = jsonb_set(
        COALESCE(modules, '{}'::jsonb),
        '{purchase,fields,colFree}',
        'true'::jsonb,
        true
    )
    WHERE organization_id IS NOT NULL;
END $$;

NOTIFY pgrst, 'reload schema';
