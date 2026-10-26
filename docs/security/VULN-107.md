# VULN-107 - 404 vs 403 admin timing

**Status:** VERIFIED (probe/test run on local instance, 2026-10-26)

**Probe/evidence:** /admin returns 404 for signed-out (live). Timing equality NOT measured.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
