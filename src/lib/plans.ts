/**
 * Plan tiers + product-count gating. Source of truth for what each plan
 * can do. Stripe wiring lives separately — this module governs the limits
 * regardless of whether the customer is paying or in a trial.
 */
export type PlanId = 'solo' | 'operator' | 'studio';

export interface PlanSpec {
  id: PlanId;
  label: string;
  priceCentsPerQuarter: number;
  maxProducts: number;
  unlimitedRefreshes: boolean;
  customSubdomain: boolean;
  customDomain: boolean;
  customBrandAnchor: boolean;
}

export const PLANS: Record<PlanId, PlanSpec> = {
  solo: {
    id: 'solo',
    label: 'Solo',
    priceCentsPerQuarter: 9900,
    maxProducts: 3,
    unlimitedRefreshes: false,
    customSubdomain: false,
    customDomain: false,
    customBrandAnchor: false,
  },
  operator: {
    id: 'operator',
    label: 'Operator',
    priceCentsPerQuarter: 29900,
    maxProducts: 10,
    unlimitedRefreshes: true,
    customSubdomain: true,
    customDomain: false,
    customBrandAnchor: false,
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    priceCentsPerQuarter: 99900,
    maxProducts: 50,
    unlimitedRefreshes: true,
    customSubdomain: true,
    customDomain: true,
    customBrandAnchor: true,
  },
};

export function getPlan(planId: string | null | undefined): PlanSpec {
  return PLANS[(planId as PlanId) ?? 'solo'] ?? PLANS.solo;
}

export interface PlanGateResult {
  allowed: boolean;
  reason: string | null;
  limit?: number;
  current?: number;
}

export function gateAddProduct(
  plan: PlanSpec,
  currentProductCount: number,
): PlanGateResult {
  if (currentProductCount < plan.maxProducts) {
    return { allowed: true, reason: null };
  }
  return {
    allowed: false,
    reason: `Your ${plan.label} plan covers up to ${plan.maxProducts} products. You have ${currentProductCount}.`,
    limit: plan.maxProducts,
    current: currentProductCount,
  };
}
