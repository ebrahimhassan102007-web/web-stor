# VULN-121 — Guest promo per-buyer limit bypassed by discarding the cart cookie

**Status:** FIXED (2026-11-25, branch `arena/ac3a149c-web-stor`)

| Field | Detail |
| --- | --- |
| **Vulnerability** | Business-logic flaw — limit bypass through disposable client state (CWE-840, CWE-799) |
| **Location** | `src/lib/db/demo-order.ts` → `recordDemoOrder()`, promo redemption key derivation (~line 126 pre-fix) |
| **Severity** | Medium |
| **Why it is vulnerable** | `redeemerKey` for signed-out buyers was `sha256("guest-cart:" + cartId)`. A cart is created purely from a signed cookie, so it is not an identity: deleting one cookie yields a fresh cart and therefore a fresh `redeemerKey`. `isPromoWithinLimits` compares `redeemerCount < perUserLimit` against that key, so `perUserLimit` was enforceable for signed-in users only. |
| **Attack scenario** | A guest applies a `perUserLimit: 1` code, completes a demo order, clears the site cookies and repeats. Each iteration looks like a first-time buyer to the redemption counter, so a limited or "one per customer" campaign can be reused indefinitely (and the global `maxRedemptions` budget is drained faster than intended). |
| **Fix applied** | Guest keys are now derived from the order's normalized email — `sha256("guest-email:" + email.trim().toLowerCase())`, a 64-character hex digest that exactly fits `promo_redemptions.redeemer_key varchar(64)` and can never collide with the `user:<uuid>` form used for accounts. The transaction still locks the promo row before counting, so concurrent redemptions remain serialized. |
| **Files changed** | `src/lib/db/demo-order.ts`, `tests/security-regression.test.ts` |
| **Regression risk** | Low. Signed-in behaviour is untouched. Guests keep the same feature; only a *second* redemption with the same address for a code whose `perUserLimit` is already reached is now refused with `PROMO_UNAVAILABLE`, which is exactly the documented per-buyer rule. Existing redemption rows (keyed by cart) are historical data and are not read for the new keys. |
| **Verification performed** | PGlite integration test (`SEC-03`) migrates the real schema, creates a `perUserLimit: 1` code, redeems it from cart A, then redeems from a **brand-new** cart with the same address written as `"  Guest@Example.INVALID "` → `recorded` then `invalid-promo`; a genuinely different address still returns `recorded`. Negative control: reverting to the cart-scoped key makes this test fail. |
