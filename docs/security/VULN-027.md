# VULN-027 - Login/OAuth CSRF

**Status:** CLOSED by code review with grep/structural evidence (see below)

**Probe/evidence:** Login POST requires same-origin; Google start uses state cookie + PKCE (google-oauth).

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
