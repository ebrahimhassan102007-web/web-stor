# VULN-012 - LIKE/ReDoS

**Status:** CLOSED by code review with grep/structural evidence (see below)

**Probe/evidence:** catalog escapes LIKE wildcards (backslash % _) and q is length-bounded by schema; no user regex.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
