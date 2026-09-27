# Security — خدمتك ستور | Khodmtak Store

This document describes the security posture, the audit performed while
building v2, and the regression process. Format for fixed issues follows the
project mandate: *Issue / Severity / Component / Root Cause / Fix /
Regression Test / Verification*.

## Threat-model principles

- The client is hostile: prices, totals, roles, payment status, stock and
  ownership are **always** recomputed or verified server-side.
- All SQL goes through Drizzle ORM (parameterized); no string-built queries.
- Every API input is Zod-validated with allowlists and bounded sizes.
- Client-facing errors are generic (Arabic); stack traces, SQL and secrets
  never leave the server. Structured logs never contain code values,
  passwords, session tokens or full card/phone data.

## Controls by category (§23–31 audit)

| Category | Control |
| --- | --- |
| SQL injection | Drizzle parameterized queries only; ids via Zod (`int`/regex allowlists); sort/filter fields mapped through allowlists in `src/lib/catalog.ts`. |
| XSS | React auto-escaping; no `dangerouslySetInnerHTML`; `safeText` Zod fields reject control characters; strict CSP (`object-src 'none'`, `base-uri 'self'`). |
| CSRF | Same-origin verification (`Origin`/`Sec-Fetch-Site`) on every state-changing route (`verifySameOrigin`), `SameSite=Lax` `HttpOnly` cookies. |
| IDOR | Order/cart/delivery access filtered by the session user id from the DB; foreign order numbers return 404; admin role read from the DB row, never the client. |
| Sessions | 256-bit random tokens, only the SHA-256 hash stored; `HttpOnly`+`Secure`(prod)+`SameSite=Lax`; expiry enforced in SQL; disabled accounts lose access on next request; logout destroys server-side. |
| Price manipulation | Cart lines store product ids only; unit prices, subtotals and totals are read from `products` inside the checkout transaction; hostile extra JSON keys are stripped by Zod/`validateCustomerInputs`. |
| Race conditions | Checkout runs in one transaction: `FOR UPDATE` product locks, guarded stock decrement, `FOR UPDATE SKIP LOCKED` code reservation; DB CHECK binds a SOLD code to exactly one order item. Verified by the concurrency test. |
| Replay / double webhook | `payment_events (provider, event_id)` UNIQUE; guarded `UNPAID → PAID` transition; duplicate confirms are no-ops. |
| Enumeration | Identical login error for unknown email vs wrong password; register does not reveal duplicates via timing-safe generic message; forgot-password always answers success. |
| Open redirect | `next` params restricted to same-origin relative paths (`/…`, no `//`, no `\`). |
| Path traversal / SSRF | No filesystem paths or outbound URLs are derived from user input; no upload feature (emoji icons by design). |
| Mass assignment | Zod `.strip()` semantics + explicit column lists on insert/update; `customerInputs` filtered to the per-type field allowlist. |
| Prototype pollution | No deep merges of user JSON; parsed bodies go straight into Zod schemas. |
| Headers | CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`; production adds HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`. |
| Rate limiting | Per-IP (and per-account for login) fixed-window limits on auth, cart, checkout, payment and admin routes; 429 with `Retry-After`. |
| Secrets | Digital codes encrypted at rest with AES-256-GCM under `INVENTORY_SECRET` (distinct from `SESSION_SECRET`); decrypted only for the verified order owner; never logged, never in admin listings. |

## Fixed findings (v2 examples)

**Issue:** Disabled accounts kept working sessions.
**Severity:** High. **Component:** `src/lib/security/auth.ts`.
**Root cause:** session lookup did not check `users.disabled`.
**Fix:** session join now requires `disabled = false`; login also rejects
disabled accounts with the generic error.
**Regression test:** covered by auth flow tests; manual verification via
disabled admin toggle.
**Verification:** disabled user's next request returns 401.

**Issue:** Payment confirmation could theoretically be replayed.
**Severity:** Critical. **Component:** payments pipeline.
**Root cause:** no event-level idempotency in early design.
**Fix:** `payment_events` UNIQUE(provider, event_id) + guarded state
transition inside a transaction.
**Regression test:** `security-integration.test.ts` (duplicate confirmation);
manual double-POST returns the same PAID response without re-fulfilling.
**Verification:** deliveries count unchanged after replay.

## Regression process (§41)

1. Every fixed vulnerability gets a test in `tests/` reproducing the attack.
2. `npm test` runs unit + integration suites; integration tests exercise the
   live HTTP surface (auth, race, IDOR, CSRF, rate limits).
3. CI gate: `tsc --noEmit`, `eslint`, `next build`, `vitest run` must pass
   before merge.

## Dependency audit status

`npm audit` (2026-09-27): 4 moderate advisories, all in `drizzle-kit`'s
**dev-only** transitive `esbuild` (<=0.24.2, GHSA-67mh-4wv8-2f99 — dev-server
request exposure). Not present in the production runtime bundle. Remediation
tracked: upgrade `drizzle-kit` when a compatible release lands.

## Reporting

Report suspected vulnerabilities privately to the repository owner. Do not
open public issues containing exploit details.
