# E-Vora Multi-Vendor Marketplace — Repository Audit & Implementation Plan

**Status:** PLANNING ONLY — **no application code has been changed.**
**Prepared:** 2026-10-28
**Branch:** `arena/6bbbf7ed-web-stor` (branched from `main` @ `deb7518`, clean tree)
**Environment used for the audit:** local sandbox only. No production database, environment variable, payment setting, or deployment configuration was read, modified, or contacted.

---

## 1. Executive summary

E-Vora today is a **single-seller, demo-checkout digital-goods storefront**. It has a genuinely hardened authentication/session layer, a real PostgreSQL schema with a guarded migration runner, and a strict "no fake money" policy: production checkout fails closed, development records an explicitly unpaid demo order, and the wallet is a hardcoded honest zero.

There is **zero marketplace code** in the repository. A case-insensitive search for `seller`, `vendor`, `commission`, `payout`, and `ledger` across `src/`, `drizzle/`, and `tests/` returns only two comment lines in `src/lib/wallet.ts`. No table, column, route, guard, or UI element models a seller, an application, a commission, a ledger entry, or a payout.

The good news: the existing foundations are the right ones to reuse. Sessions are opaque server-side rows, authorization is already computed server-side (`/admin`), money is integer minor units end-to-end, migrations are hashed/transactional/append-only, and tests already cover financial-adjacent safety (price from DB, demo-order non-delivery, migration adoption).

The plan below implements the marketplace **additively**:

- `users.role` is extended (superset) with `seller`; **buyers stay `customer`** (documented BUYER alias).
- Products gain a nullable `seller_id`; **existing catalogue rows are backfilled as platform-owned + approved**, so the storefront does not change.
- Money moves through an **append-only seller ledger** with integer minor units, 10% (`1000` bps) commission snapshotted per order line, and exactly-once idempotency keys.
- Because **no payment provider exists**, every order remains demo/unpaid; demo ledger entries live in a **non-withdrawable `demo` bucket**, so no seller balance is ever presented as withdrawable and no platform revenue is booked. Payout **requests** are modelled and admin-gated, but remain unavailable until a verified provider settles real payments (explicit UI labelling, no fake confirmations).

Two things **cannot** be fully delivered honestly in this environment: real payment settlement (no provider, and connecting one is explicitly forbidden without approval), and product image upload (no object storage is configured). Both are handled as explicit, labelled limitations rather than simulated features.

---

## 2. How the audit was performed

