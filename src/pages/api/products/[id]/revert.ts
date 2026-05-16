import type { APIRoute } from 'astro';
import { revertProductLastChange } from '@/lib/overrides';

export const prerender = false;

export const POST: APIRoute = async ({ params, cookies, redirect }) => {
  const productId = String(params.id ?? '');
  await revertProductLastChange(cookies, productId);
  return redirect(`/dashboard/products/${productId}`);
};
