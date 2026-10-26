# VULN-079 - Sensitive file exposure

**Status:** VERIFIED (probe/test run on local instance, 2026-10-26)

**Probe/evidence:** /.env /.git/config /drizzle/meta -> 404 live.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
