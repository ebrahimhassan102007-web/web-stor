# E‑Vora admin dashboard — functional checks

## Safe test setup

- Used a temporary, in-memory PGlite database on loopback only.
- Applied the repository migrations to that disposable database and inserted synthetic accounts, products, order records, and session tokens for route testing.
- No real or shared database was accessed. The fixture and session token were stored outside the repository and are not part of this change.

## Route and interaction checks

| Check | Result |
| --- | --- |
| Dashboard overview, metric cards, chart, recent orders, and stock alerts | **PASS** — data rendered from the temporary database. |
| Orders search and status filter | **PASS** — the requested order appeared and unrelated/cancelled records were filtered out. |
| Product stock filters | **PASS** — low-stock and out-of-stock filters returned the expected separate products. |
| Customer search and order summary | **PASS** — name/email search and the recorded order summary rendered. |
| Analytics date range and product ranking | **PASS** — the selected range, chart, aggregate, and ranking rendered. |
| Creative Studio and copy actions | **PASS** — campaign drafts, headline text, and copy buttons rendered. |
| Order detail route | **PASS** — localized item names, customer summary, status, and recorded totals rendered. |
| Arabic and theme cookies | **PASS** — server output used `lang=ar`, `dir=rtl`, and the selected light theme. |
| Unauthenticated access | **PASS** — redirected to the existing login route. |
| Signed-in non-admin access | **PASS** — returned 404 on each admin section; private order/customer data and dashboard content were absent from response payloads. |

## Project checks

- `npm run build` — **PASS**.
- `npm run lint` — **PASS**.
- `npm run typecheck` — **PASS**.
- `npm test` — **57 passed, 6 skipped, 0 failed**. The skipped tests require `TEST_DATABASE_URL`.
- The temporary route tests used HTTP requests against a local Next.js development server. They did not include real-device testing or a visual browser automation run at mobile viewport sizes.