| Command | Result |
| --- | --- |
| `git status` / `git log` | clean tree; HEAD `deb7518` (merge of PR #11); only `main` + current branch exist |
| `npm ci` | 408 packages installed |
| `npm run lint` | **pass** (0 errors, 0 warnings) |
| `npm run typecheck` | **pass** (strict TS, `--noEmit`) |
| `npm test` | **75 tests: 69 pass, 0 fail, 6 skipped** (skips are real-PostgreSQL integration tests; no PostgreSQL server in this sandbox) |
| `npm run build` | **pass** (Next.js 16.4.2 production build) |
| `npx playwright --version` | 1.64.1, but **no browser binaries cached** and the sandbox cannot reach the Playwright CDN — browser tests must run in GitHub CI as before (documented in `docs/BLOCKED.md` B-01) |

Repository size: 96 TS/TSX files under `src/`, ~13.2k lines across `src/`, `drizzle/`, `tests/`, `e2e/`, `scripts/`.

### Files inspected (grouped)

**Instructions & docs**
`AGENTS.md`, `README.md`, `docs/BLOCKED.md`, `docs/DECISIONS.md`, `docs/MASTER-EXECUTION-TRACKER.md`, `docs/VERIFICATION-LOG.md`, `docs/CONTRAST-REPORT.md`, `docs/functional-test-report.md`, `docs/security/S-01…S-20.md` (index level), `docs/security/VULN-*.md` (index level), `docs/evidence/README.md`, `.env.example`.

**Configuration**
`package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `playwright.config.ts`, `drizzle.config.ts`, `.gitignore`, `.github/` (workflow level).

**Database & migrations**
`src/lib/db/schema.ts`, `src/lib/db/index.ts`, `src/lib/db/config.ts`, `src/lib/db/migrations.ts`, `src/lib/db/cart-operations.ts`, `src/lib/db/demo-order.ts`, `src/lib/db/seed-catalog.ts`, `src/lib/db/seed-data.ts`, `src/lib/db/test-database.ts`, `drizzle/0000_init.sql`, `drizzle/0001_evora-digital.sql`, `drizzle/0002_authentication.sql`, `drizzle/0003_hardening.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0003_snapshot.json`, `scripts/migrate.ts`, `scripts/seed.ts`.

**Authentication, sessions, security**
`src/lib/security/account-session.ts`, `account-session-policy.ts`, `auth-core.ts`, `auth-http.ts`, `auth-rate-limit.ts`, `auth-validation.ts`, `audit-log.ts`, `client-ip.ts`, `csrf.ts`, `digits.ts`, `email-verification.ts`, `email.ts`, `google-link.ts`, `google-oauth.ts`, `password-policy.ts`, `rate-limit.ts`, `read-json.ts`, `session.ts`, `src/proxy.ts`, `src/instrumentation.ts`, `src/lib/env.ts`, `src/lib/http.ts`.

**Commerce**
`src/lib/cart.ts`, `src/lib/catalog.ts`, `src/lib/checkout-policy.ts`, `src/lib/money.ts`, `src/lib/order-number.ts`, `src/lib/wallet.ts`, `src/lib/validation.ts`, all `src/app/api/{cart,checkout}/**`, `src/components/cart-provider.tsx`, `add-to-cart.tsx`, `product-card.tsx`, `product-filters.tsx`.

**Auth & account UI**
`src/app/login/page.tsx`, `src/app/account/page.tsx`, `src/app/account/orders/page.tsx`, `src/app/account/wallet/page.tsx`, `src/app/checkout/page.tsx`, `src/app/checkout/success/page.tsx`, `src/components/auth-panel.tsx`, `account-nav.tsx`, `account-profile-form.tsx`, `account-sessions.tsx`, `header.tsx`, `footer.tsx`, `locale-provider.tsx`, `preference-toggles.tsx`, `sign-out-button.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/lib/i18n/dictionary.ts`, `src/lib/i18n/server.ts`, `src/lib/i18n/static-pages.ts`.

**Admin**
`src/app/admin/page.tsx` (the only admin route; no admin API routes exist).

**Tests**
all 16 files in `tests/` plus `tests/support/*` (`guard-probe.ts`, `production-checkout-probe.ts`, `no-network.cjs`, `stub-server-only.cjs`), `e2e/header.spec.ts`.

---

## 3. Existing architecture map

```
Browser
  ├─ src/proxy.ts .............. per-request nonce CSP, no-store on private paths
  ├─ header / drawer ........... locale + theme toggles, wallet chip, cart, menu
  └─ fetch → /api/*
        │
        ├─ verifySameOrigin()  (src/lib/security/csrf.ts)  ← every state-changing handler
        ├─ readJsonBody()/readAuthJson()  (size-capped, content-type checked)
        ├─ Zod validation (src/lib/validation.ts, src/lib/security/auth-validation.ts)
        ├─ rate limits (DB-backed, per-IP / per-cart / per-email)
        ├─ session (opaque 256-bit cookie → SHA-256 digest in account_sessions)
        └─ Drizzle ORM (node-postgres) → PostgreSQL
```

### 3.1 Authentication (reusable as-is)

- `users` table: `id uuid`, `email` (lowercase CHECK), `display_name`, `password_hash` (scrypt N=16384), `google_sub`, `role` (`customer|admin`), `email_verified_at`, timestamps.
- `account_sessions`: only a SHA-256 **digest** of a 256-bit opaque token is stored; 7-day TTL plus idle timeout (`account-session-policy.ts`), `last_used_at` throttled writes, session listing and revoke-all.
- `email_verification_codes`: HMAC digest only, 6-digit CSPRNG, 5 attempts, 10-minute expiry, resend cooldown, single use.
- `google_oauth_states`: hashed state, nonce, PKCE verifier, same-origin return path (`safeReturnPath`).
- Registration (`/api/auth/email/register`) creates the user with the DB default role `customer`; **the client cannot supply a role** (Zod strips unknown keys). This is the pattern to keep for seller applications.
- Account enumeration resistance, dummy-hash password verification, rate-limit scopes, and `security_audit_log` events are already in place.

**Implication:** seller identity must be layered on top of `users` + `account_sessions`; no new auth system.

### 3.2 Database (12 tables, all in `public`)

`categories`, `products`, `carts`, `cart_items`, `orders`, `order_items`, `users`, `email_verification_codes`, `account_sessions`, `auth_rate_limits`, `google_oauth_states`, `security_audit_log`.

Relevant facts:

- `products`: `price_cents integer` (CHECK `> 0`), `stock integer` (CHECK `>= 0`), `category_id` FK, `icon`, `featured`, `input_type`, bilingual `name_ar`/`description_ar`. **No `seller_id`, no publication status, no image URL, no delivery instructions.**
- `orders`: `user_id` (nullable, `ON DELETE SET NULL`), `order_number` unique, `status` CHECK in `('confirmed','paid','completed','cancelled','fulfilled','pending','demo-unpaid')`, integer cent totals, no currency column, no seller, no payment reference, no idempotency key.
- `order_items`: product snapshots (`product_name`, `product_name_ar`, `unit_price_cents`, `quantity`, `delivery_code`, `delivery_info`), CHECK quantity 1–99 and price `> 0`.
- `users.role` CHECK is exactly `('customer','admin')`.
- No `jsonb` usage, no ledger, no audit table beyond `security_audit_log` (`event varchar(48)`, `detail varchar(128)` — deliberately non-sensitive, too narrow for marketplace financial audit).

### 3.3 Money handling

- Integer cents everywhere; `src/lib/money.ts` formats **USD** (`Intl.NumberFormat` with `currency: "USD"`), plus a display-only indicative USD→EGP rate (`USD_TO_EGP_PREVIEW_RATE = 55.3`, explicitly labelled "update before live commercial use").
- The business example in the brief is in **EGP (100 → 10 → 90)**. This is a **currency decision** the plan must not silently resolve (§12, D1).
- No ledger, no balances, no commission, no fees, no payouts, no FX.

### 3.4 Cart

- Anonymous cart bound to an HMAC-signed `evora_cart` cookie; `carts` + `cart_items` with `unique(cart_id, product_id)`.
- `addToCartLine()` locks the product row (`SELECT … FOR UPDATE`), clamps to stock and 99 via a single `INSERT … ON CONFLICT DO UPDATE` — no read-modify-write race exists today.
- Cart lines reference `product_id` only; there is **no seller grouping**, which is exactly what makes a multi-seller cart feasible without redesign: grouping happens at checkout from `products.seller_id`.

### 3.5 Checkout & order lifecycle (critical finding)

- `src/lib/checkout-policy.ts` → `resolveCheckoutMode()`:
  - `disabled` in production (unless the explicit env flag, which boot validation refuses for `demo`);
  - `demo` only outside production **and** off a public https origin.
- `POST /api/checkout` returns `503 CHECKOUT_DISABLED` in production **before reading the request or touching the DB** (asserted by `tests/checkout-safety.test.ts` and a no-network tripwire probe).
- `recordDemoOrder()` writes one `orders` row + `order_items` snapshots in a transaction, status `demo-unpaid`, **does not** decrement stock, **does not** clear the cart, **does not** emit delivery codes, and takes totals from DB product prices (never from the client).
- `orders.user_id` is set from the session, never from the typed email (S-08).
- `/checkout/success` exposes only an unguessable order reference.

**Implication:** "commission on successfully paid sales" is currently **unreachable by design**. The marketplace must therefore separate *order/ledger recording* from *settlement*, keep demo orders non-withdrawable, and implement provider settlement behind a flag that is off and refused in production — matching the existing `CHECKOUT_MODE` discipline.

### 3.6 Wallet

`src/lib/wallet.ts` exports `DEMO_WALLET_BALANCE = { usdCents: 0, egpCents: 0, isDemo: true }` and is shared by the header chip, `/account`, and `/account/wallet`. There is no deposit, no withdraw, no balance query. This is an **honest placeholder to preserve**, not a system to extend into seller payouts.

### 3.7 Admin

`src/app/admin/page.tsx` is the only admin surface: a server component that 404s (not 403) for anyone who is not signed in with a verified email **and** (`role === 'admin'` or email matches `ADMIN_EMAIL`). It logs `admin_access` / `admin_denied`, renders four review links, and explicitly states that price/stock/user editing is not implemented rather than showing fake buttons. **There is no admin API, no server action, and no approval workflow of any kind.**

### 3.8 Migration runner (must not be bypassed)

`src/lib/db/migrations.ts`:

- reads `drizzle/meta/_journal.json`, splits each `NNNN_*.sql` on `--> statement-breakpoint`, records **SHA-256 of the exact file** in `drizzle.__drizzle_migrations` (`created_at = journal.when`);
- runs everything in one transaction under `pg_advisory_xact_lock(814731903)`;
- refuses unknown/partial/drifted schemas, hash mismatches, duplicate records, and remote/production targets without explicit `ALLOW_*` opt-ins;
- `REQUIREMENTS` currently covers `0000_init`, `0001_evora-digital`, `0002_authentication` (0003 is applied but unverified); **any new migration without a `REQUIREMENTS` entry is applied but not shape-verified**;
- post-commit verification re-inspects the schema and rolls back DDL + bookkeeping together on failure.

**Implication:** new tables must arrive as **new, append-only** `0004_*.sql` / `0005_*.sql` files with matching `REQUIREMENTS` entries and snapshot + journal updates. Never edit `0000`–`0003`.

### 3.9 Localization & theming

- Single serializable dictionary (`en` + `ar`) in `src/lib/i18n/dictionary.ts`, typed as `Dict`; locale resolved from cookie → `Accept-Language` → `en`; `<html lang dir>` set in `layout.tsx`; Cairo for Arabic.
- Theme via `data-theme` on `<html>` (cookie), Tailwind v4 tokens (`bg-base`, `bg-card`, `border-edge`, `text-muted`, `bg-primary`, `bg-raised`, `badge-*`, `glass-card`, `btn-primary`, `btn-ghost`).
- Existing pages use logical properties (`ms/me`, `start/end`) and RTL-safe layouts; the mobile drawer has a focus trap, Escape/overlay close, and `inert` background (P0-1, CI-verified).

### 3.10 Testing & CI

- `node:test` + `tsx` (`npm test`), PGlite (real Postgres in WASM) for migration/schema tests, real-PostgreSQL integration tests gated behind `TEST_DATABASE_URL` **and** a strict disposable-database policy (`_test` suffix, loopback host, `ALLOW_REMOTE_TEST_DATABASE` opt-in).
- Existing safety-style tests worth imitating: no-network tripwire probes, "production checkout fails closed", seed never rewrites rows, migration idempotence/adoption, `guard-probe.ts` source assertions.
- Playwright: one spec (`e2e/header.spec.ts`), Chromium, builds and starts the app on port 3100.
- CI (`.github/workflows`) starts PostgreSQL 16, runs `npm ci`, lint, typecheck, `db:migrate`, then the suite.

---

## 4. Gap analysis against the 13 phases

| Phase | Requirement | Current state | Plan |
| --- | --- | --- | --- |
| 1 | Audit, branch, safety | ✅ done (this document) | Stop for approval |
| 2 | Account-type selection | ❌ none (header has no visible Login link; `/login` has sign-in/sign-up tabs) | New `/welcome` page + header entry; exact AR/EN copy |
| 3 | Buyer accounts | 🟡 auth + orders exist; no support requests, no order detail page | Buyers remain `customer`; add order detail + support request records |
| 4 | Seller registration/approval | ❌ none | `seller_profiles` + events, `/sell` application, admin review, server-enforced status |
| 5 | Seller dashboard (13 sections) | ❌ none | `/seller/*` route group, ownership-scoped queries |
| 6 | 10% commission engine | ❌ none | Pure integer commission module + per-line snapshot + ledger |
| 7 | Multi-seller cart/checkout | 🟡 single-seller demo order | Split into per-seller `orders` under one `checkout_group_id`; idempotency; demo-safe |
| 8 | Earnings & payouts | ❌ demo zero wallet only | Derived balances from ledger; payout requests + admin state machine; demo non-withdrawable |
| 9 | Optional subscriptions | ❌ none | Plan/subscription tables, Free active only, no invented prices |
| 10 | Admin control center | 🟡 review-only hub, 404 guard | Extend `/admin/*` + admin-only route handlers + rich audit |
| 11 | DB & security | 🟡 strong baseline, no marketplace objects | New schema with FK/index/unique/CHECK, idempotency, ownership tests |
| 12 | UI/localization/quality | 🟡 bilingual, themed, responsive | New copy in both languages, logical properties, 320/360/768/1280 checks |
| 13 | Testing & delivery | 🟡 69 pass / 6 skipped, build green | Unit + PGlite DB tests, Playwright specs in CI, evidence + report |

---

## 5. Proposed target architecture

```
src/
  app/
    welcome/page.tsx                     ← Phase 2 account-type selection
    login/page.tsx                       ← unchanged behaviour, optional intent banner
    sell/page.tsx                        ← seller landing / application entry
    sell/apply/page.tsx                  ← seller application form (server action / route)
    seller/layout.tsx                    ← approved-seller gate + nav
    seller/page.tsx                      ← overview
    seller/products/…                    ← list, new, [id]/edit
    seller/orders/…                      ← seller-scoped orders + detail
    seller/analytics/page.tsx
    seller/earnings/page.tsx             ← gross / commission / pending / available / paid out
    seller/payouts/page.tsx              ← request + history
    seller/store/page.tsx                ← store profile
    seller/subscription/page.tsx         ← plans (Free active, others "coming soon")
    seller/notifications/page.tsx
    admin/…                              ← marketplace control center modules
    api/
      seller/applications/route.ts        ← submit/update own application
      seller/products/route.ts            ← create (approved seller only)
      seller/products/[id]/route.ts       ← patch/archive (ownership enforced)
      seller/payouts/route.ts             ← request payout
      admin/sellers/[id]/decision/route.ts
      admin/products/[id]/moderation/route.ts
      admin/payouts/[id]/decision/route.ts
      admin/refunds/route.ts
  lib/
    marketplace/
      roles.ts            ← server-side role resolution (buyer/seller/admin predicates)
      seller-guard.ts     ← requireSeller()/requireApprovedSeller()/requireOwnedProduct()
      admin-guard.ts      ← requireAdmin() (single source of truth, replaces inline check)
      commission.ts       ← PURE integer commission math + rounding + invariants
      ledger.ts           ← append-only entries, idempotency keys, balance derivation
      order-split.ts      ← group cart lines by seller, snapshot prices/seller/rate
      idempotency.ts      ← request-key derivation + conflict handling
      payout-policy.ts    ← payout state machine (pure, testable)
      audit.ts            ← marketplace audit writer (actor/action/target/metadata/request id)
      validation.ts       ← Zod schemas for all marketplace input
    db/
      schema.ts           ← additive tables/columns
      marketplace-*.ts    ← transactional data operations
  components/
    account-type-cards.tsx, seller-nav.tsx, seller-status-banner.tsx,
    money-amount.tsx, status-badge.tsx, admin-table.tsx, …
drizzle/
  0004_marketplace_identity.sql     ← roles, seller profiles, application events, audit
  0005_marketplace_commerce.sql     ← product ownership/status, order split, commission snapshot,
                                       ledger, payouts, subscriptions, support requests
```

### 5.1 Role model (no privilege escalation by URL or payload)

- `users.role` CHECK becomes `('customer','seller','admin')` — **superset**, existing rows untouched.
- **BUYER ≡ `customer`**: kept for backward compatibility (`/account`, `/account/orders`, `/account/wallet`, tests, and the S-08 order ownership backfill all key off the existing value). Documented explicitly in `DECISIONS.md`.
- `role='seller'` is granted **only** by an admin approval transaction, together with `seller_profiles.status='approved'`. Suspension sets `status='suspended'` and demotes `role` back to `customer` in the same transaction.
- Seller application status is authoritative in `seller_profiles.status`; it is re-read **server-side on every request** (`requireApprovedSeller()`), never taken from a cookie, header, query, or body.
- Admin: existing rule preserved and centralized (`role='admin'` **or** normalized `ADMIN_EMAIL` match, **and** `email_verified_at IS NOT NULL`), returning 404 to everyone else.

### 5.2 Schema additions (additive only)

**Identity / approval**

| Table | Key columns & constraints |
| --- | --- |
| `seller_profiles` | `id uuid PK`, `user_id uuid NOT NULL UNIQUE → users(id) ON DELETE RESTRICT`, `store_name varchar(120) NOT NULL`, `store_slug varchar(140) NOT NULL UNIQUE`, `store_description text NOT NULL DEFAULT ''`, `phone varchar(32) NOT NULL`, `country varchar(2) NOT NULL`, `business_type varchar(32) NOT NULL DEFAULT ''`, `business_registration varchar(64) NOT NULL DEFAULT ''`, `status varchar(16) NOT NULL DEFAULT 'pending'` CHECK `('pending','approved','rejected','suspended')`, `terms_accepted_at timestamptz NOT NULL`, `terms_version varchar(16) NOT NULL`, `approved_at`, `approved_by uuid → users(id)`, `rejection_reason varchar(512) NOT NULL DEFAULT ''`, `suspended_at`, `suspended_reason varchar(512) NOT NULL DEFAULT ''`, `created_at`, `updated_at`; CHECK: `status <> 'rejected' OR length(btrim(rejection_reason)) > 0`; indexes on `status`, `user_id`, `store_slug` |
| `seller_application_events` | `id uuid PK`, `seller_id uuid NOT NULL → seller_profiles(id) ON DELETE CASCADE`, `actor_id uuid → users(id) ON DELETE SET NULL`, `action varchar(24)` CHECK `('submitted','resubmitted','approved','rejected','suspended','reactivated','terms_accepted','info_updated')`, `from_status`, `to_status`, `reason varchar(512) NOT NULL DEFAULT ''`, `created_at`; index `(seller_id, created_at DESC)` |
| `marketplace_audit_events` | `id uuid PK`, `actor_id uuid → users(id) ON DELETE SET NULL`, `actor_role varchar(16)`, `action varchar(48) NOT NULL`, `target_type varchar(24) NOT NULL`, `target_id varchar(64) NOT NULL`, `metadata jsonb NOT NULL DEFAULT '{}'::jsonb` (allow-listed, non-sensitive keys only), `request_id varchar(64)`, `created_at`; indexes `(created_at)`, `(actor_id)`, `(target_type,target_id)`, `(action)` |

**Catalogue ownership**

| Change | Detail |
| --- | --- |
| `products.seller_id` | `uuid NULL → seller_profiles(id) ON DELETE RESTRICT`; `NULL` = **E-Vora platform-owned** (legacy + seeded catalogue) |
| `products.status` | `varchar(16) NOT NULL DEFAULT 'approved'` CHECK `('draft','pending','approved','rejected','archived')`; **backfill `'approved'`** so the storefront is unchanged |
| `products.delivery_instructions` | `text NOT NULL DEFAULT ''` |
| `products.image_url` | `varchar(512) NOT NULL DEFAULT ''` (validated `https://`, control-char free) — no file upload (§12 D4) |
| `products.updated_at` | `timestamptz NOT NULL DEFAULT now()` |
| indexes | `(seller_id)`, `(seller_id, status)`, `(status, featured)` |
| new CHECK | `price_cents <= 10_000_000` (bounds `price × 99` inside int4 and keeps ledger math exact) |

**Orders / commission snapshots**

| Change | Detail |
| --- | --- |
| `orders.seller_id` | `uuid NULL → seller_profiles(id)` (one order per seller; `NULL` for legacy/platform orders) |
| `orders.checkout_group_id` | `uuid NULL` — parent checkout reference shared by the split orders |
| `orders.currency` | `varchar(3) NOT NULL DEFAULT 'USD'` (decision D1; existing rows keep working) |
| `orders.payment_status` | `varchar(16) NOT NULL DEFAULT 'unpaid'` CHECK `('unpaid','pending','paid','failed','refunded','partially_refunded','cancelled')` |
| `orders.settlement_source` | `varchar(16) NOT NULL DEFAULT 'demo'` CHECK `('demo','provider')` |
| `orders.status` | **superset** of current CHECK, adding `'pending_payment','refunded','partially_refunded'` |
| `order_items.seller_id` | `uuid NULL → seller_profiles(id)` (seller identity snapshot at purchase) |
| `order_items.commission_rate_bps` | `integer NOT NULL DEFAULT 0` (snapshot: `1000` = 10%) |
| `order_items.commission_cents` | `integer NOT NULL DEFAULT 0` |
| `order_items.seller_entitlement_cents` | `integer NOT NULL DEFAULT 0` |
| new CHECKs | all three `>= 0`; `commission_cents + seller_entitlement_cents <= unit_price_cents * quantity` |
| indexes | `orders(seller_id)`, `orders(checkout_group_id)`, `orders(payment_status)`, `order_items(order_id, seller_id)` |

**Idempotency**

| Table | Detail |
| --- | --- |
| `checkout_idempotency` | `id uuid PK`, `buyer_id uuid NULL → users(id)`, `cart_id uuid NOT NULL`, `idempotency_key varchar(64) NOT NULL`, `checkout_group_id uuid NOT NULL`, `order_count integer NOT NULL`, `created_at`; **UNIQUE `(cart_id, idempotency_key)`** — a retried submit returns the same group, never a second set of orders |

**Financial ledger (append-only)**

| Table | Detail |
| --- | --- |
| `seller_ledger_entries` | `id uuid PK`, `seller_id uuid NOT NULL → seller_profiles(id)`, `order_id uuid NULL → orders(id)`, `order_item_id integer NULL → order_items(id)`, `entry_type varchar(24)` CHECK `('sale_gross','commission','seller_entitlement','refund','refund_reversal','chargeback','adjustment','payout_hold','payout_release','payout_paid','payout_reversal')`, `direction smallint` CHECK `(-1,1)`, `amount_cents integer` CHECK `> 0`, `currency varchar(3) NOT NULL`, `bucket varchar(16) NOT NULL` CHECK `('pending','available','paid_out','demo')`, `commission_rate_bps integer NULL`, `settlement_source varchar(16) NOT NULL` CHECK `('demo','provider','admin_adjustment')`, `idempotency_key varchar(160) NOT NULL UNIQUE`, `created_at`, `created_by uuid → users(id)` |
| indexes | `(seller_id, bucket)`, `(order_id)`, `(order_item_id)`, `(created_at)` |
| immutability | no `UPDATE`/`DELETE` code paths; corrections are new rows. A `BEFORE UPDATE OR DELETE` trigger raises an exception (defence in depth; documented as intentionally restrictive for this table only) |

**Payouts**

| Table | Detail |
| --- | --- |
| `payout_requests` | `id uuid PK`, `seller_id uuid NOT NULL → seller_profiles(id)`, `amount_cents integer NOT NULL CHECK (> 0)`, `currency varchar(3) NOT NULL`, `method varchar(16) NOT NULL` CHECK `('bank_transfer','instapay','vodafone_cash','other')`, `method_reference_masked varchar(64) NOT NULL DEFAULT ''` (never full card/bank credentials), `status varchar(16) NOT NULL DEFAULT 'requested'` CHECK `('requested','under_review','approved','processing','paid','rejected','cancelled')`, `idempotency_key varchar(160) NOT NULL UNIQUE`, `requested_at`, `decided_by uuid → users(id)`, `decided_at`, `paid_at`, `rejection_reason varchar(512)`, `admin_note varchar(512)`, `created_at`, `updated_at`; CHECK `paid_at IS NULL OR status = 'paid'`; **partial unique index**: at most one of `('requested','under_review','approved','processing')` per seller |
| `payout_events` | `id uuid PK`, `payout_id → payout_requests(id) ON DELETE CASCADE`, `actor_id`, `action`, `from_status`, `to_status`, `note varchar(512)`, `created_at` |

**Subscriptions (model only)**

| Table | Detail |
| --- | --- |
| `subscription_plans` | `id serial PK`, `code varchar(32) UNIQUE`, `name`, `name_ar`, `price_cents integer NOT NULL DEFAULT 0 CHECK (>= 0)`, `currency varchar(3)`, `billing_period varchar(16)` CHECK `('monthly','yearly','none')`, `product_limit integer NULL`, `analytics_level varchar(16)`, `featured_eligibility boolean NOT NULL DEFAULT false`, `is_active boolean NOT NULL DEFAULT false`, `is_coming_soon boolean NOT NULL DEFAULT true`, `created_at` |
| `seller_subscriptions` | `id uuid PK`, `seller_id → seller_profiles(id)`, `plan_id → subscription_plans(id)`, `status varchar(16)` CHECK `('active','past_due','cancelled','expired')`, `started_at`, `renews_at`, `expires_at`, `payment_reference varchar(128) NOT NULL DEFAULT ''`, `created_at`; partial unique: one `active` subscription per seller |
| seed | **Free plan only** (`price_cents = 0`, `is_active = true`, `billing_period='none'`). Pro/Business are **not seeded** with invented prices; the UI reads "coming soon" from a code-level constant until business approval (D3). |

**Buyer support requests (Phase 3)**

| Table | Detail |
| --- | --- |
| `support_requests` | `id uuid PK`, `user_id uuid NOT NULL → users(id) ON DELETE CASCADE`, `order_id uuid NULL → orders(id)`, `subject varchar(160) NOT NULL`, `message text NOT NULL`, `category varchar(24)`, `status varchar(16) NOT NULL DEFAULT 'open'` CHECK `('open','in_review','resolved','closed')`, `created_at`, `updated_at`; index `(user_id, created_at)` |
| `support_request_replies` | `id uuid PK`, `request_id → support_requests(id) ON DELETE CASCADE`, `author_id uuid → users(id)`, `author_role varchar(16)`, `message text NOT NULL`, `created_at` |

> All new timestamps are `timestamptz`; all money remains `integer` minor units; no `numeric`/`float` money anywhere.

### 5.3 Commission engine (Phase 6) — exact rules

File: `src/lib/marketplace/commission.ts` (pure, no DB, no I/O, fully unit-tested).

```
PLATFORM_COMMISSION_BPS = 1000          // 10.00% — server constant, never client-supplied
MAX_PRODUCT_PRICE_CENTS = 10_000_000
MAX_LINE_QUANTITY       = 99

commissionCents(grossCents, rateBps):
    BigInt: (gross * rateBps + 5_000) / 10_000      // integer division
sellerEntitlementCents = grossCents - commissionCents  // exact complement, no drift
```

- **Rounding rule (documented + tested):** commission is rounded **half-up to the nearest minor unit**; the remainder always belongs to the seller, so `commission + entitlement === gross` for every line, always — no fractional residue and no reconciliation gap.
- **Granularity:** computed **per order line**, and an order's commission is the **sum of its lines**. This avoids the classic "round per order then compare" mismatch in split carts.
- **Worked example (brief):** product 100 EGP → 10,000 piasters; commission `(10000 × 1000 + 5000) / 10000 = 1,000` piasters = **10 EGP**; seller entitlement **9,000 piasters = 90 EGP**. With an odd gross of 1,001 piasters: commission 100, seller 901 (sum preserved).
- **Snapshotting:** `order_items` stores `unit_price_cents`, `quantity`, `commission_rate_bps`, `commission_cents`, `seller_entitlement_cents`, `seller_id`, plus `orders.currency`. Later rate changes never rewrite history.
- **Trust boundary:** prices are read from `products` inside the checkout transaction with `SELECT … FOR UPDATE`; the request body carries **no** price, total, commission, seller id, or role. Zod strips unknown keys.
- **Eligibility:** ledger entries are written **only** when `payment_status='paid'` **and** `settlement_source='provider'` (verified) — not on cart creation, pending orders, failed payments, cancellations, or demo orders. In demo mode entries are written to the `demo` bucket only (`settlement_source='demo'`), which is excluded from every balance and payout computation.
- **Refunds/chargebacks:** append **reversal rows** (`entry_type='refund'|'chargeback'`, `direction=-1`) referencing the original order item, in the same bucket; never `UPDATE`/`DELETE` an existing entry. Partial refunds are supported by amount; per-line refund caps enforced in SQL (`SUM(reversals) <= original amount`).
- **Exactly-once:** every entry carries a deterministic `idempotency_key` (e.g. `sale:<order_item_id>:entitlement`, `refund:<refund_id>:commission`) with a `UNIQUE` constraint; a duplicate insert is a no-op conflict, and the whole write is inside one DB transaction.
- **No cash-on-order:** `sale_*` entries land in `pending` (provider settlement pending) and only move to `available` via a **settlement marker entry** (`entry_type='adjustment'` in `available` with a settlement key) driven by a verified provider event. Until a provider exists, nothing ever becomes `available`.

### 5.4 Multi-seller cart & checkout (Phase 7)

1. Cart stays exactly as it is (one cart, many products, unknown sellers).
2. At checkout, inside **one transaction**: lock all product rows; re-validate `status='approved'`, seller approved, `stock >= quantity`; group lines by `seller_id` (platform-owned lines grouped under a `NULL` seller bucket).
3. Create **one `orders` row per seller group** sharing a single `checkout_group_id`; each item snapshots seller, price, and the commission calculation.
4. Existing single-order behaviour is preserved when all lines share one seller (the common case) — same `orders` table, so `/account/orders` and `/checkout/success` keep working; the success page learns to list a group's references.
5. Duplicate prevention: `checkout_idempotency` UNIQUE `(cart_id, idempotency_key)`; order numbers remain unique; the client generates the key once per checkout intent.
6. **Demo mode:** the group is created with `status='demo-unpaid'`, `payment_status='unpaid'`, `settlement_source='demo'`; no stock decrement, no cart clear, no codes, no withdrawable balance — identical guarantees to today.
7. **Provider mode (off by default):** `CHECKOUT_MODE=provider` would require `PAYMENT_PROVIDER` config, verified webhook signature, and a server-side "confirm payment" transition. Refused in production until explicitly approved and configured; a boot-time error otherwise. This is a **wiring point**, not a fabricated feature.
8. Failure/cancel/refund: orders move `pending_payment → cancelled` (no ledger) or `paid → refunded` (reversal entries only). No orphan ledger rows.

### 5.5 Seller earnings & payouts (Phase 8)

- Concepts are separate, never conflated: **gross sales**, **platform commission**, **processing fees** (column reserved, always 0 until a provider fee is verified — never invented), **refunds/adjustments**, **pending**, **available**, **paid out**.
- Balances are **derived** from the ledger (`SUM` by `bucket`), not stored counters — no drift, no double counting.
- Payout request requires: approved seller + authenticated session + `amount <= available balance` + supported method + valid masked reference + no open request. Verified server-side inside a transaction that locks the seller row and inserts a `payout_hold` entry (reserving funds).
- State machine (`payout-policy.ts`, pure + tested): `requested → under_review → approved → processing → paid`; `requested/under_review/approved → rejected|cancelled`. `paid` is reachable **only** from an admin action (or, later, a verified payout-provider webhook) — never from a seller request.
- In demo mode: payout UI is present but disabled with an explicit notice; the API returns `PAYOUTS_UNAVAILABLE` for demo-only balances. No fake payouts, no fake "paid" states.
- Stored data: masked reference only (`••••1234` style), no PAN, no CVV, no full IBAN.

### 5.6 Admin control center (Phase 10)

- Extend the existing `/admin` (guard preserved, centralized in `requireAdmin()`): Seller Applications · Approved Sellers · Suspended Sellers · Product Moderation · Marketplace Orders · Commission Reports · Seller Earnings · Payout Requests · Subscription Management (read-only until D3) · Refunds & Disputes · Audit Logs.
- Every mutation is a **server-side route handler** with: same-origin check → `requireAdmin()` → Zod validation → DB transaction → **audit row** (actor id, actor role, action, target type/id, safe metadata, `request_id`).
- `x-request-id` is generated per request in `src/proxy.ts` (and accepted only if well-formed) so audit rows correlate to logs.
- Audit metadata is allow-listed (ids, amounts, statuses, reasons) — never emails, tokens, passwords, or full payment references.
- Buyers and sellers get 404 on `/admin/*` (existing convention), and every admin API returns 401/403 without leaking existence.

### 5.7 Authorization matrix (server-enforced)

| Operation | Buyer (`customer`) | Seller (pending/rejected/suspended) | Seller (approved) | Admin |
| --- | --- | --- | --- | --- |
| Browse catalogue | ✅ | ✅ | ✅ | ✅ |
| Cart & checkout (own cart) | ✅ | ✅ | ✅ | ✅ |
| Own order history / detail | ✅ (own `user_id` only) | ✅ as buyer | ✅ as buyer | ✅ (audited) |
| Submit support request | ✅ | ✅ | ✅ | ✅ |
| Submit seller application | ✅ (upgrades to pending) | — (edit own while pending) | — | — |
| Create/edit/publish product | ❌ 404 | ❌ 403 `SELLER_NOT_APPROVED` | ✅ **own** products only | ✅ moderation only |
| View seller orders/analytics | ❌ | ❌ | ✅ own `seller_id` only | ✅ all |
| See balances / request payout | ❌ | ❌ | ✅ own, provider-settled only | ✅ all |
| Approve/reject/suspend seller | ❌ | ❌ | ❌ | ✅ audited |
| Mark payout paid | ❌ | ❌ | ❌ | ✅ audited |
| Refunds / disputes | ❌ | ❌ | ❌ | ✅ audited |

IDOR defence: seller scope is **always** `seller_profiles.id` resolved from `session.user.id`; a route `[id]` is queried as `WHERE id = $1 AND seller_id = $2`. No endpoint accepts `sellerId`, `role`, `commission`, or `price` from the browser for authorization or money.

---

## 6. Migration plan

### 6.1 Files

| File | Contents |
| --- | --- |
| `drizzle/0004_marketplace_identity.sql` | extend `users.role` CHECK (superset); create `seller_profiles`, `seller_application_events`, `marketplace_audit_events`; backfill nothing |
| `drizzle/0005_marketplace_commerce.sql` | `products.seller_id/status/delivery_instructions/image_url/updated_at` + backfill `status='approved'`; `orders` split/payment/settlement/currency columns + extended status CHECK; `order_items` seller + commission snapshot columns + CHECKs; `checkout_idempotency`; `seller_ledger_entries` (+ immutability trigger); `payout_requests`/`payout_events`; `subscription_plans`/`seller_subscriptions` (+ Free plan seed); `support_requests`/`support_request_replies`; all indexes |
| `drizzle/meta/_journal.json` + `drizzle/meta/0004_snapshot.json`, `0005_snapshot.json` | generated by `npm run db:generate`, reviewed by hand |
| `src/lib/db/migrations.ts` | add `REQUIREMENTS` entries for `0004_marketplace_identity` and `0005_marketplace_commerce` (tables, columns, indexes, constraints, CHECK names) so the runner verifies final shape |
| `src/lib/db/schema.ts` | mirror the new tables/columns in Drizzle definitions |

### 6.2 Safety properties

- **Append-only**: `0000`–`0003` are never edited (their SHA-256 is recorded in live databases; any edit aborts the runner by design).
- **Never run against production.** All rehearsals use disposable local `*_test` databases / PGlite. Existing `ALLOW_REMOTE_MIGRATION` / `ALLOW_PRODUCTION_MIGRATION` / `CONFIRM_PRODUCTION_BACKUP` guards stay untouched.
- **Additive DDL only**: `CREATE TABLE`, `ADD COLUMN` with defaults, superset CHECK replacement, `CREATE INDEX`. No `DROP TABLE`, no column drops, no type changes, no data deletion.
- **Data-preserving backfills**: `products.status='approved'`, `orders.currency` default, `orders.settlement_source='demo'` for existing rows, `order_items` commission columns `0` for historical rows (never retro-compute commission on pre-existing orders — the ledger starts empty, which is the honest state).
- **Legacy compatibility preflight** in the runner is unaffected: baseline (0000) requirement is unchanged, so adoption of legacy storefront databases still works; new migrations then apply on top.
- **Rehearsal matrix** before merge: (1) fresh empty DB, (2) legacy `0000_init` DB via `--adopt-existing`, (3) DB with `0000`–`0003` applied, (4) repeat run = no-op, (5) `--dry-run` inspected, (6) downstream assertions: catalogue count/rows unchanged, order rows unchanged, `users` count unchanged.
- **Rollback**: code rollback is safe (new columns are nullable/defaulted); schema rollback, if ever needed, is a separately reviewed reverse migration — not part of this work. A tested backup/restore remains an operator prerequisite for any real environment.

---

## 7. UI, localization, and quality plan (Phase 12)

### 7.1 Account-type selection (Phase 2)

Route `/welcome` (server component; `robots: noindex`). Preserves the current E-Vora look (dark gradient, red accent, `glass-card`, `btn-primary`/`btn-ghost`).

- Heading AR: **"أهلاً بك في E-Vora"** · EN: "Welcome to E-Vora"
- Subtitle AR: **"اختر نوع الحساب المناسب ليك"** · EN: "Choose the account type that fits you"
- **Buyer card** — AR title `حساب مشتري`, EN title `Buyer Account`; description EN "Browse digital products, purchase services, and track orders." / AR "تصفّح المنتجات الرقمية، اشترِ الخدمات، وتابع طلباتك."; CTA EN "Continue as Buyer" / AR **"المتابعة كمشتري"** → `/login?intent=buyer&next=…` (existing sign-in/sign-up panel unchanged).
- **Seller card** — AR title `حساب تاجر`, EN title `Seller Account`; description EN "Sell digital products, manage orders, and track earnings." / AR "بِع منتجاتك الرقمية، أدر طلباتك، وتابع أرباحك."; CTA EN "Join as Seller" / AR **"انضم كتاجر"** → `/sell`.
- Hero artwork: brand-native geometric/letterform SVG (E-Vora "E" mark, layered gradient panels) — **no eye imagery, no generic stock-store photos**, no new dependencies.
- Header gains an explicit account entry: signed out → `/welcome`; signed in → `/account` (label "Account" / "الحساب"). Preserves the 320px layout (icon-only), existing `data-testid`s and the wallet chip.
- `/login` keeps working exactly as today (no forced redirect loop), accepts optional `intent` to pre-select the tab and show a role hint.

### 7.2 Seller experience

`/sell` (landing + terms), `/sell/apply` (form: full name, email read-only from session, phone, store name, store description, country, business type/registration, terms checkbox), `/seller/*` dashboard with 13 sections, `seller-status-banner` for `pending`/`rejected`/`suspended` (reason shown, publish disabled), and empty/loading/error states for every list.

### 7.3 Localization, RTL/LTR, themes

- All new copy added to **both** `en` and `ar` in `src/lib/i18n/dictionary.ts`; no English-only leakage in AR mode (verified by a dictionary key-parity test).
- Layouts use logical utilities (`ms-/me-`, `ps-/pe-`, `start-/end-`, `text-start/end`) and `dir`-safe icons; RTL re-verified on every new page.
- Only existing design tokens (`bg-base/card/raised`, `border-edge`, `text-muted`, `bg-primary`, `badge-*`) — dark **and** light theme checked; no new hardcoded colors.
- Responsive breakpoints tested at **320 / 360 / 768 / 1280**; tables become stacked cards below `sm` (the orders page already models this).

### 7.4 Accessibility

Real `<a>`/`<button>` elements (no click-only divs), visible focus rings, 44px minimum targets, `aria-labelledby` on cards, text status badges (never color-only), labelled form fields with `aria-describedby` errors, `aria-live="polite"` for async results, keyboard-only test pass, and no motion beyond existing reduced-motion-safe transitions.

---

## 8. Security test plan (Phase 11 mapping)

| Risk | Test |
| --- | --- |
| IDOR/BOLA on seller resources | approved seller A queries seller B's product/order/payout id → 404, zero rows; assert SQL scope includes `seller_id` |
| Privilege escalation | POST product/application payloads containing `role`, `sellerId`, `status`, `commission`, `approved` → stripped/rejected; session role unchanged |
| Seller-to-seller leakage | seller dashboard lists, analytics, earnings only contain own rows (seeded two-seller fixture) |
| Buyer → seller endpoints | `customer` session gets 403/404 on every `/api/seller/*` and `/seller/*` |
| Unauthorized admin | non-admin (buyer, seller, signed-out) gets 404 on `/admin/*` and 401/403 on admin APIs; audited denial |
| Double spending | two concurrent payout requests cannot exceed available balance (row lock + hold entries + partial unique index) |
| Duplicate commission | replaying the same payment-confirm event inserts once (`UNIQUE idempotency_key`) |
| Duplicate order | same `(cart_id, idempotency_key)` twice → one checkout group |
| Price manipulation | request with `price`/`total`/`quantity` tampering → server stores DB price; negative/overflow rejected by Zod **and** DB CHECK |
| Negative/invalid quantity | 0, −1, 100, `1e9`, decimals rejected |
| Race conditions | concurrent `addToCartLine` and concurrent checkout on the same cart remain consistent (existing lock pattern extended) |
| Refund inconsistency | reversal sum cannot exceed original amount; ledger rows never mutated |
| Session/CSRF | state-changing marketplace routes require `verifySameOrigin`; expired/revoked session rejected; cookie flags unchanged |
| Audit completeness | every approval/suspension/moderation/payout/refund action writes one audit row with actor + target + request id |

---

## 9. Test & verification plan (Phase 13)

**Added tests (all runnable in this sandbox except browser ones)**

1. `tests/marketplace-commission.test.ts` (pure): rounding table (1…10,000 cents × several quantities), `commission + entitlement === gross` invariant, bps clamp/negative/float rejection, large-price overflow guard, currency snapshot carried through, demo entries never `available`.
2. `tests/marketplace-payout-policy.test.ts` (pure): every legal/illegal state transition, seller cannot reach `paid`, idempotency key derivation, method allow-list.
3. `tests/marketplace-order-split.test.ts` (PGlite): multi-seller cart → N orders sharing `checkout_group_id`, per-line snapshots, legacy single-seller path unchanged, demo order still does not decrement stock/clear cart, insufficient stock rollback.
4. `tests/marketplace-ledger.test.ts` (PGlite): exactly-once entries, unique idempotency, no balance from demo, refund reversal symmetry, imbalance impossible, immutability trigger blocks UPDATE/DELETE.
5. `tests/marketplace-authorization.test.ts` (PGlite + pure guards): the full matrix in §5.7, cross-seller scoping, buyer→seller, pending seller blocked from publish/finance, admin denial paths.
6. `tests/marketplace-migration.test.ts` (PGlite): fresh install applies 0000–0005 and final table/constraint set matches; legacy adoption still works; storefront rows/orders/users preserved; repeat run no-op; `--dry-run` writes nothing.
7. Existing suites updated **intentionally and visibly**: `tests/schema-migration.test.ts` (exact table list), any snapshot/journal assertions — changes documented in the delivery report, never silently.
8. `e2e/marketplace.spec.ts` (CI only, browsers unavailable here): account-type page AR+EN at 320/360/768/1280, keyboard navigation, theme toggle, seller application validation, pending seller cannot publish, admin approval → seller dashboard, buyer demo checkout unchanged.

**Gates before delivery:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:migrate -- --dry-run` (disposable DB), `npm run build`. Lint/typecheck/test/build already pass on the current baseline; the plan keeps them green at every step.

---

## 10. Backward-compatibility risk register

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | Backfilling `products.status` wrongly empties the storefront | Default `'approved'`, explicit UPDATE, catalogue-count assertion in migration + seed tests |
| R2 | Extending `orders.status` / `users.role` CHECKs breaks historical rows | Checks become **supersets**; migration rehearsal includes legacy rows |
| R3 | Migration hash drift | Never edit `0000`–`0003`; append `0004`/`0005`; hashes verified by runner |
| R4 | PGlite/CI table-list assertions fail | Update tests deliberately with explicit diff review (documented) |
| R5 | Catalogue preview fallback (no DB) breaks | New filters degrade to the existing preview path; tests without `DATABASE_URL` |
| R6 | `/admin` 404 semantics regress | `requireAdmin()` preserves verified-email + role/email rule and 404 |
| R7 | Buyer order history changes shape | `orders` remains the buyer-facing table; split orders share a group id but each row is still listed and grouped in the UI |
| R8 | Currency confusion (USD display vs EGP example) | Explicit decision D1; store per-order currency snapshot; no FX math anywhere |
| R9 | Demo orders accidentally create withdrawable balance | `bucket='demo'` + `settlement_source='demo'` excluded from all balance/payout queries; tested |
| R10 | Seller can raise their own commission/price | Commission is a server constant snapshotted at checkout; product price is seller-owned but always validated + bounded; commission never accepted from clients |
| R11 | Header changes break the 320px P0-1/P0-2 layout and its Playwright spec | Add entry as icon at narrow widths; keep all `data-testid`s; re-run `e2e/header.spec.ts` |
| R12 | New env vars break production boot validation | No new **required** env var; any new flag is optional, validated, and fails closed (mirrors `CHECKOUT_MODE`) |

---

## 11. Work breakdown (each step shippable, tests green)

| Step | Scope | Key files | Est. |
| --- | --- | --- | --- |
| **0** | Approve plan; record decisions D1–D6 in `docs/DECISIONS.md` | docs | — |
| **1** | Commission + payout-policy pure modules + unit tests (no schema) | `src/lib/marketplace/{commission,payout-policy,idempotency}.ts`, tests | S |
| **2** | Migration `0004` (identity/approval/audit) + `REQUIREMENTS` + PGlite migration tests | `drizzle/0004*`, `migrations.ts`, `schema.ts` | M |
| **3** | Roles/guards/audit: `roles.ts`, `seller-guard.ts`, `admin-guard.ts`, request-id in proxy; refactor `/admin` to use `requireAdmin()` | security/marketplace libs | S |
| **4** | Phase 2 UI: `/welcome`, header entry, dictionary keys, Playwright spec | app + components | M |
| **5** | Seller application (`/sell`, `/sell/apply`, API) + admin review UI/API + audit + tests | app, api, marketplace libs | M |
| **6** | Migration `0005` (commerce/ledger/payouts/plans/support) + tests | drizzle, schema.ts | L |
| **7** | Seller dashboard shell + products CRUD (ownership + approval gates) + store profile + notifications | `/seller/*`, `/api/seller/products*` | L |
| **8** | Multi-seller checkout split + idempotency + commission snapshots (demo-safe) + tests | `order-split.ts`, checkout route, `demo-order.ts` successor | L |
| **9** | Earnings/ledger views + payout requests + admin finance/refund modules + audit coverage | `/seller/earnings`, `/seller/payouts`, `/admin/*` | L |
| **10** | Subscriptions model + honest "coming soon" UI; buyer order detail + support requests | plans, support | M |
| **11** | i18n parity, RTL, themes, 320/360/768/1280, a11y pass, docs (`VERIFICATION-LOG`, report, screenshots in CI) | all UI + docs | M |

No step touches production data, deployment config, environment variables, or payment credentials.

---

## 12. Decisions required before implementation

| ID | Decision | Recommendation |
| --- | --- | --- |
| **D1** | **Settlement currency.** The catalogue displays USD (`money.ts`); the brief's commission example is EGP 100 → 10 → 90. | **APPROVED: per-order currency snapshot.** Commission is computed in that currency's minor units; no FX in the ledger. Recorded as D-12. |
| **D2** | **Commission on legacy/platform-owned products** (`seller_id IS NULL`). | **APPROVED: platform seller profile.** One system-owned profile (`is_platform`, no `user_id`) shares the reporting shape; platform lines use 0 bps so no commission is booked against E-Vora. Recorded as D-11. |
| **D3** | **Paid subscription plans.** | Model only. Seed **Free (0)** as active; Pro/Business show "Coming soon" with **no invented prices** until you approve pricing. |
| **D4** | **Product images.** No object storage exists in this repo. | Ship `image_url` (validated `https://`) + existing SVG/icon fallback; no upload endpoint until storage credentials exist. |
| **D5** | **Demo vs provider settlement.** | Demo orders create **non-withdrawable** ledger entries; payout requests are disabled in demo mode with an explicit notice. Real `available` balances and payouts require a verified provider integration that you approve separately. |
| **D6** | **Admin bootstrapping.** | Keep `users.role='admin'` + `ADMIN_EMAIL` fallback exactly as today; no new admin secrets or default accounts. |

---

## 13. What this plan deliberately does **not** do

- No invented sales, balances, products, payment confirmations, or payouts.
- No live payment provider connection, no activation of paid plans, no card/bank credential storage.
- No production migration, deployment, or environment-variable change.
- No weakening of existing controls (Origin checks, opaque sessions, rate limits, CSP, 404 admin hiding, integer money, transactional writes).
- No removal or rewrite of working storefront features; every change is additive and reversible in code.
- No merge of any pull request; no deploy.

---

## 14. Awaiting approval

**No application code has been written.** Only this document was added (and dependency installation for the read-only baseline checks).

To proceed, please reply with **approval** plus answers to **D1** (currency) — and, if you disagree, D2/D3/D4/D5/D6. On approval I will work strictly on `arena/6bbbf7ed-web-stor`, in the order above, keeping lint / typecheck / tests / build green and reporting exact commands and results at each step.


---

## 15. Implementation progress (incremental, approved 2026-10-28)

The owner approved the plan with three changes: build in smaller reviewable
steps, snapshot currency per order (D-12), and model E-Vora's own catalogue as a
platform seller profile (D-11). Recorded in `docs/DECISIONS.md` as D-09…D-15.

### Step 1 — Commission engine, payout policy, idempotency (DONE)

| File | Purpose |
| --- | --- |
| `src/lib/marketplace/commission.ts` | Pure 10% integer engine: `calculateLineCommission`, half-up rounding, per-line snapshots, order sums, currency guard, platform 0-bps constant |
| `src/lib/marketplace/payout-policy.ts` | Pure payout state machine (7 statuses), seller-cannot-mark-paid rule, eligibility checks with typed refusal codes, bilingual refusal copy |
| `src/lib/marketplace/idempotency.ts` | Deterministic ledger keys (`sale:`, `refund:`, `payout:`, `settle:`) and safe handling of client checkout keys |
| `tests/marketplace-commission.test.ts` | 10%/90% example, 2 500+ exactness assertions, half-up rounding, bounds, tampering, currency |
| `tests/marketplace-payout-policy.test.ts` | Every legal/illegal transition, seller escalation attempts, demo refusal, amount bounds |
| `tests/marketplace-idempotency.test.ts` | Key stability, malformed-key replacement, uniqueness |

### Step 2 — Identity / approval / audit schema (DONE)

| File | Purpose |
| --- | --- |
| `drizzle/0004_marketplace_identity.sql` | Additive migration: `seller_profiles`, `seller_application_events`, `marketplace_audit_events`; `users.role` CHECK superset; single platform profile seed |
| `drizzle/meta/0004_snapshot.json`, `_journal.json` | Generated + reviewed migration metadata |
| `src/lib/db/schema.ts` | Drizzle definitions mirroring the SQL (FKs, CHECKs, partial unique index, jsonb metadata) |
| `src/lib/db/migrations.ts` | `0004_marketplace_identity` `REQUIREMENTS` entry so the runner verifies the final shape |
| `src/lib/marketplace/platform-seller.ts` | Platform seller id/slug + UUID helper (never client-supplied) |
| `tests/marketplace-identity-migration.test.ts` | 9 PGlite tests: tables, platform seed, platform uniqueness, pending default, terms/rejection/country CHECKs, one-profile-per-account, role CHECK, FK RESTRICT, idempotence |
| `tests/migration-runner.test.ts`, `tests/schema-migration.test.ts`, `tests/postgres-migration-compatibility.test.ts` | Expectations updated **deliberately** for the new migration (documented, not silently) |

Verification after step 2: `npm run lint` ✅ · `npm run typecheck` ✅ ·
`npm test` **115 tests: 109 pass, 0 fail, 6 skipped** (skips need a real
PostgreSQL server) · `npm run build` ✅.

Next steps pending review: step 3 (roles/guards/audit + `/admin` refactor),
step 4 (`/welcome` account-type page), step 5 (seller applications + admin
review), step 6 (commerce/ledger/payout schema).
