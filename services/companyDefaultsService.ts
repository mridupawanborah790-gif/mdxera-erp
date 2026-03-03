import { supabase } from './supabaseClient';

export const DEFAULT_CONFIG_MISSING_MESSAGE = 'Default Company / Set of Books not configured. Please update Company Configuration.';

type CompanyCodeRow = {
  id: string;
  code: string;
  is_default?: boolean | null;
  default_set_of_books_id?: string | null;
};

type SetOfBooksRow = {
  id: string;
  company_code_id: string;
  active_status?: string | null;
};

export interface DefaultPostingContext {
  companyCodeId: string;
  companyCode: string;
  setOfBooksId: string;
}

export const loadDefaultPostingContext = async (organizationId: string): Promise<DefaultPostingContext> => {
  const { data: companies, error: companyError } = await supabase
    .from('company_codes')
    .select('id, code, is_default, default_set_of_books_id')
    .eq('organization_id', organizationId)
    .order('is_default', { ascending: false });

  if (companyError) throw companyError;

  const companyRows = (companies || []) as CompanyCodeRow[];
  const defaultCompany = companyRows.find((company) => company.is_default) || companyRows[0];

  if (!defaultCompany?.id) {
    throw new Error(DEFAULT_CONFIG_MISSING_MESSAGE);
  }

  const { data: books, error: booksError } = await supabase
    .from('set_of_books')
    .select('id, company_code_id, active_status')
    .eq('organization_id', organizationId)
    .eq('company_code_id', defaultCompany.id)
    .neq('active_status', 'Inactive');

  if (booksError) throw booksError;

  const activeBooks = (books || []) as SetOfBooksRow[];
  const defaultBook = defaultCompany.default_set_of_books_id
    ? activeBooks.find((book) => book.id === defaultCompany.default_set_of_books_id)
    : undefined;
  const fallbackBook = defaultBook || activeBooks[0];

  if (!fallbackBook || fallbackBook.company_code_id !== defaultCompany.id) {
    throw new Error(DEFAULT_CONFIG_MISSING_MESSAGE);
  }

  return {
    companyCodeId: defaultCompany.id,
    companyCode: defaultCompany.code,
    setOfBooksId: fallbackBook.id,
  };
};
