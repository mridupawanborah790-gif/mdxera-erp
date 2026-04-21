-- Complete Voucher Numbering Schemes SQL (PostgreSQL / Supabase)
-- Includes:
-- 1) Document type enum
-- 2) Range-based scheme table and overlap guard
-- 3) Atomic number reservation from range table
-- 4) Audit table + logging function
-- 5) Configuration JSON based fallback reservation function

-- Required extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Enum of supported document types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'voucher_document_type'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.voucher_document_type AS ENUM (
      'sales-gst',
      'sales-non-gst',
      'purchase-entry',
      'purchase-order',
      'sales-challan',
      'delivery-challan',
      'physical-inventory'
    );
  END IF;
END $$;

-- 2) Numbering scheme table
CREATE TABLE IF NOT EXISTS public.voucher_number_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  branch_id text NULL,
  document_type public.voucher_document_type NOT NULL,
  fy text NOT NULL, -- example: 2025-26
  prefix text NOT NULL DEFAULT '',
  start_no integer NOT NULL CHECK (start_no >= 1),
  end_no integer NULL CHECK (end_no IS NULL OR end_no >= start_no),
  padding integer NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 12),
  reset_rule text NOT NULL DEFAULT 'financial-year' CHECK (reset_rule = 'financial-year'),
  current_running_no integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT voucher_number_ranges_current_bounds_chk
    CHECK (
      current_running_no >= start_no
      AND (end_no IS NULL OR current_running_no <= end_no + 1)
    )
);

CREATE INDEX IF NOT EXISTS idx_vnr_org_doc_fy
  ON public.voucher_number_ranges (organization_id, document_type, fy);

CREATE INDEX IF NOT EXISTS idx_vnr_org_doc_fy_prefix
  ON public.voucher_number_ranges (organization_id, document_type, fy, prefix);

CREATE UNIQUE INDEX IF NOT EXISTS ux_vnr_active_key
  ON public.voucher_number_ranges (organization_id, COALESCE(branch_id, ''), document_type, fy, prefix)
  WHERE is_active;

-- 3) No-overlap trigger for active ranges
CREATE OR REPLACE FUNCTION public.voucher_range_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_active THEN
    IF EXISTS (
      SELECT 1
      FROM public.voucher_number_ranges r
      WHERE r.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND r.is_active
        AND r.organization_id = NEW.organization_id
        AND COALESCE(r.branch_id, '') = COALESCE(NEW.branch_id, '')
        AND r.document_type = NEW.document_type
        AND r.fy = NEW.fy
        AND r.prefix = NEW.prefix
        AND int4range(r.start_no, COALESCE(r.end_no, 2147483647) + 1, '[)')
            && int4range(NEW.start_no, COALESCE(NEW.end_no, 2147483647) + 1, '[)')
    ) THEN
      RAISE EXCEPTION 'Voucher number range overlaps with an existing active configuration';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voucher_range_no_overlap ON public.voucher_number_ranges;
CREATE TRIGGER trg_voucher_range_no_overlap
BEFORE INSERT OR UPDATE ON public.voucher_number_ranges
FOR EACH ROW
EXECUTE FUNCTION public.voucher_range_no_overlap();

