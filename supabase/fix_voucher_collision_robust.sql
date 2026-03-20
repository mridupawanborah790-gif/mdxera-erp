-- ROBUST COLLISION-RESISTANT VOUCHER RESERVATION
-- This version ensures that if a counter gets out of sync, 
-- it auto-increments until it finds a truly unique number in the target table.

CREATE OR REPLACE FUNCTION public.reserve_voucher_number(
    p_organization_id text,
    p_document_type text,
    p_is_preview boolean DEFAULT false
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
SET search_path = public
AS $$
DECLARE
    cfg_row public.configurations%ROWTYPE;
    cfg jsonb;
    cfg_key text;
    target_table text;
    v_fy text;
    v_prefix text;
    v_start integer;
    v_end integer;
    v_padding integer;
    v_use_fy boolean;
    v_current integer;
    v_doc text;
    v_exists boolean;
    v_safe_counter integer := 0; -- Safety break for infinite loops
BEGIN
    -- 1. Identify Config Key and Target Table
    CASE p_document_type
        WHEN 'sales-gst' THEN 
            cfg_key := 'invoice_config';
            target_table := 'sales_bill';
        WHEN 'sales-non-gst' THEN 
            cfg_key := 'non_gst_invoice_config';
            target_table := 'sales_bill';
        WHEN 'purchase-entry' THEN 
            cfg_key := 'purchase_config';
            target_table := 'purchases';
        WHEN 'purchase-order' THEN 
            cfg_key := 'purchase_order_config';
            target_table := 'purchase_orders';
        WHEN 'sales-challan' THEN 
            cfg_key := 'sales_challan_config';
            target_table := 'sales_challans';
        WHEN 'delivery-challan' THEN 
            cfg_key := 'delivery_challan_config';
            target_table := 'delivery_challans';
        WHEN 'physical-inventory' THEN 
            cfg_key := 'physical_inventory_config';
            target_table := 'physical_inventory';
        ELSE
            RETURN QUERY SELECT false, 'Invalid document type: ' || p_document_type, NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::text;
            RETURN;
    END CASE;

    -- 2. Fetch and Lock Configuration
    IF p_is_preview THEN
        SELECT * INTO cfg_row FROM public.configurations WHERE organization_id = p_organization_id;
    ELSE
        SELECT * INTO cfg_row FROM public.configurations WHERE organization_id = p_organization_id FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Configuration not found for organization', NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::text;
        RETURN;
    END IF;

    cfg := COALESCE(to_jsonb(cfg_row)->cfg_key, '{}'::jsonb);
    
    -- 3. Derive Fiscal Year
    v_fy := CONCAT(
        CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE)::int >= 4 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - 1 END,
        '-',
        LPAD((CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE)::int >= 4 THEN (EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) % 100 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int % 100 END)::text, 2, '0')
    );

    v_prefix := COALESCE(cfg->>'prefix', '');
    v_start := GREATEST(1, COALESCE((cfg->>'startingNumber')::integer, 1));
    v_end := NULLIF(cfg->>'endNumber', '')::integer;
    v_padding := GREATEST(1, COALESCE((cfg->>'paddingLength')::integer, 6));
    v_use_fy := COALESCE((cfg->>'useFiscalYear')::boolean, true);
    v_current := GREATEST(v_start, COALESCE((cfg->>'currentNumber')::integer, v_start));

    -- 4. Collision Avoidance Loop
    -- We generate the document number and check if it already exists in the target table.
    -- If it does, we increment and try again. This self-heals out-of-sync counters.
    LOOP
        v_doc := v_prefix || LPAD(v_current::text, v_padding, '0') || CASE WHEN v_use_fy THEN '-' || v_fy ELSE '' END;
        
        v_exists := false;
        -- Dynamic existence check
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id = $1)', target_table)
        INTO v_exists
        USING v_doc;

        IF NOT v_exists THEN
            EXIT; -- Found a free number
        END IF;
        
        v_current := v_current + 1;
        v_safe_counter := v_safe_counter + 1;
        
        IF v_safe_counter > 1000 THEN
            RETURN QUERY SELECT false, 'Voucher search safety limit exceeded. Check for huge gaps in numbering.', NULL::text, v_current, (v_current + 1), 0, v_fy;
            RETURN;
        END IF;
    END LOOP;

    -- 5. Range Check
    IF v_end IS NOT NULL AND v_current > v_end THEN
        RETURN QUERY SELECT false, 'Voucher range exhausted', NULL::text, v_current, (v_current + 1), 0, v_fy;
        RETURN;
    END IF;

    -- 6. Return Preview if requested
    IF p_is_preview THEN
        RETURN QUERY SELECT true, 'Preview mode', v_doc, v_current, (v_current + 1), CASE WHEN v_end IS NULL THEN NULL ELSE (v_end - v_current) END, v_fy;
        RETURN;
    END IF;

    -- 7. Persist Reservation
    cfg := jsonb_set(cfg, '{fy}', to_jsonb(v_fy), true);
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

    -- 8. Log Event
    PERFORM public.log_voucher_number_event(p_organization_id, p_document_type, 'generated', v_doc, NULL);

    RETURN QUERY SELECT true, 'Reserved', v_doc, v_current, (v_current + 1), CASE WHEN v_end IS NULL THEN NULL ELSE (v_end - v_current) END, v_fy;
END;
$$;
