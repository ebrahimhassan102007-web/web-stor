# VULN-066 - Mail relay abuse

**Status:** CLOSED by code review with grep/structural evidence (see below)

**Probe/evidence:** Mail only sends verification codes to the registering address; no user-controlled recipients/body.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
