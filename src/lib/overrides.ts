/**
 * Server-side helpers for owner-driven override actions:
 * pause/resume, edit-mode, force-promote, force-retire, reject-with-reason,
 * revert. Each helper validates account ownership via RLS and writes an
 * audit_log row via the surface_saas.log_action SECURITY DEFINER function.
 */
import type { AstroCookies } from 'astro';
import { requireAccount } from './products';

const DAY = 1000 * 60 * 60 * 24;

export async function pauseProduct(
  cookies: AstroCookies,
  productId: string,
  paused: boolean,
  reason: string | null = null,
) {
  const ctx = await requireAccount(cookies);
  if (!ctx) return { error: 'unauthorized' as const };
  const pausedUntil = paused ? new Date(Date.now() + 30 * DAY).toISOString() : null;
  const { error } = await ctx.client
    .schema('surface_saas')
    .from('product_overrides')
    .upsert({
      product_id: productId,
      account_id: ctx.accountId,
      paused_until: pausedUntil,
      paused_reason: reason,
      updated_by_user_id: ctx.session.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'product_id' });
  if (error) return { error: error.message };
  await ctx.client.schema('surface_saas').rpc('log_action', {
    p_account_id: ctx.accountId,
    p_actor: 'owner',
    p_action: paused ? 'product.pause' : 'product.resume',
    p_target_type: 'product',
    p_target_id: productId,
    p_before: null,
    p_after: { paused_until: pausedUntil, reason },
    p_note: reason,
  });
  return { ok: true as const };
}

export async function pauseAccount(
  cookies: AstroCookies,
  paused: boolean,
  reason: string | null = null,
) {
  const ctx = await requireAccount(cookies);
  if (!ctx) return { error: 'unauthorized' as const };
  const pausedUntil = paused ? new Date(Date.now() + 365 * DAY).toISOString() : null;
  const { error } = await ctx.client
    .schema('surface_saas')
    .from('account_overrides')
    .upsert({
      account_id: ctx.accountId,
      paused_until: pausedUntil,
      paused_reason: reason,
      updated_by_user_id: ctx.session.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'account_id' });
  if (error) return { error: error.message };
  await ctx.client.schema('surface_saas').rpc('log_action', {
    p_account_id: ctx.accountId,
    p_actor: 'owner',
    p_action: paused ? 'account.pause' : 'account.resume',
    p_target_type: 'account',
    p_target_id: ctx.accountId,
    p_before: null,
    p_after: { paused_until: pausedUntil, reason },
    p_note: reason,
  });
  return { ok: true as const };
}

export async function setEditMode(
  cookies: AstroCookies,
  productId: string,
  enter: boolean,
) {
  const ctx = await requireAccount(cookies);
  if (!ctx) return { error: 'unauthorized' as const };
  const editModeUntil = enter ? new Date(Date.now() + 7 * DAY).toISOString() : null;
  const { error } = await ctx.client
    .schema('surface_saas')
    .from('product_overrides')
    .upsert({
      product_id: productId,
      account_id: ctx.accountId,
      edit_mode_until: editModeUntil,
      updated_by_user_id: ctx.session.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'product_id' });
  if (error) return { error: error.message };
  await ctx.client.schema('surface_saas').rpc('log_action', {
    p_account_id: ctx.accountId,
    p_actor: 'owner',
    p_action: enter ? 'product.edit_mode_enter' : 'product.edit_mode_release',
    p_target_type: 'product',
    p_target_id: productId,
    p_before: null,
    p_after: { edit_mode_until: editModeUntil },
    p_note: null,
  });
  return { ok: true as const };
}

export async function promoteVariant(cookies: AstroCookies, variantId: string) {
  const ctx = await requireAccount(cookies);
  if (!ctx) return { error: 'unauthorized' as const };

  const { data: variant, error: vErr } = await ctx.client
    .schema('surface_saas')
    .from('product_variants')
    .select('id, account_id, product_id, kind, status, payload')
    .eq('id', variantId)
    .maybeSingle();
  if (vErr || !variant) return { error: vErr?.message ?? 'variant not found' };
  if (variant.account_id !== ctx.accountId) return { error: 'forbidden' };

  // Archive any current live variant of same kind+product
  await ctx.client
    .schema('surface_saas')
    .from('product_variants')
    .update({ status: 'archived', retired_at: new Date().toISOString() })
    .eq('product_id', variant.product_id)
    .eq('kind', variant.kind)
    .eq('status', 'live');

  // Promote this one
  const { error: pErr } = await ctx.client
    .schema('surface_saas')
    .from('product_variants')
    .update({ status: 'live', promoted_at: new Date().toISOString() })
    .eq('id', variant.id);
  if (pErr) return { error: pErr.message };

  // Pin via product_overrides so the agent's posterior won't overwrite
  const forcedKey = `forced_${variant.kind}_variant_id`;
  await ctx.client
    .schema('surface_saas')
    .from('product_overrides')
    .upsert({
      product_id: variant.product_id,
      account_id: ctx.accountId,
      [forcedKey]: variant.id,
      updated_by_user_id: ctx.session.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'product_id' });

  await ctx.client.schema('surface_saas').rpc('log_action', {
    p_account_id: ctx.accountId,
    p_actor: 'owner',
    p_action: 'variant.promote',
    p_target_type: 'product_variant',
    p_target_id: variant.id,
    p_before: null,
    p_after: { product_id: variant.product_id, kind: variant.kind },
    p_note: null,
  });
  return { ok: true as const };
}

