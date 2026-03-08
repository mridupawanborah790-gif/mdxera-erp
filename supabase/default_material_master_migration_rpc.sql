-- Default Material Master Migration RPCs
-- Source: public.material_master_migration

DO $$
BEGIN
  IF to_regclass('public.material_master_migration') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public.material_master_migration TO authenticated';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.preview_default_material_master_migration()
RETURNS TABLE (
  id uuid,
  name text,
  material_code text,
  barcode text,
  brand text,
  manufacturer text,
  marketer text,
  composition text,
  pack text,
  description text,
  directions text,
  storage text,
  uses text,
  side_effects text,
  benefits text,
  mrp numeric,
  rate_a numeric,
  rate_b numeric,
  rate_c numeric,
  gst_rate numeric,
  hsn_code text,
  is_prescription_required boolean,
  is_active boolean,
  country_of_origin text,
  material_master_type text,
  is_inventorised boolean,
  is_sales_enabled boolean,
  is_purchase_enabled boolean,
  is_production_enabled boolean,
  is_internal_issue_enabled boolean,
  allow_packaging_sale boolean,
  duplicate_exists boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH ctx AS (
    SELECT COALESCE(public.get_my_org_id(), '') AS organization_id
  )
  SELECT
    src.id,
    src.name,
    src.material_code,
    src.barcode,
    src.brand,
    src.manufacturer,
    src.marketer,
    src.composition,
    src.pack,
    src.description,
    src.directions,
    src.storage,
    src.uses,
    src.side_effects,
    src.benefits,
    src.mrp,
    src.rate_a,
    src.rate_b,
    src.rate_c,
    src.gst_rate,
    src.hsn_code,
    src.is_prescription_required,
    src.is_active,
    src.country_of_origin,
    src.material_master_type,
    src.is_inventorised,
    src.is_sales_enabled,
    src.is_purchase_enabled,
    src.is_production_enabled,
    src.is_internal_issue_enabled,
    src.allow_packaging_sale,
    EXISTS (
      SELECT 1
      FROM public.material_master mm
      CROSS JOIN ctx
      WHERE mm.organization_id = ctx.organization_id
        AND lower(trim(mm.name)) = lower(trim(src.name))
    ) AS duplicate_exists
  FROM public.material_master_migration src
  ORDER BY src.name;
$$;

CREATE OR REPLACE FUNCTION public.run_default_material_master_migration(
  p_duplicate_mode text DEFAULT 'SKIP'
)
RETURNS TABLE (
  found_count integer,
  duplicates_count integer,
  ready_count integer,
  imported_count integer,
  updated_count integer,
  skipped_count integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_org text := COALESCE(public.get_my_org_id(), '');
  v_user uuid := auth.uid();
  r record;
  v_existing_id uuid;
  v_found integer := 0;
  v_duplicates integer := 0;
  v_ready integer := 0;
  v_imported integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
BEGIN
  IF v_org = '' THEN
    RAISE EXCEPTION 'Organization context not found';
  END IF;

  FOR r IN
    SELECT *
    FROM public.material_master_migration src
    ORDER BY src.name
  LOOP
    v_found := v_found + 1;

    SELECT mm.id INTO v_existing_id
    FROM public.material_master mm
    WHERE mm.organization_id = v_org
      AND lower(trim(mm.name)) = lower(trim(r.name))
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      v_duplicates := v_duplicates + 1;
    END IF;

    IF p_duplicate_mode = 'SKIP' AND v_existing_id IS NOT NULL THEN
        v_skipped := v_skipped + 1;
    ELSE
        v_ready := v_ready + 1;
        IF v_existing_id IS NOT NULL THEN
            UPDATE public.material_master
            SET
              material_code = r.material_code,
              barcode = r.barcode,
              brand = r.brand,
              manufacturer = r.manufacturer,
              marketer = r.marketer,
              composition = r.composition,
              pack = r.pack,
              description = r.description,
              directions = r.directions,
              storage = r.storage,
              uses = r.uses,
              side_effects = r.side_effects,
              benefits = r.benefits,
              mrp = COALESCE(r.mrp, 0),
              rate_a = COALESCE(r.rate_a, 0),
              rate_b = COALESCE(r.rate_b, 0),
              rate_c = COALESCE(r.rate_c, 0),
              gst_rate = COALESCE(r.gst_rate, 0),
              hsn_code = r.hsn_code,
              is_prescription_required = COALESCE(r.is_prescription_required, false),
              is_active = COALESCE(r.is_active, true),
              country_of_origin = r.country_of_origin,
              material_master_type = r.material_master_type,
              is_inventorised = COALESCE(r.is_inventorised, true),
              is_sales_enabled = COALESCE(r.is_sales_enabled, true),
              is_purchase_enabled = COALESCE(r.is_purchase_enabled, true),
              is_production_enabled = COALESCE(r.is_production_enabled, false),
              is_internal_issue_enabled = COALESCE(r.is_internal_issue_enabled, false),
              allow_packaging_sale = COALESCE(r.allow_packaging_sale, false),
              updated_at = now(),
              user_id = v_user
            WHERE id = v_existing_id;
            v_updated := v_updated + 1;
        ELSE
            INSERT INTO public.material_master (
              organization_id, user_id, name, material_code, barcode, brand, manufacturer,
              marketer, composition, pack, description, directions, storage, uses,
              side_effects, benefits, mrp, rate_a, rate_b, rate_c, gst_rate, hsn_code,
              is_prescription_required, is_active, country_of_origin, material_master_type,
              is_inventorised, is_sales_enabled, is_purchase_enabled, is_production_enabled,
              is_internal_issue_enabled, allow_packaging_sale, created_at, updated_at
            ) VALUES (
              v_org,
              v_user,
              r.name,
              r.material_code,
              r.barcode,
              r.brand,
              r.manufacturer,
              r.marketer,
              r.composition,
              r.pack,
              r.description,
              r.directions,
              r.storage,
              r.uses,
              r.side_effects,
              r.benefits,
              COALESCE(r.mrp, 0),
              COALESCE(r.rate_a, 0),
              COALESCE(r.rate_b, 0),
              COALESCE(r.rate_c, 0),
              COALESCE(r.gst_rate, 0),
              r.hsn_code,
              COALESCE(r.is_prescription_required, false),
              COALESCE(r.is_active, true),
              r.country_of_origin,
              r.material_master_type,
              COALESCE(r.is_inventorised, true),
              COALESCE(r.is_sales_enabled, true),
              COALESCE(r.is_purchase_enabled, true),
              COALESCE(r.is_production_enabled, false),
              COALESCE(r.is_internal_issue_enabled, false),
              COALESCE(r.allow_packaging_sale, false),
              now(),
              now()
            );
            v_imported := v_imported + 1;
        END IF;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT v_found, v_duplicates, v_ready, v_imported, v_updated, v_skipped;
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_default_material_master_migration() TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_default_material_master_migration(text) TO authenticated;

