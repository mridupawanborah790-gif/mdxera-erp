import { supabase } from '@core/db/supabaseClient';
import type { RegisteredPharmacy } from '@core/types';

export interface SupabaseSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix seconds
  userId: string;
}

export async function supabaseLogin(
  email: string,
  password: string
): Promise<{ user: RegisteredPharmacy; session: SupabaseSession }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(error?.message ?? 'Login failed');
  }

  // Fetch the user's profile row (contains org data, name, etc.)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', data.user.id)
    .single();

  if (profileError || !profile) {
    throw new Error(profileError?.message ?? 'Could not load user profile');
  }

  const user: RegisteredPharmacy = {
    id: data.user.id,
    user_id: data.user.id,
    organization_id: profile.organization_id,
    email: data.user.email ?? email,
    is_active: profile.is_active ?? true,
    full_name: profile.full_name ?? '',
    pharmacy_name: profile.pharmacy_name ?? '',
    manager_name: profile.manager_name ?? '',
    role: profile.role ?? 'clerk',
    address: profile.address ?? '',
    state: profile.state ?? '',
    district: profile.district ?? '',
    mobile: profile.mobile ?? '',
    gstin: profile.gstin ?? '',
    retailer_gstin: profile.retailer_gstin ?? '',
    drug_license: profile.drug_license ?? null,
    subscription_plan: profile.subscription_plan ?? 'starter',
    subscription_status: profile.subscription_status ?? 'active',
  };

  const session: SupabaseSession = {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? 0,
    userId: data.user.id,
  };

  return { user, session };
}

export async function supabaseLogout(): Promise<void> {
  await supabase.auth.signOut();
}

export async function supabaseRefreshSession(): Promise<SupabaseSession | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) return null;
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? 0,
    userId: data.session.user.id,
  };
}

export async function supabaseRestoreSession(): Promise<SupabaseSession | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? 0,
    userId: data.session.user.id,
  };
}

export async function supabaseRequestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw new Error(error.message);
}
