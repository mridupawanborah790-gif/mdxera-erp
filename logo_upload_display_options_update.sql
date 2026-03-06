-- Adds default keys for pharmacy and dashboard logo uploads under configurations.display_options JSONB.
-- Safe to run multiple times.

UPDATE public.configurations
SET display_options = COALESCE(display_options, '{}'::jsonb)
    || jsonb_build_object(
        'pharmacyLogoUrl', COALESCE(display_options->>'pharmacyLogoUrl', ''),
        'dashboardLogoUrl', COALESCE(display_options->>'dashboardLogoUrl', '')
    )
WHERE TRUE;

COMMENT ON COLUMN public.configurations.display_options IS
'Flags for stock enforcement, printing preferences, and uploaded logo URLs (pharmacyLogoUrl, dashboardLogoUrl).';
