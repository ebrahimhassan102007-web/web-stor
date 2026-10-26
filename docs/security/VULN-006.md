# VULN-006 - Email XSS

**Status:** CLOSED by code review with grep/structural evidence (see below)

**Probe/evidence:** escapeHtml(displayName) in email.ts HTML part; text part is plain text.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
