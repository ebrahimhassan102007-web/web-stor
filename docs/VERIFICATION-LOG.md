# Verification Log

All 2026-10-26 commands below ran in `/home/user/web-stor` on branch
`arena/a703a62a-web-stor`. Local instance only; no production contact.
Anything not executed is written as NOT RUN.

## Quality gates

| Check | Command | Actual result |
|---|---|---|
| Install | `npm ci --ignore-scripts` | Exit 0 |
| Lint | `npm run lint` | Exit 0 |
| Typecheck | `npm run typecheck` | Exit 0 |
| Unit/integration tests | `npm test` | **69 pass, 0 fail, 6 skipped** (75 total). Skipped = real-PostgreSQL tests requiring `TEST_DATABASE_URL` (run in CI). New: `tests/hardening.test.ts` (12 tests), S-11 checkout cases, updated migration expectations for 0003. |
| Production build | `npm run build` | Exit 0; route table includes `/api/auth/sessions`, `/robots.txt`, `/sitemap.xml`, `ƒ Proxy (Middleware)` (nonce CSP). |
| Prod dependency audit | `npm audit --omit=dev` | **0 vulnerabilities** (after `@playwright/test` bump to ^1.64.1). |
| Full audit | `npm audit` | Dev-only moderate findings remain in drizzle-kit/esbuild chain (build-time tooling). Recorded in S-14. |
| Signature audit | `npm audit signatures` | **NOT RUN to completion** — network error in sandbox. Wired into CI as report-only. |

## Live local probes (dev server, localhost:3000)

| Probe | Result |
|---|---|
| `node scripts/scan-headers.mjs http://localhost:3000` (/, /login, /account, /products) | **ALL HEADER CHECKS PASSED** — nonce CSP, strict-dynamic, frame-ancestors none, object-src none, no script unsafe-inline, nosniff/DENY/COOP/CORP, no-store on personal pages |
| Header SSR HTML contains add-funds link | `data-testid="header-add-funds" … href="/login?next=%2Faccount%2Fwallet"` (signed-out default) |
| Reflected XSS `/products?q=<script>alert(1)</script>` | Raw payload occurrences in HTML: **0** |
| Open redirect `/login?next=https://evil.example.com` | HTTP 200, no external `Location` |
| `/.env`, `/.git/config`, `/drizzle/meta/_journal.json` | 404 / 404 / 404 |
| `GET /admin` signed-out | **404** (was login redirect before S-13 fix) |
| `/.well-known/security.txt`, `/robots.txt`, `/sitemap.xml` | 200 / 200 / 200 |
| `POST /api/cart/items` 20 KB JSON body | **413** |
| `POST /api/cart/items` `Content-Type: text/plain` | **415** |
| `POST /api/cart/items` with `Origin: https://evil.example.com` | **403** |
| `grep -rn dangerouslySetInnerHTML src/` | 0 matches |
| `grep -rn NEXT_PUBLIC src/` | 0 matches |

## Fail-closed boot proof (S-17)

`npm run start` (production) without env **refused to start**:

```
Invalid environment configuration:
- SESSION_SECRET must be set to at least 32 characters in production
- AUTH_SECRET must be set to at least 32 characters in production
- DATABASE_URL must be set in production
- APP_ORIGIN must be set in production
```

## NOT RUN (explicit)

