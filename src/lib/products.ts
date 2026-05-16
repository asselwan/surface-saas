/**
 * Server-side product CRUD helpers. All operations RLS-gated to the
 * caller's account; triggers in the database emit audit rows automatically.
 */
import type { AstroCookies } from 'astro';
import { getServerClient } from './supabase';
import { getSession } from './auth';

export interface ProductInput {
  key: string;
  name: string;
  tagline?: string;
  essay?: string;
  url?: string;
  cta?: string;
  category?: string;
  pricing?: string;
  sort_order?: number;
  visible?: boolean;
  status?: string;
}

export interface ProductRow extends ProductInput {
  id: string;
  account_id: string;
  scope_hash: string | null;
  scanned_at: string | null;
  changed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Auth boundary helper — returns session + accountId or null. */
export async function requireAccount(cookies: AstroCookies) {
  const session = await getSession(cookies);
  if (!session || !session.account) return null;
  return { session, accountId: session.account.id, client: getServerClient(cookies) };
}

export async function listProducts(cookies: AstroCookies): Promise<ProductRow[]> {
  const ctx = await requireAccount(cookies);
  if (!ctx) return [];
  const { data } = await ctx.client
    .schema('surface_saas')
    .from('products')
    .select('*')
    .eq('account_id', ctx.accountId)
    .order('sort_order', { ascending: true });
  return (data ?? []) as ProductRow[];
}

export async function getProduct(
  cookies: AstroCookies,
  productId: string,
): Promise<ProductRow | null> {
  const ctx = await requireAccount(cookies);
  if (!ctx) return null;
  const { data } = await ctx.client
    .schema('surface_saas')
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('account_id', ctx.accountId)
    .maybeSingle();
  return data as ProductRow | null;
}

export async function createProduct(
  cookies: AstroCookies,
  input: ProductInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await requireAccount(cookies);
  if (!ctx) return { error: 'unauthorized' };
  const { data, error } = await ctx.client
    .schema('surface_saas')
    .from('products')
    .insert({
      ...input,
      account_id: ctx.accountId,
      visible: input.visible ?? true,
      status: input.status ?? 'live',
      sort_order: input.sort_order ?? 100,
    })
    .select('id')
    .single();
  if (error || !data) return { error: error?.message ?? 'insert failed' };
  return { id: data.id };
}

export async function updateProduct(
  cookies: AstroCookies,
  productId: string,
  patch: Partial<ProductInput>,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await requireAccount(cookies);
  if (!ctx) return { error: 'unauthorized' };
  const { error } = await ctx.client
    .schema('surface_saas')
    .from('products')
    .update(patch)
    .eq('id', productId)
    .eq('account_id', ctx.accountId);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function deleteProduct(
  cookies: AstroCookies,
  productId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await requireAccount(cookies);
  if (!ctx) return { error: 'unauthorized' };
  const { error } = await ctx.client
    .schema('surface_saas')
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('account_id', ctx.accountId);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function getProductOverrides(
  cookies: AstroCookies,
  productId: string,
) {
  const ctx = await requireAccount(cookies);
  if (!ctx) return null;
  const { data } = await ctx.client
    .schema('surface_saas')
    .from('product_overrides')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle();
  return data;
}

export async function getAccountOverride(cookies: AstroCookies) {
  const ctx = await requireAccount(cookies);
  if (!ctx) return null;
  const { data } = await ctx.client
    .schema('surface_saas')
    .from('account_overrides')
    .select('*')
    .eq('account_id', ctx.accountId)
    .maybeSingle();
  return data;
}

export async function listVariants(cookies: AstroCookies, productId: string) {
  const ctx = await requireAccount(cookies);
  if (!ctx) return [];
  const { data } = await ctx.client
    .schema('surface_saas')
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function listAuditLog(
  cookies: AstroCookies,
  options: { productId?: string; limit?: number } = {},
) {
  const ctx = await requireAccount(cookies);
  if (!ctx) return [];
  let query = ctx.client
    .schema('surface_saas')
    .from('audit_log')
    .select('*')
    .eq('account_id', ctx.accountId)
    .order('ts', { ascending: false })
    .limit(options.limit ?? 100);
  if (options.productId) {
    query = query.eq('target_id', options.productId);
  }
  const { data } = await query;
  return data ?? [];
}
