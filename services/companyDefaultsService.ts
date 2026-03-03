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
    .eq('is_default', true)
    .limit(1);

  if (companyError) throw companyError;

  const defaultCompany = (companies || [])[0] as CompanyCodeRow | undefined;
  if (!defaultCompany?.id || !defaultCompany.default_set_of_books_id) {
    throw new Error(DEFAULT_CONFIG_MISSING_MESSAGE);
  }

  const { data: books, error: booksError } = await supabase
    .from('set_of_books')
    .select('id, company_code_id, active_status')
    .eq('organization_id', organizationId)
    .eq('id', defaultCompany.default_set_of_books_id)
    .limit(1);

  if (booksError) throw booksError;

  const defaultBook = (books || [])[0] as SetOfBooksRow | undefined;
  if (!defaultBook || defaultBook.company_code_id !== defaultCompany.id || defaultBook.active_status === 'Inactive') {
    throw new Error(DEFAULT_CONFIG_MISSING_MESSAGE);
  }

  return {
    companyCodeId: defaultCompany.id,
    companyCode: defaultCompany.code,
    setOfBooksId: defaultBook.id,
  };
};
