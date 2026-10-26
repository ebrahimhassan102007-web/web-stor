# Blocked Work and Required Inputs (updated 2026-10-26)

The previous blocker ("original specification unavailable") is **resolved**:
the owner supplied the full hardening program in this session, and the items
below replace it. Nothing here was silently dropped.

## B-01 — Browser execution unavailable in this sandbox (PARTIALLY RESOLVED via CI)
- **Impact:** no browser binary exists in the sandbox, so Playwright ran in GitHub CI instead: **9/9 passed** (PR #11, run 40363824136), covering P0-1/P0-2 at 320/360/1280 in AR+EN. Screenshots are generated in the CI workspace only.
- **Still blocked:** committed screenshot files in `docs/evidence`, signed-in wallet-chip browser flow, Lighthouse/CWV (G11), zoom/text-spacing (G21), screen-reader passes (G05/G07 depth), and the rest of the per-route visual matrix.
- **Next action:** run `npm run test:e2e` on a machine with a browser and commit `docs/evidence/*.png`; extend specs per route matrix once the full spec text (B-03) arrives.

## B-02 — No live PostgreSQL/SMTP/Google in this environment
- **Impact:** 6 real-Postgres tests skipped locally; auth two-account IDOR, Google linking round-trip, and email delivery not exercised end-to-end.
- **Next action:** CI runs the Postgres suite; owner provides disposable `*_test` DB + test SMTP/Google credentials for a full auth pass. Never production.

## B-03 — Specification message was truncated at item ~408
- **Impact:** The supplied program text ended mid-sentence at "[/account/orders] specific — status labels…". Sections 4 (rest), 5+ (if any) are unavailable, so items beyond 408 cannot be enumerated or counted honestly. Route-matrix items 119–408 were **not** individually executed this session (see tracker); P0 + S-01…S-20 + VULN-001…118 were prioritized and are fully accounted.
- **Next action:** owner resends the remainder; then execute the route matrix per page with browser evidence.

## B-04 — Owner decisions / external accounts needed
- `security.txt` contact + policy URL are `example.com` placeholders — owner must supply a real security contact before launch.
- S-18 CAPTCHA: needs Turnstile (owner site keys) or a PoW decision.
- S-09 `__Host-` cookie prefix + S-13 MFA: implement in a follow-up with production cookie/domain facts.
- VULN-093/095/115 (DB roles, sslmode, branch protection) are platform settings only the owner can apply.
- Contrast: small white-on-red text in dark theme (3.76:1) awaits owner's color decision (see CONTRAST-REPORT).

## B-05 — Database role for migrations
- Migration 0003 must run before deploying this code (`npm run db:migrate` with existing ALLOW_* guards). The app refuses to boot unconfigured in production by design (S-17).
