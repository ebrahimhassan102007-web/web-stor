# VULN-001 - Reflected XSS

**Status:** VERIFIED (probe/test run on local instance, 2026-10-26)

**Probe/evidence:** curl /products?q=<script>alert(1)</script> -> raw payload count 0 in HTML (React escaping).

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
