# VULN-028 - Clickjacking

**Status:** VERIFIED (probe/test run on local instance, 2026-10-26)

**Probe/evidence:** frame-ancestors 'none' + X-Frame-Options DENY - scanner PASS.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
