# VULN-087 - Unicode/homograph

**Status:** PARTIAL

**Probe/evidence:** displayName is free text (homoglyph spoofing possible in UI); emails constrained by zod+lowercase. No confusable-detection.

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
