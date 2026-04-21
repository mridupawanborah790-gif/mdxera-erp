-- ========================================================
-- MEDIMART RETAIL ERP: ACCOUNTING JOURNAL SCHEMA
-- Creates journal entry header/line tables used by accounting viewers and posting flows.
-- ========================================================

-- Ensure helper exists for org-scoped RLS
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS text AS $$
DECLARE
  found_org_id text;
BEGIN
  SELECT organization_id::text INTO found_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  RETURN COALESCE(found_org_id, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 1) JOURNAL ENTRY HEADER
CREATE TABLE IF NOT EXISTS public.journal_entry_header (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL,
    journal_entry_number text NOT NULL,
    posting_date date NOT NULL DEFAULT CURRENT_DATE,
    status text NOT NULL DEFAULT 'Posted' CHECK (status IN ('Draft', 'Posted', 'Reversed')),

    -- Reference links (supports legacy and current field names used by app code)
    reference_type text,
    reference_id text,
    reference_document_id text,
    document_type text,
    document_reference text,

    -- Accounting dimensions
    company text,
    company_code_id text,
    set_of_books text,
    set_of_books_id text,

    narration text,
    currency_code text NOT NULL DEFAULT 'INR',
    total_debit numeric(15,2) NOT NULL DEFAULT 0,
    total_credit numeric(15,2) NOT NULL DEFAULT 0,

    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT journal_entry_header_totals_chk CHECK (total_debit >= 0 AND total_credit >= 0),
    CONSTRAINT journal_entry_header_number_uniq UNIQUE (organization_id, journal_entry_number)
);

-- 2) JOURNAL ENTRY LINES
CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
    id bigserial PRIMARY KEY,
    organization_id text NOT NULL,
    journal_entry_id uuid REFERENCES public.journal_entry_header(id) ON DELETE CASCADE,

    -- Reference links (supports fallback queries in UI)
    reference_document_id text,
    document_type text,

    line_number integer NOT NULL DEFAULT 1,
    gl_code text,
    gl_name text,
    account_code text,
    account_name text,
    ledger_code text,
    ledger_name text,

    debit numeric(15,2) NOT NULL DEFAULT 0,
    credit numeric(15,2) NOT NULL DEFAULT 0,
    debit_amount numeric(15,2) GENERATED ALWAYS AS (debit) STORED,
    credit_amount numeric(15,2) GENERATED ALWAYS AS (credit) STORED,
    line_memo text,

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT journal_entry_lines_amount_chk CHECK (debit >= 0 AND credit >= 0),
    CONSTRAINT journal_entry_lines_dr_cr_chk CHECK ((debit = 0 AND credit >= 0) OR (credit = 0 AND debit >= 0))
);

-- 3) INDEXES
CREATE INDEX IF NOT EXISTS idx_jeh_org_posting_date ON public.journal_entry_header (organization_id, posting_date DESC);
CREATE INDEX IF NOT EXISTS idx_jeh_reference ON public.journal_entry_header (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_jeh_ref_doc_type ON public.journal_entry_header (reference_document_id, document_type);

CREATE INDEX IF NOT EXISTS idx_jel_journal_entry_id ON public.journal_entry_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_ref_doc_type ON public.journal_entry_lines (reference_document_id, document_type);
CREATE INDEX IF NOT EXISTS idx_jel_org ON public.journal_entry_lines (organization_id);

-- 4) RLS
ALTER TABLE public.journal_entry_header ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org isolation for journal_entry_header" ON public.journal_entry_header;
CREATE POLICY "Org isolation for journal_entry_header"
ON public.journal_entry_header FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

DROP POLICY IF EXISTS "Org isolation for journal_entry_lines" ON public.journal_entry_lines;
CREATE POLICY "Org isolation for journal_entry_lines"
ON public.journal_entry_lines FOR ALL
TO authenticated
USING (organization_id::text = public.get_my_org_id())
WITH CHECK (organization_id::text = public.get_my_org_id());

-- 5) UPDATED_AT TRIGGER FOR HEADER
CREATE OR REPLACE FUNCTION public.update_journal_entry_header_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_update_journal_entry_header_modtime ON public.journal_entry_header;
CREATE TRIGGER tr_update_journal_entry_header_modtime
BEFORE UPDATE ON public.journal_entry_header
FOR EACH ROW EXECUTE FUNCTION public.update_journal_entry_header_updated_at();

-- 6) Documentation
COMMENT ON TABLE public.journal_entry_header IS 'Accounting journal entry header for posted business documents.';
COMMENT ON TABLE public.journal_entry_lines IS 'Accounting journal entry line items with GL-level debit/credit splits.';

-- 7) Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
