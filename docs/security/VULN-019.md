# VULN-019 - Open redirect

**Status:** VERIFIED (probe/test run on local instance, 2026-10-26)

**Probe/evidence:** curl /login?next=https://evil.example.com -> 200, no external redirect; safeReturnPath whitelists local paths (unit-tested in auth-core tests).

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
