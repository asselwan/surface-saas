# NOMOI Surface (SaaS)

The multi-tenant Surface offering. Customers add a product manifest, we keep their landing-page videos, copy, and CapCut kits alive.

Phase 1 (this commit): Supabase schema + auth shell + dashboard skeleton. Customers can sign in via magic link or Google, see an empty dashboard, and (next phase) add product entries.

## Schema

`surface_saas` schema in the canonical NOMOI Supabase project (umodapwphcxtiijizqll). Tables:
- `accounts` — one per Supabase auth user, plan + grandfather price + custom domain
- `products` — per-account product manifest, with scope JSON + change-detect hash
- `scope_pulls` — append-only audit log of scope-pull cron runs
- `kit_refreshes` — queue + log for CapCut kit regenerations

RLS enforces owner-only writes; anon can read visible products for the public showcase.

## Stack

- Astro 4 + Node adapter, server output
- Supabase Auth (magic link + Google OAuth)
- Caddy (Coolify default)
- Deployed via Coolify at surface.nomoi.ai

## Env vars

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

Both should be the same canonical NOMOI Supabase project for V1.

## Routes

- `/` public marketing landing
- `/login` magic-link form + Google button
- `/auth/callback` Supabase redirect handler (two-leg fragment-to-cookie)
- `/auth/logout` clears session, redirects to `/`
- `/dashboard` auth-gated, lists user's products

## Next phases (per `project_surface_productization_sweep_2026_05_09.md`)

3. Per-account VideoShowcase.astro adaptation
4. Manifest editor (TinaCMS embed or simple form)
5. Per-account kit generator (Python script, parameterised)
6-8. Per-tenant scope-pull worker (refactored from Atlas)
9. Stripe wiring + plan gating
10-12. Testing, error paths, first paying customer onboarded
