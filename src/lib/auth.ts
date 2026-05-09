import type { AstroCookies } from 'astro';
import { getServerClient, SESSION_COOKIE } from './supabase';

export interface AuthedSession {
  user: {
    id: string;
    email: string;
  };
  account: {
    id: string;
    plan: string;
    name: string | null;
    subdomain: string | null;
  } | null;
}

/** Returns null if not signed in. Always queries Supabase to validate. */
export async function getSession(cookies: AstroCookies): Promise<AuthedSession | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const client = getServerClient(cookies);
  const { data: userData, error: userErr } = await client.auth.getUser(token);
  if (userErr || !userData.user) {
    cookies.delete(SESSION_COOKIE, { path: '/' });
    return null;
  }
  const user = { id: userData.user.id, email: userData.user.email ?? '' };

  // Look up the account (or null if first sign-in and we haven't created one yet)
  const { data: account } = await client
    .schema('surface_saas')
    .from('accounts')
    .select('id, plan, name, subdomain')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  return { user, account: account ?? null };
}

/** Bootstrap an account row for a brand-new user. Idempotent. */
export async function ensureAccount(
  cookies: AstroCookies,
  user: { id: string; email: string },
): Promise<{ id: string; plan: string }> {
  const client = getServerClient(cookies);
  const { data: existing } = await client
    .schema('surface_saas')
    .from('accounts')
    .select('id, plan')
    .eq('owner_user_id', user.id)
    .maybeSingle();
  if (existing) return existing as { id: string; plan: string };

  const { data, error } = await client
    .schema('surface_saas')
    .from('accounts')
    .insert({ owner_user_id: user.id, email: user.email, plan: 'solo' })
    .select('id, plan')
    .single();
  if (error || !data) throw new Error(`account bootstrap failed: ${error?.message ?? 'unknown'}`);
  return data as { id: string; plan: string };
}

export function setSessionCookie(cookies: AstroCookies, accessToken: string): void {
  cookies.set(SESSION_COOKIE, accessToken, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days; Supabase's own refresh handles real expiry
  });
}

export function clearSessionCookie(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}
