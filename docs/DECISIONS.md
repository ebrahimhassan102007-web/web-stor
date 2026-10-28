# Decisions

## D-01 (superseded) — Missing specification
The prior session blocked everything for lack of the spec. On 2026-10-26 the
owner supplied the program; implementation proceeded. The supplied text was
truncated at ~item 408 — recorded in BLOCKED.md B-03 instead of guessed.

## D-02 — "الراثين" interpreted as the balance/wallet chip (P0-2)
The top bar had no balance element, so we created exactly what the spec's
fallback prescribes: wallet chip (icon + honest demo `$0.00`, amount hidden
below `sm`) plus a ≥44px "+" link. Signed-out: "+" only →
`/login?next=%2Faccount%2Fwallet`. Same "+" added in the drawer next to
"Wallet & deposits". Balance source is `src/lib/wallet.ts`, shared with the
wallet page. No money invented.

## D-03 — Production isolation
All probing was against a locally started dev instance (`localhost:3000`)
with no DATABASE_URL (read-only catalogue preview). No production systems,
data, or third parties were touched.

## D-04 — CSP choices (S-05)
Nonce + `strict-dynamic` for scripts; `style-src` keeps `'unsafe-inline'`
because React/Tailwind emit style attributes (style injection cannot execute
script; documented residual). `report-to` was **not** added — there is no
reporting endpoint, and a fake one would violate the no-fake-features rule.
COEP is `credentialless` rather than `require-corp` to avoid breaking future
cross-origin embeds while keeping isolation benefits.

## D-05 — Checkout mode semantics (S-11)
`CHECKOUT_MODE=demo` works only outside production **and** off public https
origins; unset keeps local-dev demo (so existing tests/dev flow keep working)
and disables production. Production boot rejects `demo` outright (S-17).

## D-06 — Order backfill safety (S-08)
Historic orders are attributed to an account only when that account's email
is verified. Guest-checkout orders typed with someone else's email stay
`user_id = NULL` and appear in nobody's history — the safe failure mode.

## D-07 — security.txt placeholders
Contact/policy use `example.com` because inventing a real-looking security
contact would be false. Owner must replace before launch (BLOCKED B-04).

## D-08 — Colors
No color token, gradient, or theme value was changed. `globals.css` diff
contains only drawer motion keyframes and `.btn-primary` weight/size (see
CONTRAST-REPORT).

---

# Multi-vendor marketplace decisions (2026-10-28)

Approved by the owner before implementation started. Full audit and plan:
`docs/MARKETPLACE-AUDIT-AND-PLAN.md`.

## D-09 — Roles: BUYER is the existing `customer` role
`users.role` gains `seller` as a **superset**: `('customer','seller','admin')`.
Buyers keep `role = 'customer'` because `/account`, `/account/orders`, the
S-08 order-ownership backfill and the existing tests all key off that value.
"BUYER" in the specification maps to `customer`; naming is documented rather
than migrated. A seller role is granted only by an admin approval transaction.

## D-10 — Commission rounding
Commission is `round-half-up(grossMinor × rateBps / 10 000)` in integer
arithmetic (`src/lib/marketplace/commission.ts`), and the seller entitlement is
the exact complement `gross − commission`. Therefore
`commission + sellerEntitlement === gross` on every line, with no residual
rounding account. Calculation is **per line**; an order's commission is the sum
of its lines. Half-up was chosen because it is deterministic, currency-agnostic
and never produces a fraction of a minor unit; the remainder goes to the seller.

## D-11 — Platform-owned catalogue uses a single platform seller profile
The owner chose to model E-Vora's own catalogue as a platform seller so that
platform and third-party sales share one reporting shape. Migration
`0004_marketplace_identity` seeds exactly one row
(`id = e0e0e0e0-…-0001`, `is_platform = true`, `user_id = NULL`, slug
`e-vora-platform`) and a partial unique index guarantees it stays unique.
Platform lines are recorded at **0 bps** (`PLATFORM_OWNED_COMMISSION_BPS`), so
no commission is booked against E-Vora itself. Existing catalogue products will
be attributed to this profile in the commerce migration (step 6), and historic
orders are never retro-charged.

## D-12 — Currency is snapshotted per order; no FX in the ledger
The owner chose per-order currency snapshots. Commission and entitlements are
computed in that currency's integer minor units, and all lines of one order must
share one currency (`assertSingleCurrency`). No exchange-rate conversion exists
in the ledger, and the existing indicative USD→EGP display helper remains
display-only.

## D-13 — Demo settlement cannot become withdrawable money
No payment provider is connected and none may be connected without explicit
approval. Orders continue to be recorded as demo/unpaid; any demo financial
rows go to a separate non-withdrawable `demo` ledger bucket, and payout requests
return `PAYOUTS_DISABLED_DEMO` while only demo balances exist. Seller "paid"
states are reachable only through an admin (or, later, a verified payout
provider) action — never from a seller request (`payout-policy.ts`).

## D-14 — Subscriptions are modelled, not sold
Only a free plan is active. Pro/Business remain "coming soon" with **no
invented prices** until the owner approves pricing and a payment provider.

## D-15 — Product images stay URL/icon-based for now
No object storage is configured, so products keep the existing icon/SVG
fallback and may reference a validated `https://` image URL. No upload
endpoint is added until storage credentials exist.
