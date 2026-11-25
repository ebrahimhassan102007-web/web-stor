# E-Vora Master Execution Tracker (historical baseline: 2026-10-26)

**Branch at baseline:** `arena/a703a62a-web-stor` · **Environment:** local sandbox (PGlite + dev server on localhost). No production contact.

> The baseline below is historical. Follow-up work is recorded in dated sections; the current working branch is `arena/9dd6dc80-web-stor`.

Status vocabulary: DONE = implemented + verification recorded · PARTIAL = implemented in part, remainder named · NOT RUN = not executed (never reported as done) · BLOCKED = see BLOCKED.md.

## Counts (items actually enumerated in the supplied spec: 1–408 + P0/S sections)

| Scope | Total | DONE | PARTIAL | NOT RUN / BLOCKED | N/A (reasoned) |
|---|---:|---:|---:|---:|---:|
| P0-1, P0-2 | 2 | 2 — browser-verified in CI (9/9 Playwright, run 40363824136); screenshot files not yet committed (B-01) | 0 | 0 | 0 |
| S-01…S-20 | 20 | 11 | 8 (S-04, S-09, S-10, S-13, S-14, S-15, S-19 personalize, S-20) | 1 (S-18 not implemented) | 0 |
| VULN-001…118 (items 1–118) | 118 | 19 VERIFIED + 60 CLOSED by code-review evidence | 20 PARTIAL | 11 NOT RUN | 8 |
| Route matrix items 119–408 (supplied part) | 290 | 0 individually | 0 | **290 NOT RUN** (no browser; see B-01/B-03) | 0 |
| Items 409+ / later sections | unknown | — | — | BLOCKED (spec truncated, B-03) | — |

Per-item detail: `docs/security/S-*.md`, `docs/security/VULN-*.md`,
`docs/VERIFICATION-LOG.md`. The previous version of this tracker (all items
BLOCKED for missing spec) is superseded; see git history.

## What changed this session

- **P0-1:** drawer portalled to `document.body` (fixed the `backdrop-blur`
  containing-block clipping), scroll lock, focus trap + restore, Escape/
  overlay/route-change close, `inert` on main/footer, reduced-motion-safe
  slide-in, RTL-correct. Other overlays audited: the drawer was the only
  `fixed` overlay inside a blurred ancestor.
- **P0-2:** wallet chip + "+" in header (before cart) and drawer; honest
  demo `$0.00` from `src/lib/wallet.ts`; signed-out routes via login.
- **Security:** S-01 Google takeover fix; S-02/S-12 DB rate limiting with
  per-client/per-cart keys; S-03 right-counted XFF; S-05 nonce CSP via proxy;
  S-06 full header set + scanner; S-07 bounded JSON everywhere (413/415);
  S-08+S-16 migration `0003_hardening` (orders.user_id, CHECKs, indexes,
  users.role, session last-used, security_audit_log); S-09 idle timeout +
  session list + revoke-all; S-11 CHECKOUT_MODE; S-13 admin 404 + role;
  S-17 boot env validation; S-19 security.txt/robots/sitemap; audit events;
  password denylist; Dependabot + CI hardening + Playwright specs.
- **Tests:** 69 pass / 0 fail / 6 DB-skipped; lint+typecheck+build green.
  Two pre-existing tests were updated because they asserted the old
  vulnerable behavior (`req.json()` presence, pre-0003 migration lists).

## Residual risks (top)

1. Menu/wallet browser behavior is now CI-verified (9/9 Playwright), but
   CWV/Lighthouse, zoom, and screen-reader depths are still NOT RUN; the
   signed-in wallet chip has no browser test yet.
2. Migration 0003 must be applied before deploy; email-lowercase pre-step
   fails loudly on case-duplicate historic rows by design.
