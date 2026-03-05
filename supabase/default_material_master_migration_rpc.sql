-- Default Material Master Migration RPCs
-- Source must be public."material_master_all(migration)"

DO $$
BEGIN
  IF to_regclass('public."material_master_all(migration)"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public."material_master_all(migration)" TO authenticated';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.preview_default_material_master_migration(
  p_business_type text,
  p_use_material_code boolean DEFAULT false
)
RETURNS TABLE (
  id text,
  industry text,
  is_demo boolean,
  business_type text,
  material_name text,
  item_code text,
  sku text,
  barcode text,
  pack text,
  uom text,
  hsn text,
  gst_rate numeric,
  category text,
  manufacturer text,
  brand text,
  mrp numeric,
  purchase_rate numeric,
  sale_rate numeric,
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
    src.industry,
    src.is_demo,
    src.business_type,
    src.material_name,
    src.item_code,
    src.sku,
    src.barcode,
    src.pack,
    src.uom,
    src.hsn,
    src.gst_rate,
    src.category,
    src.manufacturer,
    src.brand,
    src.mrp,
    src.purchase_rate,
    src.sale_rate,
    EXISTS (
      SELECT 1
      FROM public.material_master mm
      CROSS JOIN ctx
      WHERE mm.organization_id = ctx.organization_id
        AND lower(trim(mm.name)) = lower(trim(src.material_name))
        AND COALESCE(NULLIF(trim(mm.pack), ''), '') = COALESCE(NULLIF(trim(src.pack), ''), '')
        AND (
          NOT p_use_material_code
          OR COALESCE(NULLIF(trim(mm.material_code), ''), '') = COALESCE(NULLIF(trim(src.item_code), ''), '')
        )
    ) AS duplicate_exists
  FROM public."material_master_all(migration)" src
  WHERE src.industry = 'PHARMACY'
    AND src.is_demo = true
    AND src.business_type = p_business_type
  ORDER BY src.material_name;
$$;

CREATE OR REPLACE FUNCTION public.run_default_material_master_migration(
  p_business_type text,
  p_duplicate_mode text DEFAULT 'SKIP',
  p_use_material_code boolean DEFAULT false
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
    FROM public."material_master_all(migration)" src
    WHERE src.industry = 'PHARMACY'
      AND src.is_demo = true
      AND src.business_type = p_business_type
    ORDER BY src.material_name
  LOOP
    v_found := v_found + 1;

    SELECT mm.id INTO v_existing_id
    FROM public.material_master mm
    WHERE mm.organization_id = v_org
      AND lower(trim(mm.name)) = lower(trim(r.material_name))
      AND COALESCE(NULLIF(trim(mm.pack), ''), '') = COALESCE(NULLIF(trim(r.pack), ''), '')
      AND (
        NOT p_use_material_code
        OR COALESCE(NULLIF(trim(mm.material_code), ''), '') = COALESCE(NULLIF(trim(r.item_code), ''), '')
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      v_duplicates := v_duplicates + 1;
    END IF;

    IF p_duplicate_mode = 'SKIP' THEN
      IF v_existing_id IS NOT NULL THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_ready := v_ready + 1;
        INSERT INTO public.material_master (
          organization_id, user_id, name, material_code, barcode, brand, manufacturer,
          pack, description, mrp, rate_a, rate_b, gst_rate, hsn_code,
          is_prescription_required, is_active
        ) VALUES (
          v_org,
          v_user,
          r.material_name,
          COALESCE(NULLIF(trim(r.item_code), ''), COALESCE(NULLIF(trim(r.sku), ''), r.id)),
          r.barcode,
          COALESCE(NULLIF(trim(r.brand), ''), r.manufacturer),
          r.manufacturer,
          r.pack,
          r.category,
          COALESCE(r.mrp, 0),
          COALESCE(r.purchase_rate, 0),
          COALESCE(r.sale_rate, 0),
          COALESCE(r.gst_rate, 0),
          r.hsn,
          false,
          true
        );
        v_imported := v_imported + 1;
      END IF;
    ELSE
      v_ready := v_ready + 1;
      IF v_existing_id IS NOT NULL THEN
        UPDATE public.material_master
        SET
          material_code = COALESCE(NULLIF(trim(r.item_code), ''), COALESCE(NULLIF(trim(r.sku), ''), r.id)),
          barcode = r.barcode,
          brand = COALESCE(NULLIF(trim(r.brand), ''), r.manufacturer),
          manufacturer = r.manufacturer,
          pack = r.pack,
          description = r.category,
          mrp = COALESCE(r.mrp, 0),
          rate_a = COALESCE(r.purchase_rate, 0),
          rate_b = COALESCE(r.sale_rate, 0),
          gst_rate = COALESCE(r.gst_rate, 0),
          hsn_code = r.hsn,
          updated_at = now()
        WHERE id = v_existing_id;
        v_updated := v_updated + 1;
      ELSE
        INSERT INTO public.material_master (
          organization_id, user_id, name, material_code, barcode, brand, manufacturer,
          pack, description, mrp, rate_a, rate_b, gst_rate, hsn_code,
          is_prescription_required, is_active
        ) VALUES (
          v_org,
          v_user,
          r.material_name,
          COALESCE(NULLIF(trim(r.item_code), ''), COALESCE(NULLIF(trim(r.sku), ''), r.id)),
          r.barcode,
          COALESCE(NULLIF(trim(r.brand), ''), r.manufacturer),
          r.manufacturer,
          r.pack,
          r.category,
          COALESCE(r.mrp, 0),
          COALESCE(r.purchase_rate, 0),
          COALESCE(r.sale_rate, 0),
          COALESCE(r.gst_rate, 0),
          r.hsn,
          false,
          true
        );
        v_imported := v_imported + 1;
      END IF;
    END IF;

    v_existing_id := NULL;
  END LOOP;

  RETURN QUERY
  SELECT v_found, v_duplicates, v_ready, v_imported, v_updated, v_skipped;
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_default_material_master_migration(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_default_material_master_migration(text, text, boolean) TO authenticated;
