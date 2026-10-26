# VULN-023 - Host header poisoning

**Status:** CLOSED by code review with grep/structural evidence (see below)

**Probe/evidence:** Email links/origins derive from APP_ORIGIN config, not Host header (getAppOrigin).

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
