# VULN-116 - Dev allowances in prod

**Status:** CLOSED by code review with grep/structural evidence (see below)

**Probe/evidence:** allowedDevOrigins only affects dev server; CHECKOUT demo also blocked by prod env validation.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
