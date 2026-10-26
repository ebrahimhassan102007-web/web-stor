# VULN-052 - Race conditions

**Status:** CLOSED by code review with grep/structural evidence (see below)

**Probe/evidence:** addToCartLine uses row locks + LEAST(qty+add, stock, 99) in one transaction (cart-operations).

Local instance only (dev server on localhost:3000, no production contact). Full command log: docs/VERIFICATION-LOG.md.