- **Playwright browser tests**: could not run *in this sandbox* (no browser
  binary; CDNs/apt unreachable), so they were executed in GitHub CI instead.
  Result: **9 passed** (run 40363824136 on PR #11) — P0-1 drawer visibility/
  focus/scroll-lock/Escape at 320×640, 360×740, 1280×800 in `ar`+`en`; P0-2
  signed-out "+" → `/login?next=%2Faccount%2Fwallet`, accessible names and
  ≥44px targets in both languages; no horizontal scroll at 320px (after a
  real 24px header overflow was found by this test and fixed in 234e292).
  Screenshot files are written to `docs/evidence/` inside the CI workspace
  and discarded; commit them by running `npm run test:e2e` locally once.
  Signed-in chip flow and light/dark theme matrix remain NOT RUN in a
  browser (need seeded account + more spec cases).
- Real-PostgreSQL test files (6 skipped above) and `npm run db:migrate`
  against a live server: NOT RUN locally (no Postgres in sandbox; CI runs
  them against its postgres:16 service). Migrations verified on embedded
  PGlite instead.
- Google OAuth / SMTP end-to-end: NOT RUN (no real credentials; never faked).
- Lighthouse/Core Web Vitals, screen-reader passes, 200%-zoom checks:
  NOT RUN (no browser). See route-matrix status in MASTER tracker.

## Follow-up verification — 2026-11-25 (`arena/bed7992c-web-stor`)

Local repository checks only. No production services were contacted.

| Check | Command | Result |
|---|---|---|
| Install | `npm ci --ignore-scripts` | Exit 0; 408 packages installed. npm reports 12 moderate advisories; none high/critical. |
| Unit/integration suite | `npm test` | **111 pass, 0 fail, 6 skipped**. Skipped tests require `TEST_DATABASE_URL`. Includes new JSON nesting/prototype-key and Unicode normalization tests. |
| Typecheck | `npm run typecheck` | Exit 0 |
| Lint | `npm run lint` | Exit 0 |
| Production build | `npm run build` | Exit 0 on Next.js 16.4.2; route table includes `ƒ Proxy (Middleware)`. |
| High-severity dependency gate | `npm audit --audit-level=high` | Exit 0. **12 moderate advisories remain** (Next.js, minimatch, esbuild chain); this is not a zero-advisory audit. |
| Header scan | `node scripts/scan-headers.mjs http://localhost:3000` | ALL HEADER CHECKS PASSED on the local dev server. |
| API cache probe | `GET /api/auth/session` local | 200; `Cache-Control: private, no-store, no-cache, must-revalidate`; `Vary` includes `Cookie`. |
| Playwright | `npm run test:e2e` | Attempted; blocked before browser launch because the standalone production web server failed its fail-closed startup checks (no `SESSION_SECRET`, `AUTH_SECRET`, or `DATABASE_URL`). Command timed out while Playwright retried; browser suite result is NOT RUN. |
| Real PostgreSQL / auth E2E / OAuth | — | NOT RUN; no PostgreSQL credentials, SMTP, or Google credentials supplied. |

## Wave 2B verification — 2026-11-25 (`arena/9dd6dc80-web-stor`)

Local repository checks only. No production DB, SMTP provider, Google OAuth account, or browser was contacted.

| Check | Command | Actual result |
|---|---|---|
| Typecheck | `npm run typecheck` | Exit 0 |
| Lint | `npm run lint` | Exit 0, no warnings |
| Full test suite | `npm test` | **116 passed, 0 failed, 6 skipped** (122 total). Six skips are real-PostgreSQL cases because `TEST_DATABASE_URL` was not set. PGlite migration/TOTP lifecycle and route/CSRF checks passed. |
| Production build | `npm run build` | Exit 0; Next.js 16.4.2 build and route generation completed. |
| Security headers | `node scripts/scan-headers.mjs http://localhost:3000` | **ALL HEADER CHECKS PASSED** for `/`, `/login`, `/account`, `/products` on the locally started dev server. |
| Whitespace/conflict check | `git diff --check` | Exit 0 |
| Dependency gate | `npm audit --audit-level=high` | Exit 0 at the high-severity threshold; **12 moderate advisories remain** (Next.js and development-tool dependency chains), so this is not a clean zero-advisory audit. |
| Real PostgreSQL / browser / OAuth / SMTP | — | NOT RUN. The environment had no disposable test DB URL or test provider credentials; browser execution was not attempted. |

No production database or service was contacted. The guarded migrations were applied only in the PGlite integration harness. Outstanding environment-dependent validation is tracked in `docs/BLOCKED.md` B-02/B-05.

## Wave 3A verification — 2026-11-25 (`arena/9dd6dc80-web-stor`)

Local repository checks only. No production database, payment provider, SMTP, or customer fulfillment codes were used.

| Check | Command | Actual result |
|---|---|---|
| Typecheck | `npm run typecheck` | Exit 0 |
| Lint | `npm run lint` | Exit 0, no warnings |
| Full test suite | `npm test` | Local: **124 passed, 0 failed, 6 skipped** (130 total; six require `TEST_DATABASE_URL`). The pushed GitHub Actions quality run `45592512039` passed its PostgreSQL integration step and the complete workflow. |
| Production build | `npm run build` | Exit 0 on Next.js 16.4.6; includes `/api/account/orders/[orderId]/reveal` and `/account/orders`. |
| Production dependency audit | `npm audit --omit=dev` | Exit 0; **0 production vulnerabilities** after the Next.js patch update. |
| Security header scan | `node scripts/scan-headers.mjs http://localhost:3000` | **ALL HEADER CHECKS PASSED** on the local dev server for `/`, `/login`, `/account`, and `/products`. |
| Whitespace check | `git diff --check` | Exit 0 |

Focused tests also cover target normalization/rejection, AES-256-GCM tamper detection, integer-cent bounds, account-scoped idempotency digest behavior, direct production demo-order refusal, and the documented zero-balance demo wallet. The demo wallet has no ledger or spendable balance; preview checkout remains explicitly unpaid and does not pretend to perform an insufficient-funds debit. GitHub Actions run `45592512039` passed both PostgreSQL integration and the Playwright header suite (**13 passed**). Local browser execution and production payment/fulfillment remain NOT RUN; successful CI does not imply production service validation.

## Wave 3B verification — 2026-11-25 (`arena/4ece4182-web-stor`)

Local repository checks only. No production database, payment provider, real top-up, or real fulfillment operation was used.

| Check | Command | Result |
|---|---|---|
| Install | `npm ci --ignore-scripts` | Exit 0; 408 packages installed. npm reported 11 moderate advisories. |
| Typecheck | `npm run typecheck` | Exit 0. Rechecked after the last wallet cart cleanup. |
| Lint | `npm run lint` | Exit 0. Rechecked after the last wallet cart cleanup. |
| Full test suite | `npm test` | **129 passed, 0 failed, 6 skipped** (135 total). Six PostgreSQL tests require a disposable `TEST_DATABASE_URL`; PGlite migration/ledger invariant tests passed. |
| Production build | `npm run build` | Exit 0; generated wallet, promo-validation, and wallet-webhook routes. |
| Header scan | `node scripts/scan-headers.mjs http://localhost:3000` | **ALL HEADER CHECKS PASSED** for `/`, `/login`, `/account`, and `/products`; private account cache policy checked. |
| Whitespace check | `git diff --check` | Exit 0 after final code edits. |
| Focused follow-up | typecheck + lint + `tests/wave3a.test.ts`, `tests/schema-migration.test.ts`, `tests/wallet-promo.test.ts` | **14 passed, 0 failed** after the last wallet cart cleanup. |
| GitHub Actions | Quality run `45598810912` | **Passed**, including clean PostgreSQL migration/integration, production build, audits, and **13 Playwright header tests**. The earlier run `45597628358` failed only because the new production webhook secret was not configured in Playwright; CI now supplies a clearly non-production test secret. |

Coverage includes duplicate checkout idempotency (existing demo integration test), PGlite ledger idempotency/nonnegative balance/immutability, promo arithmetic and redemption limit rules, wallet insufficient-balance rules, and webhook signature/replay-window behavior. Six real-PostgreSQL cases were skipped because no disposable test database was configured. Real webhook sender integration, production secret management/rotation, and real-money payment settlement remain NOT RUN.

## Security audit verification — 2026-11-25 (`arena/ac3a149c-web-stor`)

White-box audit of the whole repository plus a local production build. No production database, payment provider, SMTP, OAuth exchange, or customer data was used; the only sockets opened were loopback connections that were deliberately refused (port 1) to prove fail-closed behaviour.

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm ci` | Exit 0; 408 packages; npm reported 11 moderate advisories (dev tooling only). |
| Typecheck | `npm run typecheck` | Exit 0. |
| Lint | `npm run lint` | Exit 0, no warnings. |
| Full test suite | `npm test` | **147 tests: 141 passed, 0 failed, 6 skipped** (135 before the audit + 12 new security regression tests). The six skipped tests require a disposable `TEST_DATABASE_URL`. |
| Production build | `npm run build` | Exit 0 on Next.js 16.4.6; 27 API route handlers emitted. |
| Production dependency audit | `npm audit --omit=dev` | **0 vulnerabilities.** |
| Full dependency audit | `npm audit --audit-level=high` | Exit 0; no high/critical. 11 moderate advisories remain in dev-only chains (`drizzle-kit`/`esbuild` via `@esbuild-kit`, `minimatch` via eslint tooling). |
| Header scan (production build) | `node scripts/scan-headers.mjs http://localhost:3100` | **ALL HEADER CHECKS PASSED** for `/`, `/login`, `/account`, `/products`, including nonce CSP, `strict-dynamic`, `frame-ancestors 'none'`, no script `unsafe-inline`/`unsafe-eval`, and `no-store` on private pages. |
| Boot validation | `next start` missing production secrets | Server **refused to boot** and listed every missing variable without printing values (S-17). |
| Live: CSRF | `POST /api/auth/email/reset` without a token / with a foreign Origin | **403** in both cases. |
| Live: wallet webhook | `POST /api/webhooks/wallet-topup` unsigned | **401** + `cache-control: no-store`; oversized body → **413**. |
| Live: authorization surfaces | `GET /admin`, `GET /api/auth/session`, `PUT /api/cart`, `POST /api/checkout` | **404** (no existence disclosure), `{"authenticated":false}`, **405**, **503 CHECKOUT_DISABLED**. |
| Fail-closed probes | `tests/support/auth-rate-limit-probe.ts`, `password-reset-probe.ts`, `log-safety-probe.ts` | Each runs the real module in a child process with `server-only` stubbed and a no-network tripwire: rate limiting **rejects** when no bucket can be taken; malformed reset tokens are rejected **without** any connection attempt; unexpected failures log only `{ name, code }`. |
| Negative controls | Revert SEC-01 fallback / SEC-03 redeemer key | The corresponding regression tests **fail** on the old code and pass on the fixed code. |
| Real PostgreSQL / browser / OAuth / SMTP | — | **NOT RUN.** No disposable PostgreSQL URL, browser run, or provider credentials in this environment; the equivalent integration tests execute in CI against PostgreSQL 16 and Playwright. |

Findings, fixes, per-category results and remaining risks: `docs/security/AUDIT-2026-11-25.md` (SEC-01…SEC-04 → `docs/security/VULN-119.md` … `VULN-122.md`).

## Wave 5A — auto-ban shield, web-admin elimination, hygiene, owner CLI — 2026-11-25 (`arena/15ceef45-web-stor`)

Local-only verification of `docs/security/S-25.md`. No production database, proxy, payment provider, SMTP server or OAuth provider was contacted; the only sockets opened were loopback connections that were deliberately refused (port 1 and a closed 5432) to prove the fail-closed paths.

| Check | Command | Result |
| --- | --- | --- |
| Migration apply (real engine) | `npx tsx --test tests/migration-runner.test.ts` | **5/5 pass.** `0009_security_threat_shield` applies, is idempotent, and the second run reports 10 unchanged migrations. |
| Schema history (real engine) | `npx tsx --test tests/schema-migration.test.ts` | **2/2 pass**; the exact public table list now includes `security_bans` and `security_threat_events`. |
| Shield behaviour (PGlite, real modules) | `npx tsx --test tests/threat-shield-db.test.ts` | **2/2 pass.** A scanner hit bans a trusted IP for 24 h and the next request is blocked; 7 d → permanent; a bystander IP is untouched; tier-2 ladder 15 m → 2 h → 24 h then auto-expiry; untrusted headers never become an IP, never collide with the IP ban, block nobody on strike 1, and never block a different client; an anonymous request is logged and never banned; the same actor is written at most once per 15 s. |
| Proxy behaviour (no database at all) | same file | The real proxy function returns `404` with `private, no-store, no-cache, must-revalidate`, an **empty body** and a CSP for `/admin`, `/admin/users`, `/.env`, `/.git/config`, `/wp-admin/setup.php`, `/wp-login.php`, `/phpmyadmin/index.php`, `/cgi-bin/exec`, `/actuator/env`; `/`, a product page, `/account` and `/administrator-guide` are unchanged. |
| Pure policy + wiring | `npx tsx --test tests/threat-shield.test.ts` | **16/16 pass** (path classification, ban ladders, no weakening, enforcement rules, actor identity, honeypot markup/validation, prototype-pollution rejection, central guard on every mutating route, CLI isolation). |
| Hygiene (PGlite) | `npx tsx --test tests/ephemeral-hygiene.test.ts` | **2/2 pass.** Exact purge counts (1 OAuth state, 2 reset tokens, 1 pending 2FA, 2 ended bans, 1 abandoned cart, 1 old threat event), the intended rows survive, orders/wallet ledger/accounts/sessions/promos/users unchanged, second run is a no-op, `maxRowsPerRun` honoured. |
| Typecheck | `npm run typecheck` | Exit 0. |
| Lint | `npm run lint` | Exit 0, no warnings. |
| Full test suite | `npm test` | **167 tests: 161 passed, 0 failed, 6 skipped** (147 before this wave + 20 new tests). The six skipped tests require a disposable `TEST_DATABASE_URL`. |
| Production build | `npm run build` | Exit 0 on Next.js 16.4.6; no warnings; 27 route handlers; the route table no longer contains `/admin`. |
| Production dependency audit | `npm audit --omit=dev` | **0 vulnerabilities.** |
| Header scan (production build) | `node scripts/scan-headers.mjs http://localhost:3100` | **ALL HEADER CHECKS PASSED.** |
| Live: admin elimination | `curl /admin`, `/admin/users` | **404**, `cache-control: private, no-store, no-cache, must-revalidate`, **0-byte body**. |
| Live: scanner traps | `curl /.env`, `/.git/config`, `/wp-admin`, `/wp-login.php`, `/phpmyadmin/index.php`, `/cgi-bin/x`, `/actuator/env` | **404** each, same private no-store header, **0-byte body**, with the database unreachable. |
| Live: storefront unchanged | `curl /account`, `/support-bot` | **200**; `/account` keeps `private, no-store`. |
| Live: central guard | `POST /api/cart/items` without Origin; `POST /api/auth/email/login` with a foreign Origin | **403** `REQUEST_REJECTED` in 48 ms / 16 ms, i.e. the guard fails closed instantly and does not hang when the database is unreachable. |
| Owner CLI | `npm run ops` | Prints the command surface; refuses web execution via the `NEXT_RUNTIME`/`window` guard (asserted by test). Remote commands were not exercised locally because no PostgreSQL instance is available. |
| Flaky test repaired | `npx tsx --test tests/wave2-security.test.ts` (5 consecutive runs) | The pre-existing TOTP-envelope tamper assertion edited the last base64url character, whose padding bits can decode to the same bytes; it now flips a decoded byte of the auth tag and of the ciphertext, so the check is deterministic. 3/3 pass every run. |
| Whitespace check | `git diff --check` | Exit 0. |
| Real PostgreSQL / browser / OAuth / SMTP / proxy | — | **NOT RUN.** No disposable PostgreSQL URL beyond PGlite, no browser run, and no provider credentials in this environment; the equivalent integration and Playwright checks execute in CI. |

## Wave 5B — dual-role sellers, merchant portal, split-key vault v2, dispute escrow — 2026-11-25 (`arena/8a1e76cc-web-stor`)

Local-only verification of `docs/security/S-26.md`. No production database, payment provider, SMTP server or OAuth provider was contacted; the only sockets opened were loopback connections deliberately refused (port 1) to prove the fail-closed paths.

| Check | Command | Result |
| --- | --- | --- |
| Migration apply (real engine) | `npx tsx --test tests/migration-runner.test.ts tests/schema-migration.test.ts` | **7/7 pass.** `0010_marketplace_sellers_disputes_and_vault_v2` applies on a fresh engine, the second run reports 11 unchanged migrations, and the exact public table list now includes `order_disputes`. |
| Vault v2 + disputes (PGlite, real modules) | `npx tsx --test tests/wave5b-db.test.ts` | **9/9 pass.** v2 rows store no plaintext; duplicate raw codes are rejected by the partial unique digest index (in-batch and across imports); allocation re-binds the AAD and a ciphertext moved to another buyer's order line fails GCM authentication; shred requires a prior reveal, refuses foreign owners, NULLs every payload column, keeps the delivery digest and is idempotent; the DB refuses to resurrect a shredded row; `rotate-keys` re-wraps v2 DEKs, upgrades a v1 row, writes nothing in `--dry-run`, is idempotent and refuses without the retired key; seller A cannot read/toggle/stock seller B's product (and the cross-tenant import writes zero vault rows); dispute → escrow freeze → refund writes exactly one `credit_refund` ledger row, credits the wallet once, cancels the order, permanently blocks the seller and is a no-op on replay; `reject` releases escrow and moves no money. |
| Pure policy + wiring | `npx tsx --test tests/wave5b.test.ts` | **17/17 pass** (split-key round-trip, pepper as a real second factor, AAD transplant rejection, tampered/foreign DEK rejection, rotation, blind digests, code normalization, fail-closed production env, customer-vs-merchant registration, slug normalization, integer-cent listings, three-gate policy `403`, escrow accounting, bilingual dispute copy, owner CLI surface, `/admin` elimination, no client-supplied seller id). |
| Central guard & proxy | `npx tsx --test tests/threat-shield-db.test.ts` | **2/2 pass.** The proxy still returns `404` + `private, no-store` with an empty body for `/admin` and scanner families, while `/seller` is reachable and uncacheable. |
| Typecheck | `npm run typecheck` | Exit 0. |
| Lint | `npm run lint` | Exit 0, no warnings. |
| Full test suite | `npm test` | **193 tests: 187 passed, 0 failed, 6 skipped** (167 before this wave + 26 new). The six skipped tests require a disposable `TEST_DATABASE_URL`. |
| Production build | `npm run build` | Exit 0 on Next.js 16.4.6; the route table adds `/seller` and `/api/seller/{apply,products,products/[productId],products/[productId]/stock,summary}`; `/admin` remains absent. |
| Header scan (production build) | `node scripts/scan-headers.mjs http://localhost:3100` | **ALL HEADER CHECKS PASSED** for `/`, `/login`, `/account`, `/products` (nonce CSP, `strict-dynamic`, `frame-ancestors 'none'`, `private, no-store` on private pages). |
| Live: admin elimination | `curl /admin`, `/admin/users` | **404**, `cache-control: private, no-store, no-cache, must-revalidate`, empty body. |
| Live: merchant portal isolation | `curl /seller`, `/api/seller/summary` | `/seller` → **307** to `/login?next=%2Fseller` with `private, no-store`; `/api/seller/summary` → **401** with `private, no-store`. |
| Live: central guard | `POST /api/seller/apply` without Origin | **403** `REQUEST_REJECTED`. |
| Whitespace check | `git diff --check` | Exit 0. |
| Real PostgreSQL / browser / payment provider | — | **NOT RUN.** No disposable PostgreSQL URL beyond PGlite, no browser run, and no provider credentials in this environment; the equivalent integration and Playwright checks execute in CI. |

## Wave 6 — Amazon-plus storefront, Seller Central & Account Command dashboards — 2026-11-25 (`arena/2600e3ef-web-stor`)

Presentation/interaction wave on top of PR #27. Local verification only: no production database, payment provider, SMTP server or OAuth provider was contacted. Design notes and trade-offs: `docs/design/W-6-amazon-plus-ui.md`.

| Check | Command | Result |
| --- | --- | --- |
| Wave-6 guard rails | `npx tsx --test tests/wave6.test.ts` | **12/12 pass.** The header's e2e contract (7 testids, portal, scroll lock, exactly 15 drawer destinations), the omnibox contract (single fetch, client filtering, 4 keys, combobox/listbox/option ARIA, `/` + ⌘K, typing guard, portal), `/admin` absence + proxy 404/private, `/seller` in `privatePrefixes`, no client-supplied seller scope, CSS-only motion with compositor-only keyframes and a complete reduced-motion block, the English-only tracking grant + RTL revocation, phone `overflow-x: clip` + 44px `tap`, the four responsive steps, zero animation/CDN dependencies, and Arabic/English key parity for all eight new namespaces. |
| Typecheck | `npm run typecheck` | Exit 0. |
| Lint | `npm run lint` | Exit 0, no warnings. |
| Full test suite | `npm test` | **205 tests: 199 passed, 0 failed, 6 skipped** (the six require a disposable `TEST_DATABASE_URL`). All 193 pre-existing assertions still pass untouched. |
| Production build | `npm run build` | Exit 0 on Next.js 16.4.6. Route table adds exactly one handler — `GET /api/catalog/omnibox` — and `/admin` is still absent. |
| Header scan (production build) | `node scripts/scan-headers.mjs http://localhost:3100` | **ALL HEADER CHECKS PASSED** on `/`, `/login`, `/account`, `/products` (nonce CSP, `strict-dynamic`, `frame-ancestors 'none'`, no `unsafe-inline`, `private, no-store` on private pages). |
| Live: admin elimination | `curl /admin`, `/admin/users` | **404**, `private, no-store, no-cache, must-revalidate`, empty body. |
| Live: merchant portal privacy | `curl /seller`, `/api/seller/summary` | `/seller` → **307** to `/login?next=%2Fseller`, `private, no-store`; `/api/seller/summary` → **401**, `private, no-store`. |
| Live: rendered markup (dev server, preview catalogue) | `curl /`, `/products` | **200.** Homepage contains the omnibox trigger, the ecosystem rail, the bento hero, the trust bar and both merchandising rows; product tiles carry the verified/official badge and the instant-delivery ribbon. |
| Compiled CSS spot-check | `grep` in `.next/static/chunks/*.css` | `.shell` (with its 640/1536px steps), `.rail-scroll`, `.stagger > *`, `.kpi-tile`, `.tactile`, `@media (max-width:639px){html{overflow-x:clip}}` and the Wave-6 reduced-motion block are all emitted. |
| Whitespace check | `git diff --check` | Exit 0. |
| Playwright / e2e (browser) | — | **NOT RUN locally**: no browser binary in this sandbox and the download CDN is unreachable. `e2e/header.spec.ts` and `e2e/visual.spec.ts` run unchanged in CI. |
| Real PostgreSQL / payment provider | — | **NOT RUN** here (no disposable `TEST_DATABASE_URL`); unchanged suites run in CI. |


## Wave 6.1 — deployment hardening (S-28) — 2026-11-25 (`arena/6c9fed01-web-stor`)

Diagnosis of the failed Preview deployments plus the repo-side hardening. No Vercel API token, no production system and no customer data was used. Runbook: `docs/deployment/VERCEL.md`.

| Check | Command | Result |
| --- | --- | --- |
| Failure timing (evidence) | `gh api .../commits/<sha>/statuses` × 40 commits | Every **failure = 1–3 s** (`b2859d0` 1 s, `08f8394` 1 s, `9b79b46` 1 s, `544658d` 1 s …); every **success = 20–35 s** (`1161e65` 39 s, `01579bc` 35 s, `c25a9db` 34 s, `8555d4b` 21 s). Failures are Preview-only; Production merges are all green. |
| Author hypothesis | statuses × `commit.author.email` | **Refuted:** the automation identity (`e76beb8`, agent@arena.ai) succeeded, and the owner's `users.noreply.github.com` identity both succeeded (`8555d4b`) and failed (`544658d`). |
| Vercel-only reproduction | `git archive HEAD` → `npm ci --include=dev` → `env -i … NODE_ENV=production VERCEL=1 VERCEL_ENV=preview npm run build` | **Exit 0 in 18 s**, full route table, no secrets in the environment. The repository builds under Vercel conditions. |
| Install without devDependencies | `env -i … NODE_ENV=production npm install` then `next build` | **Fails in ~2.5 s** at the first CSS import (Tailwind/PostCSS/TypeScript are `devDependencies`) — the latent trap `vercel.json` now closes. |
| Deployment guard rails | `npx tsx --test tests/vercel-deployment.test.ts` | **13/13 pass** (build-phase no-op vs runtime fail-closed, pure-rule parity, no fallback secrets, hook ordering, `vercel.json`, devDependency coverage, Node pin == CI, DB-free static routes, migration contract, secret-free runbook). |
| Typecheck | `npm run typecheck` | Exit 0. |
| Lint | `npm run lint` | Exit 0, no warnings. |
| Full test suite | `npm test` | **218 tests: 212 passed, 0 failed, 6 skipped** (the six require a disposable `TEST_DATABASE_URL`). |
| Production build | `npm run build` | Exit 0; route table unchanged (no new routes, `/admin` still absent). |
| Whitespace check | `git diff --check` | Exit 0. |
| Real Vercel dashboard / logs | — | **NOT RUN**: `api.vercel.com` is unreachable from this sandbox and no Vercel token is available, so `npx vercel inspect dpl_… --logs` cannot authenticate. The 7-step dashboard checklist in `docs/deployment/VERCEL.md` §4 remains for the owner. |
