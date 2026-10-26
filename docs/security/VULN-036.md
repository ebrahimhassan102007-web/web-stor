# VULN-036 - IDOR

**Status:** PARTIAL

**Probe/evidence:** Cart mutations scoped by signed cart cookie; orders by user_id (S-08); sessions by token hash. Two-account live test NOT RUN (needs DB+SMTP); PGlite behavior tests exist in suite (6 skipped without TEST_DATABASE_URL).

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
