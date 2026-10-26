# VULN-118 - Dependency outage behavior

**Status:** PARTIAL

**Probe/evidence:** SMTP/Google absence yields honest 'unavailable' states (existing). DB-down fails closed on APIs; catalogue preview is read-only labeled. Full outage drill NOT RUN.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
