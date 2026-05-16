import type { APIRoute } from 'astro';
import { setEditMode } from '@/lib/overrides';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  const productId = String(params.id ?? '');
  const form = await request.formData();
  const action = String(form.get('action') ?? 'enter');
  await setEditMode(cookies, productId, action === 'enter');
  return redirect(`/dashboard/products/${productId}`);
};
