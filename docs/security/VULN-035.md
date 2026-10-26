# VULN-035 - Privileged-field mass assignment

**Status:** CLOSED by code review with grep/structural evidence (see below)

**Probe/evidence:** Register/update schemas contain no role/emailVerifiedAt/googleSub fields; role only settable via DB.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
