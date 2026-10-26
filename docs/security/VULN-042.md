# VULN-042 - Normalization collisions

**Status:** PARTIAL

**Probe/evidence:** Emails lowercased (zod + DB CHECK). Unicode NFKC/homoglyph normalization NOT implemented.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
