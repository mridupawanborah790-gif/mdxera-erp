-- Atomic voucher number reservation with row-level lock
CREATE OR REPLACE FUNCTION public.reserve_voucher_number(
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
        ELSE
            RETURN QUERY SELECT false, 'Invalid document type', NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::text;
            RETURN;
    END CASE;

    SELECT * INTO cfg_row
    FROM public.configurations
    WHERE organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Configuration not found for organization', NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::text;
        RETURN;
    END IF;

    cfg := COALESCE(to_jsonb(cfg_row)->cfg_key, '{}'::jsonb);
    v_fy := COALESCE(cfg->>'fy', CONCAT(EXTRACT(YEAR FROM CURRENT_DATE)::int, '-', LPAD(((EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) % 100)::text, 2, '0')));
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
        updated_at = now()
    WHERE id = cfg_row.id;

    RETURN QUERY SELECT true, 'Reserved', v_doc, v_current, (v_current + 1), CASE WHEN v_end IS NULL THEN NULL ELSE (v_end - v_current) END, v_fy;
END;
$$;
