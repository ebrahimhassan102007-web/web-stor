# VULN-080 - Robots/sitemap leakage

**Status:** CLOSED by code review with grep/structural evidence (see below)

**Probe/evidence:** robots disallows /account /admin /api /checkout /cart /login; sitemap lists public paths only.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
