import { db } from '../../../core/database/databaseService';

export const DEFAULT_CONFIG_MISSING_MESSAGE = 'Default Company / Default Set of Books not configured. Please update Company Configuration.';

export interface DefaultPostingContext {
  companyCodeId: string;
  companyCode: string;
  setOfBooksId: string;
}

export const loadDefaultPostingContext = async (organizationId: string): Promise<DefaultPostingContext> => {
  const companies = await db.sql`
    SELECT id, code, status, organization_id, is_default, default_set_of_books_id 
    FROM company_codes 
    WHERE organization_id = ${organizationId} AND is_default = 1 AND status = 'Active' 
    LIMIT 1
  `;

  const defaultCompany = companies[0];
  if (!defaultCompany?.id || !defaultCompany.default_set_of_books_id) {
    // Fallback: take the first active company if no default is set
    const allCompanies = await db.sql`
      SELECT id, code, status FROM company_codes 
      WHERE organization_id = ${organizationId} AND status = 'Active' 
      ORDER BY created_at ASC LIMIT 1
    `;
    const fallbackCompany = allCompanies[0];
    if (!fallbackCompany) throw new Error(DEFAULT_CONFIG_MISSING_MESSAGE);
    
    const books = await db.sql`
      SELECT id FROM set_of_books 
      WHERE organization_id = ${organizationId} AND company_code_id = ${fallbackCompany.id} AND active_status = 'Active' 
      LIMIT 1
    `;
    const fallbackBook = books[0];
    if (!fallbackBook) throw new Error(DEFAULT_CONFIG_MISSING_MESSAGE);

    return {
      companyCodeId: fallbackCompany.id,
      companyCode: fallbackCompany.code,
      setOfBooksId: fallbackBook.id,
    };
  }

  const books = await db.sql`
    SELECT id FROM set_of_books 
    WHERE organization_id = ${organizationId} AND id = ${defaultCompany.default_set_of_books_id} AND active_status = 'Active' 
    LIMIT 1
  `;

  const defaultBook = books[0];
  if (!defaultBook) {
     throw new Error(DEFAULT_CONFIG_MISSING_MESSAGE);
  }

  return {
    companyCodeId: defaultCompany.id,
    companyCode: defaultCompany.code,
    setOfBooksId: defaultBook.id,
  };
};
