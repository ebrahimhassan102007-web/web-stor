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
