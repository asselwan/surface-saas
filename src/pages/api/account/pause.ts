import type { APIRoute } from 'astro';
import { pauseAccount } from '@/lib/overrides';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('action') ?? 'pause');
  const reason = (form.get('reason') as string | null) || null;
  await pauseAccount(cookies, action === 'pause', reason);
  return redirect('/dashboard');
};
