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

- **Playwright browser tests / screenshots (`docs/evidence/menu-*.png`)**: NOT
  RUN in this sandbox. `npx playwright install chromium` failed (browser CDN
  unreachable); `@sparticuz/chromium` failed (`libnspr4.so` missing, apt has
  no network). Spec committed at `e2e/header.spec.ts` + CI job added; run
  `npm run test:e2e` where a browser exists. P0-1/P0-2 are covered meanwhile
  by structural tests in `tests/hardening.test.ts` and SSR/live probes above.
- Real-PostgreSQL test files (6 skipped above) and `npm run db:migrate`
  against a live server: NOT RUN locally (no Postgres in sandbox; CI runs
  them against its postgres:16 service). Migrations verified on embedded
  PGlite instead.
- Google OAuth / SMTP end-to-end: NOT RUN (no real credentials; never faked).
- Lighthouse/Core Web Vitals, screen-reader passes, 200%-zoom checks:
  NOT RUN (no browser). See route-matrix status in MASTER tracker.
