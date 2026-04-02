-- Function to revert a reserved voucher number if it was never actually used/saved.
-- This helps avoid gaps in numbering when a user starts an audit session but immediately discards it.

CREATE OR REPLACE FUNCTION public.revert_voucher_number(
    p_organization_id text,
    p_document_type text,
    p_document_number text
)
RETURNS TABLE (
    success boolean,
    message text,
    new_current_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cfg_row public.configurations%ROWTYPE;
    cfg jsonb;
    cfg_key text;
    v_current_in_db integer;
    v_prefix text;
    v_padding integer;
    v_use_fy boolean;
    v_fy text;
    v_expected_doc text;
    v_reverted_number integer;
BEGIN
    -- 1. Identify configuration key
    CASE p_document_type
        WHEN 'sales-gst' THEN cfg_key := 'invoice_config';
        WHEN 'sales-non-gst' THEN cfg_key := 'non_gst_invoice_config';
        WHEN 'purchase-entry' THEN cfg_key := 'purchase_config';
        WHEN 'purchase-order' THEN cfg_key := 'purchase_order_config';
        WHEN 'sales-challan' THEN cfg_key := 'sales_challan_config';
        WHEN 'delivery-challan' THEN cfg_key := 'delivery_challan_config';
        WHEN 'physical-inventory' THEN cfg_key := 'physical_inventory_config';
        ELSE
            RETURN QUERY SELECT false, 'Invalid document type', NULL::integer;
            RETURN;
    END CASE;

    -- 2. Lock configuration row
    SELECT * INTO cfg_row
    FROM public.configurations
    WHERE organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Configuration not found', NULL::integer;
        RETURN;
    END IF;

    cfg := COALESCE(to_jsonb(cfg_row)->cfg_key, '{}'::jsonb);
    v_current_in_db := (cfg->>'currentNumber')::integer;
    v_prefix := COALESCE(cfg->>'prefix', 'INV');
    v_padding := GREATEST(1, COALESCE((cfg->>'paddingLength')::integer, 6));
    v_use_fy := COALESCE((cfg->>'useFiscalYear')::boolean, true);
    v_fy := cfg->>'fy';

    -- 3. Safety Check: Can only revert if p_document_number corresponds to (v_current_in_db - 1)
    -- This ensures we only revert the MOST RECENTLY generated number and no one else has reserved a newer one.
    v_reverted_number := v_current_in_db - 1;
    
    IF v_reverted_number < 1 THEN
        RETURN QUERY SELECT false, 'Cannot revert below 1', v_current_in_db;
        RETURN;
    END IF;

    v_expected_doc := v_prefix || LPAD(v_reverted_number::text, v_padding, '0') || CASE WHEN v_use_fy AND v_fy IS NOT NULL THEN '-' || v_fy ELSE '' END;

    IF v_expected_doc <> p_document_number THEN
        -- The number being cancelled is not the latest one in the sequence.
        -- We cannot revert because it would create a duplicate later.
        -- Just log the cancellation and exit.
        PERFORM public.log_voucher_number_event(p_organization_id, p_document_type, 'cancelled', p_document_number, NULL);
        RETURN QUERY SELECT false, 'Voucher is not the latest in sequence; skipping counter revert to prevent duplicates.', v_current_in_db;
        RETURN;
    END IF;

    -- 4. Perform Revert
    cfg := jsonb_set(cfg, '{currentNumber}', to_jsonb(v_reverted_number), true);

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

    -- 5. Log the event
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
        'cancelled',
        p_document_number,
        v_reverted_number,
        v_current_in_db,
        v_fy
    );

    RETURN QUERY SELECT true, 'Voucher number reverted successfully', v_reverted_number;
END;
$$;
