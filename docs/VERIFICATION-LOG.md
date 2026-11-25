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
