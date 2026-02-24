-- ========================================================
-- MEDIMART RETAIL ERP: PURCHASE PACK FIELD VISIBILITY UPDATE
-- Adds `colPack` default visibility for Purchase Entry configuration.
-- Applies to both Manual and Automated (AI) purchase entry screens.
-- ========================================================

DO $$
BEGIN
    UPDATE public.configurations
    SET modules = jsonb_set(
        COALESCE(modules, '{}'::jsonb),
        '{purchase,fields,colPack}',
        'true'::jsonb,
        true
    )
    WHERE organization_id IS NOT NULL;
END $$;

NOTIFY pgrst, 'reload schema';
