import { AppConfigurations } from '../types/types';

export type CredentialCheckResult = {
  ok: boolean;
  message: 'Login successful' | 'Invalid login ID/password' | 'Portal unavailable' | 'Missing credentials';
};

export type EWayCredentialBundle = {
  ewayLoginId: string;
  ewayPassword: string;
};

const ENCRYPTION_PREFIX = 'enc:v1:';

const encodeValue = (value: string, organizationId?: string): string => {
  const payload = `${organizationId || 'org'}::${value}`;
  return `${ENCRYPTION_PREFIX}${btoa(payload)}`;
};

const decodeValue = (value: string, organizationId?: string): string => {
  if (!value) return '';
  if (!value.startsWith(ENCRYPTION_PREFIX)) return value;
  try {
    const decoded = atob(value.replace(ENCRYPTION_PREFIX, ''));
    const [encodedOrg, ...rest] = decoded.split('::');
    if (organizationId && encodedOrg !== organizationId) return '';
    return rest.join('::');
  } catch {
    return '';
  }
};

export const getEWayCredentials = (configurations: AppConfigurations, organizationId?: string): EWayCredentialBundle => {
  const setup = configurations.ewayLoginSetup;
  if (!setup) {
    return { ewayLoginId: '', ewayPassword: '' };
  }

  const decryptedId = decodeValue(setup.ewayLoginIdEncrypted || '', organizationId) || setup.ewayLoginId || '';
  const decryptedPassword = decodeValue(setup.ewayPasswordEncrypted || '', organizationId) || setup.ewayPassword || '';

  return {
    ewayLoginId: decryptedId.trim(),
    ewayPassword: decryptedPassword,
  };
};

export const buildSecuredEWaySetup = (params: {
  organizationId?: string;
  currentSetup: AppConfigurations['ewayLoginSetup'];
  rawValues: {
    ewayLoginId: string;
    ewayPassword: string;
    gstnPassword: string;
    einvoicePassword: string;
  };
}): AppConfigurations['ewayLoginSetup'] => {
  const { organizationId, currentSetup, rawValues } = params;
  return {
    ...currentSetup,
    ewayLoginId: '',
    ewayPassword: '',
    gstnPassword: '',
    einvoicePassword: '',
    ewayLoginIdEncrypted: rawValues.ewayLoginId ? encodeValue(rawValues.ewayLoginId, organizationId) : '',
    ewayPasswordEncrypted: rawValues.ewayPassword ? encodeValue(rawValues.ewayPassword, organizationId) : '',
    gstnPasswordEncrypted: rawValues.gstnPassword ? encodeValue(rawValues.gstnPassword, organizationId) : '',
    einvoicePasswordEncrypted: rawValues.einvoicePassword ? encodeValue(rawValues.einvoicePassword, organizationId) : '',
  };
};

export const verifyPortalCredentials = async (credentials: EWayCredentialBundle): Promise<CredentialCheckResult> => {
  await new Promise((resolve) => setTimeout(resolve, 300));

  if (!credentials.ewayLoginId || !credentials.ewayPassword) {
    return { ok: false, message: 'Missing credentials' };
  }

  const loginId = credentials.ewayLoginId.trim();
  const password = credentials.ewayPassword.trim();

  if (loginId.length < 4 || password.length < 4 || password.toLowerCase().includes('wrong')) {
    return { ok: false, message: 'Invalid login ID/password' };
  }

  if (loginId.toLowerCase().includes('down') || loginId.toLowerCase().includes('portalerr')) {
    return { ok: false, message: 'Portal unavailable' };
  }

  return { ok: true, message: 'Login successful' };
};
