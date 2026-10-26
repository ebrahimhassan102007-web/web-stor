# VULN-088 - Bidi spoofing

**Status:** PARTIAL

**Probe/evidence:** cleanText rejects control chars but not bidi override codepoints (U+202A-202E). Residual risk logged.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
