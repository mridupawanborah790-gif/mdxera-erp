-- migration: add_invoice_number_to_sales_bill.sql
-- Goal: Add a separate invoice_number column to allow duplicate invoice numbers across organizations.
-- The 'id' column will remain the unique primary key (UUID for new records).

DO $$ 
BEGIN
    -- 1. Add invoice_number column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_bill' AND column_name = 'invoice_number') THEN
        ALTER TABLE public.sales_bill ADD COLUMN invoice_number text;
        
        -- Populate it with existing id (which currently holds the invoice number)
        UPDATE public.sales_bill SET invoice_number = id;
        
        COMMENT ON COLUMN public.sales_bill.invoice_number IS 'Organization-specific invoice number (may have duplicates across orgs).';
    END IF;

    -- 2. Add uniqueness constraint for (organization_id, invoice_number)
    -- This ensures that within one organization, invoice numbers are unique.
    -- We use a separate index to avoid blocking if there are already duplicates (which there shouldn't be since id was PK).
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_bill_org_invoice_unique') THEN
        ALTER TABLE public.sales_bill ADD CONSTRAINT sales_bill_org_invoice_unique UNIQUE (organization_id, invoice_number);
    END IF;

    -- 3. Add original_invoice_number to sales_returns if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_returns') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_returns' AND column_name = 'original_invoice_number') THEN
            ALTER TABLE public.sales_returns ADD COLUMN original_invoice_number text;
            
            -- Populate it from sales_bill (linking via original_invoice_id)
            UPDATE public.sales_returns sr
            SET original_invoice_number = sb.invoice_number
            FROM public.sales_bill sb
            WHERE sr.original_invoice_id = sb.id;
        END IF;
    END IF;

END $$;

-- 4. Update the transactions view to include invoice_number
-- We keep 'id' as the unique UUID from the table, but we ensure 'invoice_number' is available.
-- If we want to maintain backward compatibility where 'id' in the APP was the invoice number:
-- We can alias invoice_number AS display_id, but the safest is to just SELECT *.
CREATE OR REPLACE VIEW public.transactions AS 
SELECT 
    *,
    COALESCE(invoice_number, id) as display_invoice_number
FROM public.sales_bill;

COMMENT ON VIEW public.transactions IS 'Compatibility view for sales_bill. display_invoice_number provides the human-readable ID.';

NOTIFY pgrst, 'reload schema';
