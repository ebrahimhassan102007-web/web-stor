# VULN-016 - Path traversal

**Status:** VERIFIED (probe/test run on local instance, 2026-10-26)

**Probe/evidence:** curl /.env /.git/config /drizzle/meta/_journal.json -> 404.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
