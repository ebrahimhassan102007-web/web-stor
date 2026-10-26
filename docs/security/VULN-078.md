# VULN-078 - Verbose errors

**Status:** CLOSED by code review with grep/structural evidence (see below)

**Probe/evidence:** API errors are generic codes (http.ts); poweredByHeader false; stack traces server-side only.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
