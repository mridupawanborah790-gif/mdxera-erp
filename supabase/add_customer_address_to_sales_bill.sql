-- migration: add_customer_address_to_sales_bill.sql
-- Purpose: persist customer address captured in POS Sales vouchers.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sales_bill'
          AND column_name = 'customer_address'
    ) THEN
        ALTER TABLE public.sales_bill
            ADD COLUMN customer_address text;

        COMMENT ON COLUMN public.sales_bill.customer_address
            IS 'Customer billing address captured at voucher creation time.';
    END IF;
END $$;
