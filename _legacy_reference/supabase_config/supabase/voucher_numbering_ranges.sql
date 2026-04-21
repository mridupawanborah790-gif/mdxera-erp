-- SAP-like FY-wise voucher numbering ranges
-- Supports: Sales Bill (GST), Sales Bill (Non-GST), Purchase Entry / Supplier Invoice, Purchase Order

-- 1) Enum of supported document types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'voucher_document_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.voucher_document_type AS ENUM (
      'sales-gst',
      'sales-non-gst',
      'purchase-entry',
      'purchase-order'
    );
  END IF;
END $$;

-- 2) Numbering scheme table (one active range per org+doc+fy+prefix)
CREATE TABLE IF NOT EXISTS public.voucher_number_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  branch_id text NULL,
  document_type public.voucher_document_type NOT NULL,
  fy text NOT NULL, -- e.g. 2025-26
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

-- Prevent duplicate active config key
CREATE UNIQUE INDEX IF NOT EXISTS ux_vnr_active_key
  ON public.voucher_number_ranges (organization_id, COALESCE(branch_id, ''), document_type, fy, prefix)
  WHERE is_active;

-- 3) Overlap guard for active ranges in same org+branch+doc+fy+prefix
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

-- 4) Atomic reservation function (row lock + increment)
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
    RETURN QUERY SELECT false, 'No active numbering scheme found', NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::uuid;
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
