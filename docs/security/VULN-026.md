# VULN-026 - CSRF

**Status:** VERIFIED (probe/test run on local instance, 2026-10-26)

**Probe/evidence:** Cross-origin POST /api/cart/items -> 403 (verifySameOrigin on all mutations).

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
