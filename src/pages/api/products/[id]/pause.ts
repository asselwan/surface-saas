import type { APIRoute } from 'astro';
import { pauseProduct } from '@/lib/overrides';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  const productId = String(params.id ?? '');
  const form = await request.formData();
  const action = String(form.get('action') ?? 'pause');
  const reason = (form.get('reason') as string | null) || null;
  await pauseProduct(cookies, productId, action === 'pause', reason);
  return redirect(`/dashboard/products/${productId}`);
};
