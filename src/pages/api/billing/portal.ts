/**
 * Stripe customer portal redirect. Returns 501 until STRIPE_SECRET_KEY
 * lands in env (post-SHAMS). Post-launch: creates a billing-portal session
 * for the signed-in customer and redirects to the Stripe-hosted URL.
 */
import type { APIRoute } from 'astro';
import { getSession } from '@/lib/auth';

export const prerender = false;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? import.meta.env.STRIPE_SECRET_KEY ?? '';

export const GET: APIRoute = async ({ cookies, redirect }) => {
  const session = await getSession(cookies);
  if (!session) return redirect('/login');
  if (!STRIPE_SECRET_KEY) {
    return new Response('Billing portal is not live yet. Email asselwan@outlook.com for invoice-mode billing.', {
      status: 501,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  // Post-SHAMS: create a billing-portal session and redirect.
  // const stripe = new Stripe(STRIPE_SECRET_KEY);
  // const portal = await stripe.billingPortal.sessions.create({
  //   customer: session.account?.stripe_customer_id,
  //   return_url: 'https://surface.nomoi.ai/dashboard',
  // });
  // return redirect(portal.url, 302);
  return new Response('not implemented', { status: 501 });
};