-- 4) Range-table based atomic reservation
CREATE OR REPLACE FUNCTION public.reserve_voucher_number_from_table(
  p_organization_id text,
  p_document_type public.voucher_document_type,
  p_fy text,
  p_branch_id text DEFAULT NULL,
  p_prefix text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text,
  document_number text,
  used_number integer,
  next_number integer,
  remaining_count integer,
  scheme_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row public.voucher_number_ranges%ROWTYPE;
  v_used integer;
  v_next integer;
  v_prefix text;
BEGIN
  SELECT *
  INTO v_row
  FROM public.voucher_number_ranges r
  WHERE r.organization_id = p_organization_id
    AND COALESCE(r.branch_id, '') = COALESCE(p_branch_id, '')
    AND r.document_type = p_document_type
    AND r.fy = p_fy
    AND (p_prefix IS NULL OR r.prefix = p_prefix)
    AND r.is_active = true
  ORDER BY r.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
      SELECT false, 'No active numbering scheme found', NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::uuid;
    RETURN;
  END IF;

  v_used := v_row.current_running_no;

  IF v_row.end_no IS NOT NULL AND v_used > v_row.end_no THEN
    RETURN QUERY SELECT false, 'Voucher range exhausted', NULL::text, v_used, v_used + 1, 0, v_row.id;
    RETURN;
  END IF;

  v_next := v_used + 1;
  v_prefix := COALESCE(v_row.prefix, '');

  UPDATE public.voucher_number_ranges
  SET current_running_no = v_next,
      updated_at = now()
  WHERE id = v_row.id;

  RETURN QUERY
    SELECT
      true,
      'Reserved',
      (v_prefix || LPAD(v_used::text, v_row.padding, '0') || '-' || v_row.fy),
      v_used,
      v_next,
      CASE WHEN v_row.end_no IS NULL THEN NULL ELSE (v_row.end_no - v_used) END,
      v_row.id;
END;
$$;

COMMENT ON FUNCTION public.reserve_voucher_number_from_table(text, public.voucher_document_type, text, text, text)
  IS 'Atomically reserves the next voucher number using SELECT ... FOR UPDATE on voucher_number_ranges.';

-- 5) Audit table
CREATE TABLE IF NOT EXISTS public.voucher_number_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  document_type text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('generated', 'used', 'cancelled')),
  document_number text NOT NULL,
  used_number integer,
  next_number integer,
  fy text,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voucher_number_audit_org_doc
  ON public.voucher_number_audit (organization_id, document_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_voucher_number_event(
  p_organization_id text,
  p_document_type text,
  p_event_type text,
  p_document_number text,
  p_reference_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.voucher_number_audit (
    organization_id,
    document_type,
    event_type,
    document_number,
    reference_id
  )
  VALUES (
    p_organization_id,
    p_document_type,
    p_event_type,
    p_document_number,
    p_reference_id
  );
END;
$$;

-- 6) Configuration JSON based atomic reservation
-- Requires public.configurations table with fields:
-- invoice_config, non_gst_invoice_config, purchase_config, purchase_order_config,
-- sales_challan_config, delivery_challan_config, physical_inventory_config
-- Drop first to avoid PostgreSQL 42P13 in environments where existing arg names differ.
DROP FUNCTION IF EXISTS public.reserve_voucher_number(text, text);
CREATE FUNCTION public.reserve_voucher_number(
  p_organization_id text,
  p_document_type text
)
RETURNS TABLE (
  success boolean,
  message text,
  document_number text,
  used_number integer,
  next_number integer,
  remaining_count integer,
  fy text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cfg_row public.configurations%ROWTYPE;
  cfg jsonb;
  cfg_key text;
  v_fy text;
  v_prefix text;
  v_start integer;
  v_end integer;
  v_padding integer;
  v_use_fy boolean;
  v_current integer;
  v_doc text;
BEGIN
  CASE p_document_type
    WHEN 'sales-gst' THEN cfg_key := 'invoice_config';
    WHEN 'sales-non-gst' THEN cfg_key := 'non_gst_invoice_config';
    WHEN 'purchase-entry' THEN cfg_key := 'purchase_config';
    WHEN 'purchase-order' THEN cfg_key := 'purchase_order_config';
    WHEN 'sales-challan' THEN cfg_key := 'sales_challan_config';
    WHEN 'delivery-challan' THEN cfg_key := 'delivery_challan_config';
    WHEN 'physical-inventory' THEN cfg_key := 'physical_inventory_config';
    ELSE
      RETURN QUERY SELECT false, 'Invalid document type', NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::text;
      RETURN;
  END CASE;

  SELECT *
  INTO cfg_row
  FROM public.configurations
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Configuration not found for organization', NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::text;
    RETURN;
  END IF;

  cfg := COALESCE(to_jsonb(cfg_row)->cfg_key, '{}'::jsonb);

  v_fy := CONCAT(
    CASE
      WHEN EXTRACT(MONTH FROM CURRENT_DATE)::int >= 4 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int
      ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - 1
    END,
    '-',
    LPAD((
      CASE
        WHEN EXTRACT(MONTH FROM CURRENT_DATE)::int >= 4 THEN (EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) % 100
        ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int % 100
      END
    )::text, 2, '0')
  );

  v_prefix := COALESCE(cfg->>'prefix', 'INV');
  v_start := GREATEST(1, COALESCE((cfg->>'startingNumber')::integer, 1));
  v_end := NULLIF(cfg->>'endNumber', '')::integer;
  v_padding := GREATEST(1, COALESCE((cfg->>'paddingLength')::integer, 6));
  v_use_fy := COALESCE((cfg->>'useFiscalYear')::boolean, true);
  v_current := GREATEST(v_start, COALESCE((cfg->>'currentNumber')::integer, v_start));

  IF v_end IS NOT NULL AND v_current > v_end THEN
    RETURN QUERY SELECT false, 'Voucher range exhausted', NULL::text, v_current, (v_current + 1), 0, v_fy;
    RETURN;
  END IF;

  v_doc := v_prefix || LPAD(v_current::text, v_padding, '0') || CASE WHEN v_use_fy THEN '-' || v_fy ELSE '' END;

  cfg := jsonb_set(cfg, '{fy}', to_jsonb(v_fy), true);
  cfg := jsonb_set(cfg, '{resetRule}', '"financial-year"'::jsonb, true);
  cfg := jsonb_set(cfg, '{currentNumber}', to_jsonb(v_current + 1), true);

  UPDATE public.configurations
  SET
    invoice_config = CASE WHEN cfg_key = 'invoice_config' THEN cfg ELSE invoice_config END,
    non_gst_invoice_config = CASE WHEN cfg_key = 'non_gst_invoice_config' THEN cfg ELSE non_gst_invoice_config END,
    purchase_config = CASE WHEN cfg_key = 'purchase_config' THEN cfg ELSE purchase_config END,
    purchase_order_config = CASE WHEN cfg_key = 'purchase_order_config' THEN cfg ELSE purchase_order_config END,
    sales_challan_config = CASE WHEN cfg_key = 'sales_challan_config' THEN cfg ELSE sales_challan_config END,
    delivery_challan_config = CASE WHEN cfg_key = 'delivery_challan_config' THEN cfg ELSE delivery_challan_config END,
    physical_inventory_config = CASE WHEN cfg_key = 'physical_inventory_config' THEN cfg ELSE physical_inventory_config END,
    updated_at = now()
  WHERE id = cfg_row.id;

  INSERT INTO public.voucher_number_audit (
    organization_id,
    document_type,
    event_type,
    document_number,
    used_number,
    next_number,
    fy
  )
  VALUES (
    p_organization_id,
    p_document_type,
    'generated',
    v_doc,
    v_current,
    v_current + 1,
    v_fy
  );

  RETURN QUERY
    SELECT true, 'Reserved', v_doc, v_current, (v_current + 1),
           CASE WHEN v_end IS NULL THEN NULL ELSE (v_end - v_current) END,
           v_fy;
END;
$$;