3. No CAPTCHA/MFA yet (S-18/S-13); rate limits are the interim control.
4. `__Host-` cookie prefix pending (S-09).
5. White-on-red small text 3.76:1 in dark theme — owner color decision.
6. S-21 now filters bidi/invisible controls on auth/profile/commerce validated strings; other display surfaces still need a full audit before VULN-088 is globally closed.
7. Moderate dependency advisories remain (including development tooling and the pinned Next.js version); CI's high-severity threshold is not a clean full audit.
8. security.txt still has placeholder contact.

## Follow-up hardening — 2026-11-25 (current branch)

**Branch:** `arena/9dd6dc80-web-stor` · local-only validation; no production systems or credentials used.

- Added S-21: streamed JSON defaults to a 16 KiB cap, rejects >32 nesting levels, malformed UTF-8, and strips prototype-mutating keys before route schemas run.
- Added NFKC, Arabic/Persian digit folding, and invisible/bidi control removal to validated auth and commerce text. Password values remain byte-exact.
- Strengthened private page/API cache headers with `private, no-store, no-cache, must-revalidate` and `Vary: Cookie`.
- Added CI `npm audit --audit-level=high` gate.
- Added regression tests for depth limits, dangerous JSON keys, Unicode normalization, auth/commerce schema behavior.

**Verification:** `npm test` 111 pass / 0 fail / 6 skipped (PostgreSQL unavailable); `npm run typecheck`, `npm run lint`, `npm run build`, and local header scan all pass. `npm run test:e2e` was attempted but the production web server failed closed without DB/secrets, before browser launch; suite result remains NOT RUN.

**Not complete:** The user's requested full 10-pass audit, password reset/change, TOTP, vault, wallet ledger/promos, dispute flow, admin command center, marketplace UX and comprehensive route-matrix testing are not delivered by this focused follow-up. Existing blocked controls and external deployment responsibilities remain open.

## Wave 2B — account security and authentication hardening (2026-11-25)

**Branch:** `arena/9dd6dc80-web-stor` · no production services or credentials used.

- **Implemented:** password reset with single-use token storage and bilingual mail; authenticated password change with session rotation and other-session revocation; session revoke-other-devices action.
- **Implemented:** additive migrations `0005_password_reset_tokens` and `0006_totp_two_factor`; encrypted TOTP enrollment, replay protection, single-use hashed recovery codes and expiring hashed pending challenges.
- **Implemented:** 2FA step-up for email/password login, email verification completion, and Google OAuth callback. No authenticated session is issued until challenge validation; challenge consumes atomically before fresh session creation.
- **Implemented:** HMAC double-submit CSRF in addition to Origin validation for mutations; common `csrfFetch` client helper across auth/account/session/2FA/cart/checkout; account-security UI localized AR/EN and styled for RTL/LTR and theme variants.
- **Verification:** see Wave 2B entry in `docs/VERIFICATION-LOG.md`. Local typecheck, lint, build, test suite, diff check and header scan recorded there. The complete suite has skipped PostgreSQL-only tests because `TEST_DATABASE_URL` was not provided; PGlite migration/lifecycle checks pass.
- **Status:** implementation and requested local gates are complete. Real PostgreSQL, browser, SMTP and Google OAuth end-to-end verification remain NOT RUN (B-02); do not interpret this entry as production validation or as closure of other tracker scopes, the truncated route matrix, or the broader security backlog.

## Wave 3A — checkout integrity and encrypted fulfillment (2026-11-25)

**Branch:** `arena/9dd6dc80-web-stor` · no production payment, database, or fulfillment services contacted.

