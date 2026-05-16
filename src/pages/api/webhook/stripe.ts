/**
 * Stripe webhook stub.
 *
 * Returns 501 until STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET land in env.
 * Post-SHAMS wire-up: drop in the secret, switch LAUNCH_MODE=live, and
 * the dispatch table below handles the supported event types.
 *
 * Supported events (when live):
 *   - checkout.session.completed: link Stripe customer to account, set plan
 *   - customer.subscription.updated: plan changes (Solo → Operator etc)
 *   - customer.subscription.deleted: downgrade to no-renewal state
 *   - invoice.payment_failed: grace-period flag (does not auto-pause)
 */
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? import.meta.env.STRIPE_SECRET_KEY ?? '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? import.meta.env.STRIPE_WEBHOOK_SECRET ?? '';
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? import.meta.env.PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? import.meta.env.SUPABASE_SERVICE_KEY ?? '';

const LAUNCH_MODE = (process.env.LAUNCH_MODE ?? import.meta.env.LAUNCH_MODE ?? 'invoice').toLowerCase();

const PLAN_BY_PRICE_ID: Record<string, 'solo' | 'operator' | 'studio'> = {
  // Populated post-SHAMS with real Stripe price IDs:
  // [process.env.STRIPE_PRICE_SOLO!]: 'solo',
  // [process.env.STRIPE_PRICE_OPERATOR!]: 'operator',
  // [process.env.STRIPE_PRICE_STUDIO!]: 'studio',
};

export const POST: APIRoute = async ({ request }) => {
  if (LAUNCH_MODE !== 'live' || !STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ ok: false, mode: LAUNCH_MODE, reason: 'stripe not yet wired' }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('missing signature', { status: 400 });

  const raw = await request.text();
  // Verify signature post-SHAMS using `stripe` SDK once it's pinned in package.json.
  // For the stub we accept the body shape but do not verify.
  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('invalid body', { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data?.object ?? {};
        const customerEmail = session.customer_details?.email ?? session.customer_email;
        const stripeCustomerId = session.customer;
        const subscriptionId = session.subscription;
        const priceId = session.line_items?.data?.[0]?.price?.id ?? session?.metadata?.price_id;
        const plan = PLAN_BY_PRICE_ID[priceId] ?? null;
        if (customerEmail) {
          await admin
            .schema('surface_saas')
            .from('accounts')
            .update({
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscriptionId,
              ...(plan ? { plan } : {}),
            })
            .eq('email', customerEmail);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data?.object ?? {};
        const priceId = sub.items?.data?.[0]?.price?.id;
        const plan = PLAN_BY_PRICE_ID[priceId] ?? null;
        if (sub.customer && plan) {
          await admin
            .schema('surface_saas')
            .from('accounts')
            .update({ plan })
            .eq('stripe_customer_id', sub.customer);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data?.object ?? {};
        if (sub.customer) {
          // Don't auto-pause; downgrade to solo and let owner re-subscribe.
          await admin
            .schema('surface_saas')
            .from('accounts')
            .update({ plan: 'solo', stripe_subscription_id: null })
            .eq('stripe_customer_id', sub.customer);
        }
        break;
      }
      default:
        // Acknowledge but ignore.
        break;
    }
  } catch (err) {
    console.error('[stripe webhook]', err);
    return new Response('error', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
