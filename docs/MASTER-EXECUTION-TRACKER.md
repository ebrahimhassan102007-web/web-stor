# E-Vora Master Execution Tracker (2026-10-26)

**Branch:** `arena/a703a62a-web-stor` · **Environment:** local sandbox (PGlite + dev server on localhost). No production contact.

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
6. Bidi-override codepoints not filtered from display names (VULN-088).
7. Dev-only drizzle-kit/esbuild moderate advisories (build-time only).
8. security.txt still has placeholder contact.