- **Implemented:** transactional checkout with row locks, server-owned current prices/stock, bounded integer-cent totals, unique user/cart-scoped HMAC idempotency, and a direct production guard in the demo-order function. The demo wallet remains an explicit zero and demo orders remain unpaid: no wallet balance or payment ledger is invented.
- **Implemented:** additive `0007_encrypted_fulfillment_vault` schema and AES-256-GCM inventory envelope; product-specific targets are normalized at cart input and revalidated/snapshotted at checkout. Account order history does not select plaintext delivery codes; reveal is authenticated, owner-scoped, CSRF/rate limited, one-time, no-store, audited, and presented through bilingual reveal/copy UI.
- **Verification:** local typecheck, lint, full test suite, production build, header scan and `git diff --check` passed; see Wave 3A in `docs/VERIFICATION-LOG.md`. Six PostgreSQL-only tests skipped locally because `TEST_DATABASE_URL` was not provided; the pushed GitHub Actions quality run passed its PostgreSQL integration step and all 13 Playwright header tests. Production payment and fulfillment checks remain environment-dependent and are not represented as completed.
- **Detailed control record:** `docs/security/S-23.md`.

## Wave 3B — wallet ledger, signed top-ups, wallet checkout, and promos (2026-11-25)

**Branch:** `arena/4ece4182-web-stor` · no production database, payment provider, or real funds used.

- Added additive migration `0008_wallet_ledger_and_promos` and aligned Drizzle schema, runtime migration requirements, and PGlite migration history. Wallet ledger rows are positive integer-cent entries with one-way database immutability guard and unique idempotency keys.
- Added signed top-up webhook with dedicated production secret, bounded raw-body HMAC-SHA256 verification, timing-safe comparison, five-minute replay window, atomic event idempotency, and machine audit events.
- Added real authenticated wallet balance and paginated ledger history; wallet checkout now uses wallet row serialization, sufficient-funds guard, paid-order/fulfillment allocation, stock decrement and a debit ledger entry inside one transaction. Demo checkout remains non-production and unpaid.
- Added normalized promo validation, integer-cent discounts, CSRF/rate limits, checkout-time locked revalidation and atomic redemption; active public codes appear on Offers. The checkout retains existing form selectors and adds bilingual promo/payment controls.
- **Verification:** see Wave 3B entry in `docs/VERIFICATION-LOG.md`; do not interpret local PGlite tests as production payment/provider validation.

## Wave 5A — adversarial auto-ban shield, web-admin elimination, hygiene and the owner CLI (2026-11-25)

**Branch:** `arena/15ceef45-web-stor` · no production database, proxy, payment provider, SMTP server or OAuth provider contacted.

- **Web admin eliminated.** `src/app/admin/page.tsx` is deleted and `src/proxy.ts` answers `/admin` and `/admin/**` with an unconditional `404` + `private, no-store, no-cache, must-revalidate` and an empty body for every visitor. Administration moved to a local-only owner CLI. `docs/security/S-13.md` and `docs/security/VULN-107.md` were rewritten: the old "404 for non-admins" wording no longer describes the code.
- **Two-tier threat shield.** Additive `0009_security_threat_shield` (`security_threat_events`, `security_bans`) mirrored in the Drizzle schema, the runtime migration requirements and the PGlite migration tests. Tier 1 (scanner paths, honeypot, CSRF forgery, prototype pollution, state tampering) bans immediately — 24 h, 7 d, then permanent for a trusted IP; a header fingerprint is capped at 24 h and is never permanent. Tier 2 (auth/2FA/reset/promo brute force) escalates 15 m → 2 h → 24 h and is never permanent.
- **Zero-collateral identity rules.** A ban can only exist for an attributable actor: a trusted IP (`TRUST_PROXY_IP_HEADERS=true`) or a salted fingerprint over the client's whole non-volatile header set. Unattributable requests are logged and never banned; a fingerprint ban is only enforced after 3 strikes and never against a request that looks like an ordinary browser; a ban lookup failure fails open for one request while the handler itself still fails closed. A 15 s per-actor write throttle stops a probe flood from forcing a database write per request.
- **Central enforcement.** Every mutating API route now runs `guardMutatingRequest()` (Origin + signed double-submit CSRF + active-ban check, one generic `403 REQUEST_REJECTED` with `private, no-store`); provider webhooks keep their HMAC path. Prototype-mutating JSON bodies are now rejected (400) and recorded instead of silently stripped.
- **Invisible honeypot.** A zero-pixel, off-screen, un-focusable, `aria-hidden`, `autoComplete="off"` field in the sign-in/sign-up, forgot-password and checkout forms. Trip → `403`, tier-1 ban and revocation of any active account session. No visual or selector change to the storefront.
- **Ephemeral hygiene.** `src/lib/db/hygiene.ts` purges expired OAuth states, expired/consumed reset tokens, expired/consumed 2FA challenges, ended bans, guest carts abandoned for 30 days and threat events older than 90 days — bounded per table, throttled to once an hour, run inside `after()`, callable on demand from the CLI.
- **Owner CLI.** `npm run ops` (`scripts/owner-ops.ts`) inspects audit/threat/ban activity, lists/creates/lifts IP and fingerprint bans, suspends an account, creates/toggles promo codes, inspects orders and issues idempotent ledger-credited refunds, and runs the hygiene pass. It refuses to run inside the web app and is never imported by `src/app/**`.
- **Verification:** see the Wave 5A entry in `docs/VERIFICATION-LOG.md` — typecheck, lint, `npm test` **167 tests / 161 passed / 0 failed / 6 skipped**, production build, `npm audit --omit=dev` **0**, header scan **ALL PASSED**, and live probes for `/admin` and every trap family. Real PostgreSQL, browser, proxy and provider checks remain NOT RUN locally (B-02); do not read this entry as production validation.
- **Detailed control record:** `docs/security/S-25.md`.

