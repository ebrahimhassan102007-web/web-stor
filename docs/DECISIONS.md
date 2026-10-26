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
