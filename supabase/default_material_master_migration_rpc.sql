-- Default Material Master Migration RPCs
-- Source must be public."material_master_all(migration)"

DO $$
BEGIN
  IF to_regclass('public."material_master_all(migration)"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public."material_master_all(migration)" TO authenticated';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.preview_default_material_master_migration(
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
  ), src_data AS (
    SELECT
      to_jsonb(src) AS j
    FROM public."material_master_all(migration)" src
    WHERE COALESCE((to_jsonb(src)->>'is_demo')::boolean, true) = true
  )
  SELECT
    j->>'id' AS id,
    j->>'industry' AS industry,
    COALESCE((j->>'is_demo')::boolean, true) AS is_demo,
    j->>'business_type' AS business_type,
    j->>'material_name' AS material_name,
    j->>'item_code' AS item_code,
    j->>'sku' AS sku,
    j->>'barcode' AS barcode,
    j->>'pack' AS pack,
    j->>'uom' AS uom,
    j->>'hsn' AS hsn,
    NULLIF(j->>'gst_rate', '')::numeric AS gst_rate,
    j->>'category' AS category,
    j->>'manufacturer' AS manufacturer,
    j->>'brand' AS brand,
    NULLIF(j->>'mrp', '')::numeric AS mrp,
    NULLIF(j->>'purchase_rate', '')::numeric AS purchase_rate,
    NULLIF(j->>'sale_rate', '')::numeric AS sale_rate,
    EXISTS (
      SELECT 1
      FROM public.material_master mm
      CROSS JOIN ctx
      WHERE mm.organization_id = ctx.organization_id
        AND lower(trim(mm.name)) = lower(trim(COALESCE(j->>'material_name', '')))
        AND COALESCE(NULLIF(trim(mm.pack), ''), '') = COALESCE(NULLIF(trim(COALESCE(j->>'pack', '')), ''), '')
        AND (
          NOT p_use_material_code
          OR COALESCE(NULLIF(trim(mm.material_code), ''), '') = COALESCE(NULLIF(trim(COALESCE(j->>'item_code', '')), ''), '')
        )
    ) AS duplicate_exists
  FROM src_data
  ORDER BY COALESCE(j->>'material_name', '');
$$;

CREATE OR REPLACE FUNCTION public.run_default_material_master_migration(
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
  v_name text;
  v_pack text;
  v_item_code text;
  v_sku text;
  v_barcode text;
  v_brand text;
  v_manufacturer text;
  v_category text;
  v_hsn text;
  v_mrp numeric;
  v_purchase_rate numeric;
  v_sale_rate numeric;
  v_gst_rate numeric;
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
    SELECT to_jsonb(src) AS j
    FROM public."material_master_all(migration)" src
    WHERE COALESCE((to_jsonb(src)->>'is_demo')::boolean, true) = true
    ORDER BY COALESCE(to_jsonb(src)->>'material_name', '')
  LOOP
    v_found := v_found + 1;
    v_name := COALESCE(r.j->>'material_name', '');
    v_pack := r.j->>'pack';
    v_item_code := r.j->>'item_code';
    v_sku := r.j->>'sku';
    v_barcode := r.j->>'barcode';
    v_brand := r.j->>'brand';
    v_manufacturer := r.j->>'manufacturer';
    v_category := r.j->>'category';
    v_hsn := r.j->>'hsn';
    v_mrp := COALESCE(NULLIF(r.j->>'mrp', '')::numeric, 0);
    v_purchase_rate := COALESCE(NULLIF(r.j->>'purchase_rate', '')::numeric, 0);
    v_sale_rate := COALESCE(NULLIF(r.j->>'sale_rate', '')::numeric, 0);
    v_gst_rate := COALESCE(NULLIF(r.j->>'gst_rate', '')::numeric, 0);

    SELECT mm.id INTO v_existing_id
    FROM public.material_master mm
    WHERE mm.organization_id = v_org
      AND lower(trim(mm.name)) = lower(trim(v_name))
      AND COALESCE(NULLIF(trim(mm.pack), ''), '') = COALESCE(NULLIF(trim(v_pack), ''), '')
      AND (
        NOT p_use_material_code
        OR COALESCE(NULLIF(trim(mm.material_code), ''), '') = COALESCE(NULLIF(trim(v_item_code), ''), '')
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      v_duplicates := v_duplicates + 1;
    END IF;

    IF upper(COALESCE(p_duplicate_mode, 'SKIP')) = 'SKIP' THEN
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
          v_name,
          COALESCE(NULLIF(trim(v_item_code), ''), COALESCE(NULLIF(trim(v_sku), ''), gen_random_uuid()::text)),
          v_barcode,
          COALESCE(NULLIF(trim(v_brand), ''), v_manufacturer),
          v_manufacturer,
          v_pack,
          v_category,
          v_mrp,
          v_purchase_rate,
          v_sale_rate,
          v_gst_rate,
          v_hsn,
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
          material_code = COALESCE(NULLIF(trim(v_item_code), ''), COALESCE(NULLIF(trim(v_sku), ''), material_code)),
          barcode = v_barcode,
          brand = COALESCE(NULLIF(trim(v_brand), ''), v_manufacturer),
          manufacturer = v_manufacturer,
          pack = v_pack,
          description = v_category,
          mrp = v_mrp,
          rate_a = v_purchase_rate,
          rate_b = v_sale_rate,
          gst_rate = v_gst_rate,
          hsn_code = v_hsn,
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
          v_name,
          COALESCE(NULLIF(trim(v_item_code), ''), COALESCE(NULLIF(trim(v_sku), ''), gen_random_uuid()::text)),
          v_barcode,
          COALESCE(NULLIF(trim(v_brand), ''), v_manufacturer),
          v_manufacturer,
          v_pack,
          v_category,
          v_mrp,
          v_purchase_rate,
          v_sale_rate,
          v_gst_rate,
          v_hsn,
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

GRANT EXECUTE ON FUNCTION public.preview_default_material_master_migration(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_default_material_master_migration(text, boolean) TO authenticated;
