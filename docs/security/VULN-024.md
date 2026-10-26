# VULN-024 - X-Forwarded-* spoofing

**Status:** CLOSED by code review with grep/structural evidence (see below)

**Probe/evidence:** Forwarded proto/host ignored unless APP_ORIGIN set; see google-oauth getAppOrigin + S-03.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
