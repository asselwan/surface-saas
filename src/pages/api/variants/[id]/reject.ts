import type { APIRoute } from 'astro';
import { rejectVariant } from '@/lib/overrides';
import { getServerClient } from '@/lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  const variantId = String(params.id ?? '');
  const form = await request.formData();
  const reason = String(form.get('reason') ?? '').trim().slice(0, 200);
  if (!reason) return redirect('/dashboard');
  const client = getServerClient(cookies);
  const { data } = await client
    .schema('surface_saas')
    .from('product_variants')
    .select('product_id')
    .eq('id', variantId)
    .maybeSingle();
  await rejectVariant(cookies, variantId, reason);
  return redirect(data?.product_id ? `/dashboard/products/${data.product_id}` : '/dashboard');
};
