# VULN-107 - 404 vs 403 admin timing

**Status:** SUPERSEDED by S-25 (2026-11-25) — the web admin surface no longer exists.

**Original probe/evidence:** /admin returned 404 for signed-out (live, 2026-10-26). Timing equality NOT measured.

**Resolution (S-25):** `src/app/admin/page.tsx` was deleted and `src/proxy.ts` now answers `404` with `private, no-store, no-cache, must-revalidate` and an empty body for `/admin` and `/admin/**` **for everyone** — signed out, signed in, customer or admin. There is no longer a branch that could differ in status or timing between an authorized and an unauthorized visitor, and administration is local-only (`npm run ops`).

**Probe (2026-11-25, local only):** live `next start` returned `404` + `private, no-store, no-cache, must-revalidate` for `/admin` and `/admin/users`; the proxy is also driven directly in `tests/threat-shield-db.test.ts` (empty body, CSP present).