## Wave 5B — dual-role sellers, isolated merchant portal, vault v2, dispute escrow (2026-11-25)

**Branch:** `arena/8a1e76cc-web-stor` (from `main` @ `1ba06df`, PR #26) · local-only validation; no production systems, secrets or customer data used.

- **DONE — Vault v2:** per-record random DEK wrapped by an HKDF-SHA512 split-key KEK (`VAULT_MASTER_KEY` + optional `VAULT_KEY_PEPPER`), context-bound GCM AAD (`productId` + stock/order-item identity), keyed blind digest for duplicate-code rejection, `v1` read compatibility, fail-closed production env validation, buffer zeroing.
- **DONE — Burn-after-reveal:** `POST /api/account/orders/[orderId]/shred` erases ciphertext + wrapped DEK (constraint-enforced permanence) while keeping `delivery_digest`/timestamps; bilingual confirm action in `/account/orders`; owner `npm run ops -- vault rotate-keys` re-wraps v2 rows and upgrades v1.
- **DONE — Dual-role registration:** customer signup is still one step with zero extra fields (existing Playwright selectors unchanged); merchant signup collects store name/slug/bio/phone/country/terms and creates a linked `pending` seller profile atomically. Existing customers (incl. Google-only) apply at `/seller`.
- **DONE — Isolated merchant portal:** `/seller` + `/api/seller/**`, all queries scoped by the session's own `seller.id` (anti-BOLA/anti-IDOR), `Cache-Control: private, no-store`, bilingual readiness checklist, three-gate server enforcement (email verified + TOTP 2FA + owner approval) returning `403` before any live publish or stock import, own-listing create/toggle, batch stock import (`v2` envelopes + digest rejection), sales summary with 10% commission, escrow and payout-eligible balances.
- **DONE — Disputes + escrow freeze + owner CLI:** additive `0010` migration (`order_disputes`, one-open-dispute partial unique index, seller payout block columns, `products.seller_id/is_active`), buyer dispute endpoint with ownership/status/rate-limit checks, immediate derived escrow freeze in `payout-policy.ts`, and `npm run ops -- sellers list|approve|suspend`, `disputes list|resolve --action=refund|reject`, `vault rotate-keys` (atomic idempotent `wallet_ledger` `credit_refund` + permanent seller payout block).
- **UNCHANGED RED LINE:** `/admin` and `/admin/**` still answer an unconditional `404` with `private, no-store` and an empty body; no web admin exists.
- **Verification:** `npm run typecheck`, `npm run lint`, `npm test` (187 passed / 0 failed / 6 PostgreSQL-only skipped), `npm run build` (adds `/seller` and 5 `/api/seller/**` handlers), header scan **ALL HEADER CHECKS PASSED**, live `/admin` → `404` no-store, `/seller` → `307` no-store, `/api/seller/summary` → `401` no-store. Details: `docs/VERIFICATION-LOG.md`; design and threat model: `docs/security/S-26.md`.
- **NOT RUN:** real PostgreSQL integration (no disposable `TEST_DATABASE_URL` here — the six PostgreSQL-only tests are skipped), Playwright browser pass for the new merchant/buyer pages, real payout provider and real payment settlement.

## Wave 6 — Amazon-plus storefront, Seller Central & Account Command dashboards (2026-11-25)

**Branch:** `arena/2600e3ef-web-stor` (from `main` @ `01579bc`, PR #27) · presentation + interaction only; no migration, no new dependency, no new secret. Design notes: `docs/design/W-6-amazon-plus-ui.md`.

- **DONE — Two-tier command header:** primary bar (brand, omnibox, wallet chip + "+", Account Hub, cart with animated badge, theme/language, drawer) plus an ecosystem sub-rail (categories, deals, support, **Seller Central**). Phones intentionally keep one row (toggles move into the drawer) so the guarded 320px zero-overflow test still holds.
- **DONE — Instant omnibox:** opens on click / `/` / ⌘K, fetches the new public read-only `GET /api/catalog/omnibox` once and filters **client-side**; ArrowUp/Down/Enter/Escape; ARIA combobox/listbox; prices and categories in the result rows; portalled to `<body>`.
- **DONE — Bento storefront & buy box:** hero spotlight + three quick-action bento cards, trust architecture bar, wrapped category pills, two merchandising rows; Amazon-grade product cards (category, verified/official badge, instant-delivery ribbon, integer price, sibling quick-add); product page with a desktop sticky buy box, explicit Player UID / activation-email / region guidance and mobile-first actions.
- **DONE — Seller Central:** five-tile executive KPI ribbon (gross, payout-eligible, escrow, 10% commission, active sealed vault codes via a tenant-scoped count), three-step security readiness tracker wired to the same `SELLER_GATE_KEYS` the API enforces, and a tabbed workspace (listings / vault stock / performance).
- **DONE — Account Command Hub:** command tile grid (orders & vault, wallet, security, devices, seller), order status badges, sealed→unsealed vault card with copy confirmation, guarded shred + dispute panel, wallet balance hero and a colour-coded immutable ledger.
- **DONE — Motion system:** CSS-only `stagger`/`enter-*`/`tactile`/`sheen-edge`/`badge-pop`/`vault-unseal`/`rail-scroll`/`kpi-tile` utilities animating only opacity+transform, no library, no CDN, no inline style, fully neutralised under `prefers-reduced-motion`.
- **DONE — 4 form factors + RTL law:** `shell` container (1280→1408px), phone `overflow-x: clip`, 44px `tap` targets, explicit 640/1024/1440 steps and `letter-spacing: normal !important` for every tracked class under `[dir="rtl"]`.
- **UNCHANGED RED LINE:** `/admin` is still an unconditional `404` with `private, no-store`; `/seller` stays private; rate limits, the central CSRF/ban guard, v2 split-key vault crypto, honeypots and one-step buyer flows are untouched; the only new route is a GET.
- **Verification:** `npm run typecheck`, `npm run lint`, `npm test` (**205 tests: 199 passed, 0 failed, 6 PostgreSQL-only skipped** — 12 of them new in `tests/wave6.test.ts`), `npm run build`, header scan **ALL HEADER CHECKS PASSED**, live `/admin` → `404` no-store, `/seller` → `307` no-store. Details: `docs/VERIFICATION-LOG.md`.
- **NOT RUN:** Playwright locally (no browser binary / download route in this sandbox) — the 320px overflow guard, drawer behaviour and the screenshot matrix run in the CI `quality` job; light-theme contrast review of the new tiles still needs a human look at `docs/evidence/dawn-*.png`.


## Wave 6.1 — deployment hardening after the Preview failure (S-28, 2026-11-25)

**Branch:** `arena/6c9fed01-web-stor` (from `main` @ `1161e65`). Runbook: `docs/deployment/VERCEL.md`.

- **Evidence first.** GitHub commit statuses for the last 40 commits show every Vercel **failure resolving in 1–3 s** and every **success taking 20–35 s**; `main`/Production deployments (including `1161e65` and `01579bc`, 35–39 s) all succeed, and the failing runs are Preview deployments only. A 1 s failure is returned before `next build` ever runs.
- **Reproduced the whole lifecycle locally.** `git archive HEAD` → `npm ci --include=dev` → `NODE_ENV=production VERCEL=1 VERCEL_ENV=preview npm run build` with **zero secrets** in the environment exits 0 in 18 s and prints the full route table. Neither `NEXT_PHASE` deferral, peer dependencies, the Node version nor the build command can be the cause.
- **Root cause class.** Deployment-creation-time (Vercel-side) failure for the Preview target: integration/resource provisioning, plan quota, an "Ignored Build Step", or a project-level install override. Documented with a 7-step dashboard checklist instead of guessed code changes.
- **DONE — deferred validation made explicit.** `assertValidEnv()` is now a no-op under `NEXT_PHASE=phase-production-build` (new exported `isBuildPhase()`); `validateEnv()` stays pure and unchanged; `instrumentation.register()` short-circuits before touching the environment. Runtime still fails closed on every server start — no insecure fallback secret was introduced anywhere.
- **DONE — install/build commands pinned in the repo.** New `vercel.json` (`installCommand: npm ci --include=dev`, `buildCommand: npm run build`). Tailwind, PostCSS and TypeScript are `devDependencies`; a project-level `--omit=dev`/`NPM_CONFIG_PRODUCTION=true` override fails in ~2.5 s at the first CSS import — the same shape as the observed outage — and is now impossible.
- **DONE — runtime pinned.** `package.json` → `"engines": { "node": "22.x" }`, matching the CI major.
- **DONE — migration readiness documented and tested.** `npm run db:migrate` stays an explicit, guarded (`ALLOW_REMOTE_MIGRATION`, `ALLOW_PRODUCTION_MIGRATION` + `CONFIRM_PRODUCTION_BACKUP`, `--dry-run`), idempotent step over `0000…0010`; neither the build nor the startup hook can run it.
- **DONE — regression suite.** `tests/vercel-deployment.test.ts` (13 tests): build-phase no-op vs runtime fail-closed, pure-rule parity, "no fallback secret" source assertions, hook ordering, `vercel.json` shape and command values, devDependency coverage, Node-pin == CI, DB-free static routes + `force-dynamic` data routes, guarded/idempotent migration contract with all 11 SQL files present, and a secret-free runbook that still names every variable.
- **Verification:** `npm run typecheck`, `npm run lint`, `npm test` **218 tests: 212 passed, 0 failed, 6 PostgreSQL-only skipped**, `npm run build`, Vercel-simulated clean build (exit 0, 18 s, no env), header scan **ALL HEADER CHECKS PASSED**.
- **NOT RUN:** a real Vercel deployment (no Vercel token in this sandbox: `api.vercel.com` is unreachable and `npx vercel inspect` cannot authenticate), so the dashboard steps remain for the owner to execute; Playwright and real PostgreSQL run in CI.
