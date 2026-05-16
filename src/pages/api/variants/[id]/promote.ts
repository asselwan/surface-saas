import type { APIRoute } from 'astro';
import { promoteVariant } from '@/lib/overrides';
import { getServerClient } from '@/lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ params, cookies, redirect }) => {
  const variantId = String(params.id ?? '');
  await promoteVariant(cookies, variantId);
  // Look up product_id for redirect
  const client = getServerClient(cookies);
  const { data } = await client
    .schema('surface_saas')
    .from('product_variants')
    .select('product_id')
    .eq('id', variantId)
    .maybeSingle();
  return redirect(data?.product_id ? `/dashboard/products/${data.product_id}` : '/dashboard');
};
