-- Receivables Payment Ledger Upgrade
-- Purpose:
-- 1) Support fast reporting for customer ledger JSONB payment metadata.
-- 2) Enforce at most one default bank per company.
-- 3) Provide invoice + receipt visibility with accounting voucher linkage.
--
-- Safe to run multiple times (idempotent where possible).

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Performance and documentation around customer ledger metadata
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customers_ledger_gin
ON public.customers
USING gin (ledger);

COMMENT ON COLUMN public.customers.ledger IS
'JSONB array of TransactionLedgerItem.
For receivable payments, optional keys may include:
paymentMode, bankAccountId, bankName, referenceInvoiceId, referenceInvoiceNumber, journalEntryId, journalEntryNumber.';

-- ---------------------------------------------------------------------
-- 2) Ensure only one default active bank per organization + company code
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_master_one_default_per_company
ON public.bank_master (organization_id, company_code_id)
WHERE default_bank = true AND active_status = 'Active';

COMMENT ON INDEX public.uq_bank_master_one_default_per_company IS
'Prevents multiple active default banks for the same organization and company code.';

-- ---------------------------------------------------------------------
-- 3) Flatten customer ledger JSON into a reporting view
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.customer_ledger_entries_v AS
SELECT
    c.organization_id,
    c.id AS customer_id,
    c.name AS customer_name,
    e.id AS ledger_entry_id,
    e.date AS entry_date,
    e.type AS entry_type,
    e.description,
    COALESCE(e.debit, 0)::numeric AS debit,
    COALESCE(e.credit, 0)::numeric AS credit,
    COALESCE(e.balance, 0)::numeric AS balance,
    NULLIF(e."paymentMode", '') AS payment_mode,
    NULLIF(e."bankAccountId", '') AS bank_account_id,
    NULLIF(e."bankName", '') AS bank_name,
    NULLIF(e."referenceInvoiceId", '') AS reference_invoice_id,
    NULLIF(e."referenceInvoiceNumber", '') AS reference_invoice_number,
    NULLIF(e."journalEntryId", '') AS journal_entry_id,
    NULLIF(e."journalEntryNumber", '') AS journal_entry_number
FROM public.customers c
CROSS JOIN LATERAL jsonb_to_recordset(COALESCE(c.ledger, '[]'::jsonb)) AS e(
    id text,
    date date,
    type text,
    description text,
    debit numeric,
    credit numeric,
    balance numeric,
    "paymentMode" text,
    "bankAccountId" text,
    "bankName" text,
    "referenceInvoiceId" text,
    "referenceInvoiceNumber" text,
    "journalEntryId" text,
    "journalEntryNumber" text
);

COMMENT ON VIEW public.customer_ledger_entries_v IS
'Flattened customer ledger entries (from customers.ledger JSONB), including payment mode, bank, invoice ref, and journal references.';

-- ---------------------------------------------------------------------
-- 4) Invoice-wise receivable summary with payment tracking and JE refs
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.customer_receivable_invoice_summary_v AS
WITH invoice_base AS (
    SELECT
        s.organization_id,
        COALESCE(s.customer_id, c.id) AS customer_id,
        COALESCE(c.name, s.customer_name) AS customer_name,
        s.id AS invoice_id,
        s.id AS invoice_number,
        s.date AS invoice_date,
        COALESCE(s.total, 0)::numeric AS invoice_amount
    FROM public.sales_bill s
    LEFT JOIN public.customers c
      ON c.organization_id = s.organization_id
     AND (
            c.id = s.customer_id
         OR lower(COALESCE(c.name, '')) = lower(COALESCE(s.customer_name, ''))
     )
    WHERE COALESCE(s.status, 'completed') <> 'cancelled'
),
payments AS (
    SELECT
        l.organization_id,
        l.customer_id,
        COALESCE(l.reference_invoice_id, l.reference_invoice_number) AS invoice_ref,
        SUM(COALESCE(l.credit, 0))::numeric AS amount_received,
        MAX(l.entry_date) AS latest_payment_date,
        MAX(l.payment_mode) AS payment_mode,
        MAX(l.bank_name) AS bank_name,
        MAX(l.journal_entry_number) AS journal_entry_number,
        MAX(l.journal_entry_id) AS journal_entry_id
    FROM public.customer_ledger_entries_v l
    WHERE l.entry_type = 'payment'
    GROUP BY l.organization_id, l.customer_id, COALESCE(l.reference_invoice_id, l.reference_invoice_number)
)
SELECT
    i.organization_id,
    i.customer_id,
    i.customer_name,
    i.invoice_id,
    i.invoice_number,
    i.invoice_date,
    i.invoice_amount,
    COALESCE(p.amount_received, 0)::numeric AS amount_received,
    (i.invoice_amount - COALESCE(p.amount_received, 0))::numeric AS balance_outstanding,
    p.latest_payment_date AS payment_date,
    p.payment_mode,
    p.bank_name,
    p.journal_entry_number,
    p.journal_entry_id
FROM invoice_base i
LEFT JOIN payments p
  ON p.organization_id = i.organization_id
 AND p.customer_id = i.customer_id
 AND p.invoice_ref = i.invoice_id;

COMMENT ON VIEW public.customer_receivable_invoice_summary_v IS
'Invoice-level receivable summary: invoice amount, amount received, outstanding balance, payment mode/date/bank, and related journal reference.';

COMMIT;
