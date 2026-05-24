-- ============================================================================
-- VOUCHER RANGE RESERVATION
-- ============================================================================
-- Apply this SQL once to your Supabase database. It creates a single function
-- that atomically reserves a chunk of voucher numbers for a specific device.
--
-- This is used by the offline-first MDXera ERP client. Each device requests a
-- range when online and uses numbers from that range while offline.
-- Multiple devices never receive overlapping ranges (atomic SELECT...FOR UPDATE).
--
-- Run this against your Supabase project (SQL Editor → New Query → paste → Run).
-- ============================================================================

DROP FUNCTION IF EXISTS public.reserve_voucher_range(text, text, text, integer);

CREATE OR REPLACE FUNCTION public.reserve_voucher_range(
  p_organization_id text,
  p_document_type   text,
  p_device_id       text,
  p_chunk_size      integer DEFAULT 100
)
RETURNS TABLE (
  success      boolean,
  message      text,
  range_start  integer,
  range_end    integer,
  fy           text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg_row   public.configurations%ROWTYPE;
  cfg       jsonb;
  cfg_key   text;
  v_fy      text;
  v_current integer;
  v_start   integer;
  v_end_cap integer;
BEGIN
  -- Validate chunk size
  IF p_chunk_size IS NULL OR p_chunk_size < 1 OR p_chunk_size > 10000 THEN
    p_chunk_size := 100;
  END IF;

  -- Map document_type to the JSON column that holds its config
  CASE p_document_type
    WHEN 'sales-gst'          THEN cfg_key := 'invoice_config';
    WHEN 'sales-non-gst'      THEN cfg_key := 'non_gst_invoice_config';
    WHEN 'purchase-entry'     THEN cfg_key := 'purchase_config';
    WHEN 'purchase-order'     THEN cfg_key := 'purchase_order_config';
    WHEN 'sales-challan'      THEN cfg_key := 'sales_challan_config';
    WHEN 'delivery-challan'   THEN cfg_key := 'delivery_challan_config';
    WHEN 'physical-inventory' THEN cfg_key := 'physical_inventory_config';
    ELSE
      RETURN QUERY SELECT false, 'Invalid document type', NULL::integer, NULL::integer, NULL::text;
      RETURN;
  END CASE;

  -- Atomically lock the configurations row
  SELECT * INTO cfg_row FROM public.configurations
   WHERE organization_id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Configuration not found for organization',
                       NULL::integer, NULL::integer, NULL::text;
    RETURN;
  END IF;

  cfg := COALESCE(to_jsonb(cfg_row) -> cfg_key, '{}'::jsonb);

  -- Compute current Indian fiscal year (April–March)
  v_fy := CONCAT(
    CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE)::int >= 4
         THEN EXTRACT(YEAR FROM CURRENT_DATE)::int
         ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - 1 END,
    '-',
    LPAD((
      CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE)::int >= 4
           THEN (EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) % 100
           ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int % 100 END
    )::text, 2, '0')
  );

  v_start   := GREATEST(1, COALESCE((cfg ->> 'startingNumber')::integer, 1));
  -- The legacy app stores the running counter in `internalCurrentNumber` and uses
  -- `currentNumber` for display formatting. Read both, take the highest so the
  -- new range allocator continues from wherever production has reached
  -- (avoids handing out numbers that already exist in sales_bill).
  v_current := GREATEST(
    v_start,
    COALESCE(NULLIF(cfg ->> 'internalCurrentNumber', '')::integer, v_start),
    COALESCE(NULLIF(cfg ->> 'currentNumber', '')::integer, v_start)
  );
  v_end_cap := NULLIF(cfg ->> 'endNumber', '')::integer;

  -- Reset counter at financial-year rollover if configured
  IF (cfg ->> 'resetRule') = 'financial-year'
     AND (cfg ->> 'fy') IS NOT NULL
     AND (cfg ->> 'fy') <> v_fy THEN
    v_current := v_start;
  END IF;

  -- Bail out if the configured end-number would be exceeded
  IF v_end_cap IS NOT NULL AND v_current > v_end_cap THEN
    RETURN QUERY SELECT false, 'Voucher range exhausted at endNumber cap',
                       v_current, v_current, v_fy;
    RETURN;
  END IF;

  -- Cap chunk_size to not overshoot endNumber
  IF v_end_cap IS NOT NULL AND (v_current + p_chunk_size - 1) > v_end_cap THEN
    p_chunk_size := v_end_cap - v_current + 1;
  END IF;

  -- Advance BOTH counter fields past the reserved range so the legacy app and
  -- the new range allocator stay in lockstep.
  cfg := jsonb_set(cfg, '{currentNumber}',         to_jsonb(v_current + p_chunk_size), true);
  cfg := jsonb_set(cfg, '{internalCurrentNumber}', to_jsonb(v_current + p_chunk_size), true);
  cfg := jsonb_set(cfg, '{fy}',                    to_jsonb(v_fy),                     true);
  cfg := jsonb_set(cfg, '{resetRule}',             '"financial-year"'::jsonb,          true);

  UPDATE public.configurations SET
    invoice_config             = CASE WHEN cfg_key = 'invoice_config'             THEN cfg ELSE invoice_config             END,
    non_gst_invoice_config     = CASE WHEN cfg_key = 'non_gst_invoice_config'     THEN cfg ELSE non_gst_invoice_config     END,
    purchase_config            = CASE WHEN cfg_key = 'purchase_config'            THEN cfg ELSE purchase_config            END,
    purchase_order_config      = CASE WHEN cfg_key = 'purchase_order_config'      THEN cfg ELSE purchase_order_config      END,
    sales_challan_config       = CASE WHEN cfg_key = 'sales_challan_config'       THEN cfg ELSE sales_challan_config       END,
    delivery_challan_config    = CASE WHEN cfg_key = 'delivery_challan_config'    THEN cfg ELSE delivery_challan_config    END,
    physical_inventory_config  = CASE WHEN cfg_key = 'physical_inventory_config'  THEN cfg ELSE physical_inventory_config  END,
    updated_at = now()
  WHERE id = cfg_row.id;

  -- Audit log (optional; uses existing voucher_number_audit if present).
  -- We use 'generated' as the event_type to match the existing CHECK constraint
  -- (event_type IN ('generated','used','cancelled')). The reference_id encodes
  -- the device_id + RANGE marker so range allocations can be identified later.
  BEGIN
    INSERT INTO public.voucher_number_audit (
      organization_id, document_type, event_type,
      document_number, used_number, next_number, fy, reference_id
    ) VALUES (
      p_organization_id, p_document_type, 'generated',
      'RANGE-' || v_current || '-' || (v_current + p_chunk_size - 1),
      v_current, v_current + p_chunk_size, v_fy,
      'device:' || p_device_id
    );
  EXCEPTION
    WHEN undefined_table THEN
      -- Audit table not present; skip logging
      NULL;
    WHEN OTHERS THEN
      -- Any other audit-log failure (constraint mismatch, permission, etc.)
      -- must NOT roll back the range allocation. Log to Postgres NOTICE and
      -- continue — the range is already reserved in configurations.
      RAISE NOTICE '[reserve_voucher_range] audit log skipped: %', SQLERRM;
  END;

  RETURN QUERY SELECT true,
                     'Reserved ' || p_chunk_size || ' numbers',
                     v_current,
                     v_current + p_chunk_size - 1,
                     v_fy;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_voucher_range(text, text, text, integer)
  TO authenticated;

COMMENT ON FUNCTION public.reserve_voucher_range(text, text, text, integer)
  IS 'Atomically reserves a chunk of voucher numbers for a specific device. Used by MDXera ERP offline-first client to pre-allocate ranges that won''t collide across devices.';
