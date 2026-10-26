# VULN-032 - DNS rebinding (dev)

**Status:** CLOSED by code review with grep/structural evidence (see below)

**Probe/evidence:** allowedDevOrigins is dev-only Next config; production ignores it.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
