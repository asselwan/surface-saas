import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[surface-saas] PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY missing');
}

const COOKIE_NAME = 'surface-saas-session';

/** Server-side client. Reads the JWT from a cookie set after auth. */
export function getServerClient(cookies: AstroCookies): SupabaseClient {
  const accessToken = cookies.get(COOKIE_NAME)?.value;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {},
  });
}

/** Public-readable client used for showcase pages — no auth header. */
export function getPublicClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const SESSION_COOKIE = COOKIE_NAME;
export const PUBLIC_SUPABASE_URL = SUPABASE_URL;
export const PUBLIC_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
