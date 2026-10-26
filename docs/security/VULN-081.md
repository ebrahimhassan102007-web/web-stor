# VULN-081 - Clickjacking (login/wallet)

**Status:** VERIFIED (probe/test run on local instance, 2026-10-26)

**Probe/evidence:** Login + account pages carry frame-ancestors none + DENY (scanner).

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