export async function retireVariant(cookies: AstroCookies, variantId: string) {
  const ctx = await requireAccount(cookies);
  if (!ctx) return { error: 'unauthorized' as const };
  const { data: variant } = await ctx.client
    .schema('surface_saas')
    .from('product_variants')
    .select('id, account_id, product_id, kind')
    .eq('id', variantId)
    .maybeSingle();
  if (!variant || variant.account_id !== ctx.accountId) return { error: 'forbidden' };

  await ctx.client
    .schema('surface_saas')
    .from('product_variants')
    .update({ status: 'retired_by_owner', retired_at: new Date().toISOString() })
    .eq('id', variantId);

  await ctx.client.schema('surface_saas').rpc('log_action', {
    p_account_id: ctx.accountId,
    p_actor: 'owner',
    p_action: 'variant.retire',
    p_target_type: 'product_variant',
    p_target_id: variantId,
    p_before: null,
    p_after: { product_id: variant.product_id, kind: variant.kind },
    p_note: null,
  });
  return { ok: true as const };
}

export async function rejectVariant(
  cookies: AstroCookies,
  variantId: string,
  reason: string,
) {
  const ctx = await requireAccount(cookies);
  if (!ctx) return { error: 'unauthorized' as const };
  const { data: variant } = await ctx.client
    .schema('surface_saas')
    .from('product_variants')
    .select('id, account_id, product_id, kind')
    .eq('id', variantId)
    .maybeSingle();
  if (!variant || variant.account_id !== ctx.accountId) return { error: 'forbidden' };

  await ctx.client
    .schema('surface_saas')
    .from('variant_rejections')
    .insert({
      variant_id: variantId,
      account_id: ctx.accountId,
      product_id: variant.product_id,
      reason,
      rejected_by_user_id: ctx.session.user.id,
    });

  // Mark the variant retired so it doesn't show in pending lists anymore
  await ctx.client
    .schema('surface_saas')
    .from('product_variants')
    .update({ status: 'retired_by_owner', retired_at: new Date().toISOString() })
    .eq('id', variantId);

  await ctx.client.schema('surface_saas').rpc('log_action', {
    p_account_id: ctx.accountId,
    p_actor: 'owner',
    p_action: 'variant.reject',
    p_target_type: 'product_variant',
    p_target_id: variantId,
    p_before: null,
    p_after: { product_id: variant.product_id, kind: variant.kind, reason },
    p_note: reason,
  });
  return { ok: true as const };
}

export async function revertProductLastChange(
  cookies: AstroCookies,
  productId: string,
) {
  const ctx = await requireAccount(cookies);
  if (!ctx) return { error: 'unauthorized' as const };

  // Find the most recent manifest.update audit row for this product
  const { data: rows } = await ctx.client
    .schema('surface_saas')
    .from('audit_log')
    .select('id, before, after, action')
    .eq('account_id', ctx.accountId)
    .eq('target_type', 'product')
    .eq('target_id', productId)
    .in('action', ['manifest.update', 'manifest.add'])
    .order('ts', { ascending: false })
    .limit(1);
  const last = rows?.[0];
  if (!last || !last.before) return { error: 'no prior state to revert to' };

  const before = last.before as Record<string, unknown>;
  const restore: Record<string, unknown> = {};
  for (const f of ['name', 'tagline', 'essay', 'url', 'cta', 'category', 'pricing', 'sort_order', 'visible', 'status']) {
    if (f in before) restore[f] = before[f];
  }

  const { error: uErr } = await ctx.client
    .schema('surface_saas')
    .from('products')
    .update(restore)
    .eq('id', productId)
    .eq('account_id', ctx.accountId);
  if (uErr) return { error: uErr.message };

  await ctx.client.schema('surface_saas').rpc('log_action', {
    p_account_id: ctx.accountId,
    p_actor: 'owner',
    p_action: 'product.revert',
    p_target_type: 'product',
    p_target_id: productId,
    p_before: last.after,
    p_after: last.before,
    p_note: `reverted from audit #${last.id}`,
  });
  return { ok: true as const };
}
