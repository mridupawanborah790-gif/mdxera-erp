export const SQL_008_SALES_BILL_COLUMNS = `
ALTER TABLE sales_bill ADD COLUMN invoice_number TEXT;
ALTER TABLE sales_bill ADD COLUMN customer_address TEXT;
ALTER TABLE sales_bill ADD COLUMN referred_by TEXT;
ALTER TABLE sales_bill ADD COLUMN doctor_id TEXT;
ALTER TABLE sales_bill ADD COLUMN amount_received REAL DEFAULT 0;
ALTER TABLE sales_bill ADD COLUMN prescription_images TEXT;
ALTER TABLE sales_bill ADD COLUMN prescription_url TEXT;
ALTER TABLE sales_bill ADD COLUMN e_way_bill_no TEXT;
ALTER TABLE sales_bill ADD COLUMN e_way_bill_date TEXT;
ALTER TABLE sales_bill ADD COLUMN billed_by_id TEXT;
ALTER TABLE sales_bill ADD COLUMN billed_by_name TEXT;
ALTER TABLE sales_bill ADD COLUMN tax_calculation_type TEXT;
ALTER TABLE sales_bill ADD COLUMN linked_challans TEXT;
ALTER TABLE sales_bill ADD COLUMN previous_balance_before_bill REAL;
ALTER TABLE sales_bill ADD COLUMN balance_after_bill REAL;
ALTER TABLE sales_bill ADD COLUMN company_code_id TEXT;
ALTER TABLE sales_bill ADD COLUMN set_of_books_id TEXT;

-- Returns tables
ALTER TABLE sales_returns ADD COLUMN original_invoice_number TEXT;
ALTER TABLE purchase_returns ADD COLUMN original_invoice_number TEXT;
`;
