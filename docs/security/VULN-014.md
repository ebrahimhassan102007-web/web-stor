# VULN-014 - Mass assignment (ORM)

**Status:** CLOSED by code review with grep/structural evidence (see below)

**Probe/evidence:** Explicit zod object schemas per route; unknown keys never spread into inserts.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
