# E‑Vora admin dashboard: design analysis

## Reference patterns reviewed

- **Shopify Analytics** brings sales, sessions, and fulfilment into an overview, supports date-range and comparison filters, and uses metric cards that can open deeper reports. Shopify also supports rearranging/customizing cards and surfaces insights and targets. Source: [Shopify Help Center — Analytics overview](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard) and [Using the overview dashboard](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard).
- **Stripe Dashboard** separates key resources into a persistent primary navigation (including balances, transactions, customers, and product catalogue), with Home analytics, activity alerts, and pinned/recent shortcuts. Source: [Stripe Docs — Web Dashboard](https://docs.stripe.com/dashboard/basics).

These examples were used as product-design references, not copied as layouts or branding.

## Decisions for E‑Vora

1. **A quick daily read:** make recorded order value, active order records, registered accounts, and catalogue stock alerts visible before the detail tables.
2. **Useful drill-downs:** keep Orders, Products, Customers, and Analytics in stable navigation. Search and safe filters are included where they materially help find records; order references open a read-only detail view and product names open their storefront details.
3. **Period context:** sales/order metrics support 7-, 30-, and 90-day views and compare with the previous interval. Charts and product rankings are computed from stored order records, not mock metrics.
4. **A distinct “الإبداع” destination:** the Creative Studio provides editable campaign drafts, short headlines, copy-to-clipboard actions, and brand-voice guidance aimed at digital-game shoppers. Nothing publishes or sends automatically.
5. **Honest operational status:** E‑Vora’s current checkout is a preview, not a live payment/fulfilment system. The dashboard therefore calls amounts “recorded order value,” marks stock as informational, and does not imply that stored orders represent collected revenue.
6. **Privacy and safe scope:** all admin routes inherit the existing `ADMIN_EMAIL` gate. This release is read-only because no admin mutation API exists; customer edits, refunds, inventory writes, and order-status actions are intentionally not presented as working controls.
7. **Audience and accessibility:** preserve Arabic/English and RTL/LTR, responsive desktop/mobile navigation, high-contrast status labels, keyboard focus, reduced-motion support, and restrained transitions. Animations are short, non-blocking, and decorative.

## Important scope

The implementation uses the project’s existing Next.js, React, PostgreSQL/Drizzle, locale, and theme systems. It adds no database migration, schema change, payment claim, external analytics dependency, or new admin write endpoint.
