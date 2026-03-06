-- Atomic voucher number reservation with row-level lock and audit trail

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
        WHEN 'sales-challan' THEN cfg_key := 'sales_challan_config';
        WHEN 'delivery-challan' THEN cfg_key := 'delivery_challan_config';
        WHEN 'physical-inventory' THEN cfg_key := 'physical_inventory_config';
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
    -- FY is system-controlled and always derived from current date/company FY cycle (Apr-Mar).
    v_fy := CONCAT(
        CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE)::int >= 4
            THEN EXTRACT(YEAR FROM CURRENT_DATE)::int
            ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - 1
        END,
        '-',
        LPAD((
            CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE)::int >= 4
                THEN (EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) % 100
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

    RETURN QUERY SELECT true, 'Reserved', v_doc, v_current, (v_current + 1), CASE WHEN v_end IS NULL THEN NULL ELSE (v_end - v_current) END, v_fy;
END;
$$;
