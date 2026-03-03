import { supabase } from './supabaseClient';

export const DEFAULT_CONFIG_MISSING_MESSAGE = 'Default Company / Default Set of Books not configured. Please update Company Configuration.';

type CompanyCodeRow = {
  id: string;
  code: string;
  status?: string | null;
  organization_id?: string;
  is_default?: boolean | null;
  default_set_of_books_id?: string | null;
};

type SetOfBooksRow = {
  id: string;
  company_code_id: string;
  organization_id?: string;
  active_status?: string | null;
};

export interface DefaultPostingContext {
  companyCodeId: string;
  companyCode: string;
  setOfBooksId: string;
}

const isUuid = (value: string): boolean => (
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
);


const isMissingDefaultColumnsError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('is_default') || message.includes('default_set_of_books_id');
};

const loadLegacyFallbackPostingContext = async (organizationId: string): Promise<DefaultPostingContext> => {
  const { data: companies, error: companyError } = await supabase
    .from('company_codes')
    .select('id, code, status')
    .eq('organization_id', organizationId)
    .eq('status', 'Active')
    .order('created_at', { ascending: true })
    .limit(1);

  if (companyError) throw companyError;

  const company = (companies || [])[0] as { id: string; code: string } | undefined;
  if (!company?.id) throw new Error(DEFAULT_CONFIG_MISSING_MESSAGE);

  const { data: books, error: booksError } = await supabase
    .from('set_of_books')
    .select('id, company_code_id, active_status')
    .eq('organization_id', organizationId)
    .eq('company_code_id', company.id)
    .eq('active_status', 'Active')
    .order('created_at', { ascending: true })
    .limit(1);

  if (booksError) throw booksError;

  const book = (books || [])[0] as SetOfBooksRow | undefined;
  if (!book?.id) throw new Error(DEFAULT_CONFIG_MISSING_MESSAGE);

  return {
    companyCodeId: company.id,
    companyCode: company.code,
    setOfBooksId: book.id,
  };
};

export const loadDefaultPostingContext = async (organizationId: string): Promise<DefaultPostingContext> => {
  const { data: companies, error: companyError } = await supabase
    .from('company_codes')
    .select('id, code, status, organization_id, is_default, default_set_of_books_id')
    .eq('organization_id', organizationId)
    .eq('is_default', true)
    .eq('status', 'Active')
    .limit(1);

  if (companyError) {
    if (isMissingDefaultColumnsError(companyError)) {
      return loadLegacyFallbackPostingContext(organizationId);
    }
    throw companyError;
  }

  const defaultCompany = (companies || [])[0] as CompanyCodeRow | undefined;
  if (!defaultCompany?.id || !defaultCompany.default_set_of_books_id) {
    throw new Error(DEFAULT_CONFIG_MISSING_MESSAGE);
  }

  const defaultSetOfBooksRef = String(defaultCompany.default_set_of_books_id);
  const baseBooksQuery = supabase
    .from('set_of_books')
    .select('id, company_code_id, organization_id, active_status, set_of_books_id')
    .eq('organization_id', organizationId)
    .eq('active_status', 'Active');

  const booksQuery = isUuid(defaultSetOfBooksRef)
    ? baseBooksQuery.eq('id', defaultSetOfBooksRef)
    : baseBooksQuery.eq('company_code_id', defaultCompany.id).eq('set_of_books_id', defaultSetOfBooksRef);

  const { data: books, error: booksError } = await booksQuery.limit(1);

  if (booksError) throw booksError;

  const defaultBook = (books || [])[0] as SetOfBooksRow | undefined;
  if (
    !defaultBook
    || defaultCompany.status !== 'Active'
    || defaultCompany.organization_id !== organizationId
    || defaultBook.active_status !== 'Active'
    || defaultBook.organization_id !== organizationId
    || defaultBook.company_code_id !== defaultCompany.id
  ) {
    throw new Error(DEFAULT_CONFIG_MISSING_MESSAGE);
  }

  return {
    companyCodeId: defaultCompany.id,
    companyCode: defaultCompany.code,
    setOfBooksId: defaultBook.id,
  };
};
