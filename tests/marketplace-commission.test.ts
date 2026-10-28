import assert from "node:assert/strict";
import test from "node:test";
import {
  CommissionError,
  MAX_COMMISSION_BPS,
  MAX_PRODUCT_PRICE_CENTS,
  PLATFORM_COMMISSION_BPS,
  PLATFORM_OWNED_COMMISSION_BPS,
  applyBasisPointsHalfUp,
  assertCommissionInvariant,
  assertSingleCurrency,
  calculateLineCommission,
  isValidCurrency,
  sumCommissions,
  sumEntitlements,
  type CommissionSnapshot,
} from "../src/lib/marketplace/commission";

/* ------------------------------------------------------------------ */
/* The business example from the specification                         */
/* ------------------------------------------------------------------ */
test("EGP 100 sale splits into a 10% commission and a 90% seller entitlement", () => {
  // 100 EGP = 10 000 piasters (integer minor units).
  const line = calculateLineCommission({
    unitPriceCents: 10_000,
    quantity: 1,
    currency: "EGP",
  });
  assert.deepEqual(line, {
    grossCents: 10_000,
    commissionRateBps: 1000,
    commissionCents: 1_000, // 10 EGP
    sellerEntitlementCents: 9_000, // 90 EGP
    currency: "EGP",
  });
});

test("the same 10%/90% split holds in any currency snapshot, with no FX conversion", () => {
  const usd = calculateLineCommission({ unitPriceCents: 10_000, quantity: 1, currency: "USD" });
  assert.equal(usd.commissionCents, 1_000);
  assert.equal(usd.sellerEntitlementCents, 9_000);
  assert.equal(usd.currency, "USD");
  assert.equal(PLATFORM_COMMISSION_BPS, 1000);
});

/* ------------------------------------------------------------------ */
/* Exactness and rounding                                              */
/* ------------------------------------------------------------------ */
test("commission plus entitlement equals the gross amount for every small line", () => {
  for (let price = 1; price <= 500; price += 1) {
    for (const quantity of [1, 2, 3, 17, 99]) {
      const line = calculateLineCommission({ unitPriceCents: price, quantity, currency: "EGP" });
      assert.equal(line.grossCents, price * quantity);
      assert.equal(
        line.commissionCents + line.sellerEntitlementCents,
        line.grossCents,
        `split must be exact for ${price} x ${quantity}`,
      );
      assert.ok(line.commissionCents >= 0 && line.sellerEntitlementCents >= 0);
      assert.ok(Number.isSafeInteger(line.commissionCents));
    }
  }
});

test("commission rounds half up to the nearest minor unit", () => {
  // 1 005 minor units × 10% = 100.5 → 101 (half up); seller keeps the rest.
  const halfUp = calculateLineCommission({ unitPriceCents: 1_005, quantity: 1, currency: "EGP" });
  assert.equal(halfUp.commissionCents, 101);
  assert.equal(halfUp.sellerEntitlementCents, 904);

  // 1 004 × 10% = 100.4 → 100.
  const roundedDown = calculateLineCommission({ unitPriceCents: 1_004, quantity: 1, currency: "EGP" });
  assert.equal(roundedDown.commissionCents, 100);
  assert.equal(roundedDown.sellerEntitlementCents, 904);

  // 1 minor unit × 10% = 0.1 → 0 commission, whole amount to the seller.
  const tiny = calculateLineCommission({ unitPriceCents: 1, quantity: 1, currency: "EGP" });
  assert.equal(tiny.commissionCents, 0);
  assert.equal(tiny.sellerEntitlementCents, 1);
});

test("half-up division is integer-only and rejects negative operands", () => {
  assert.equal(applyBasisPointsHalfUp(BigInt(10_000), BigInt(1_000)), BigInt(1_000));
  assert.equal(applyBasisPointsHalfUp(BigInt(1_005), BigInt(1_000)), BigInt(101));
  assert.equal(applyBasisPointsHalfUp(BigInt(0), BigInt(1_000)), BigInt(0));
  assert.throws(() => applyBasisPointsHalfUp(BigInt(-1), BigInt(1_000)), CommissionError);
  assert.throws(() => applyBasisPointsHalfUp(BigInt(10), BigInt(-1)), CommissionError);
});

test("max price and max quantity stay inside the safe integer range", () => {
  const line = calculateLineCommission({
    unitPriceCents: MAX_PRODUCT_PRICE_CENTS,
    quantity: 99,
    currency: "EGP",
  });
  assert.equal(line.grossCents, 990_000_000);
  assert.equal(line.commissionCents + line.sellerEntitlementCents, line.grossCents);
  assert.ok(Number.isSafeInteger(line.commissionCents));
});

/* ------------------------------------------------------------------ */
/* Platform-owned catalogue (D-11)                                     */
/* ------------------------------------------------------------------ */
test("platform-owned lines book no commission and keep the whole amount", () => {
  const line = calculateLineCommission({
    unitPriceCents: 25_000,
    quantity: 2,
    currency: "USD",
    rateBps: PLATFORM_OWNED_COMMISSION_BPS,
  });
  assert.equal(line.grossCents, 50_000);
  assert.equal(line.commissionRateBps, 0);
  assert.equal(line.commissionCents, 0);
  assert.equal(line.sellerEntitlementCents, 50_000);
});

/* ------------------------------------------------------------------ */
/* Client-supplied garbage is rejected, never coerced                  */
/* ------------------------------------------------------------------ */
test("invalid prices are rejected rather than clamped", () => {
  for (const unitPriceCents of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    MAX_PRODUCT_PRICE_CENTS + 1,
  ]) {
    assert.throws(
      () => calculateLineCommission({ unitPriceCents, quantity: 1, currency: "EGP" }),
      CommissionError,
      `price ${unitPriceCents} must be rejected`,
    );
  }
});

test("invalid quantities are rejected", () => {
  for (const quantity of [0, -1, 100, 1.5, Number.NaN]) {
    assert.throws(
      () => calculateLineCommission({ unitPriceCents: 100, quantity, currency: "EGP" }),
      CommissionError,
    );
  }
});

test("sellers cannot raise the commission rate beyond the platform policy", () => {
  assert.throws(
    () =>
      calculateLineCommission({
        unitPriceCents: 100,
        quantity: 1,
        currency: "EGP",
        rateBps: MAX_COMMISSION_BPS + 1,
      }),
    CommissionError,
  );
  assert.throws(
    () =>
      calculateLineCommission({
        unitPriceCents: 100,
        quantity: 1,
        currency: "EGP",
        rateBps: -1,
      }),
    CommissionError,
  );
  assert.throws(
    () =>
      calculateLineCommission({
        unitPriceCents: 100,
        quantity: 1,
        currency: "EGP",
        rateBps: 10.5,
      }),
    CommissionError,
  );
});

test("currency must be an uppercase ISO-4217 code", () => {
  for (const currency of ["", "egp", "EG", "EGPT", "E GP", "1GP"]) {
    assert.equal(isValidCurrency(currency), false);
    assert.throws(
      () => calculateLineCommission({ unitPriceCents: 100, quantity: 1, currency }),
      CommissionError,
    );
  }
  assert.equal(isValidCurrency("EGP"), true);
});

/* ------------------------------------------------------------------ */
/* Order-level aggregation                                             */
/* ------------------------------------------------------------------ */
test("order totals are the sum of per-line commissions, with exact complements", () => {
  const lines = [
    calculateLineCommission({ unitPriceCents: 333, quantity: 3, currency: "EGP" }),
    calculateLineCommission({ unitPriceCents: 1_005, quantity: 1, currency: "EGP" }),
    calculateLineCommission({ unitPriceCents: 7_777, quantity: 2, currency: "EGP" }),
  ];
  const gross = lines.reduce((sum, line) => sum + line.grossCents, 0);
  const commission = sumCommissions(lines);
  const entitlement = sumEntitlements(lines);
  assert.equal(commission + entitlement, gross);
});

test("mixing currencies in one order is refused", () => {
  const egp = calculateLineCommission({ unitPriceCents: 100, quantity: 1, currency: "EGP" });
  const usd = calculateLineCommission({ unitPriceCents: 100, quantity: 1, currency: "USD" });
  assert.throws(() => assertSingleCurrency([egp, usd]), CommissionError);
  assert.equal(assertSingleCurrency([egp, egp]), "EGP");
  assert.throws(() => assertSingleCurrency([]), CommissionError);
});

test("the invariant checker catches a tampered snapshot", () => {
  const valid: CommissionSnapshot = {
    grossCents: 1_000,
    commissionRateBps: 1000,
    commissionCents: 100,
    sellerEntitlementCents: 900,
    currency: "EGP",
  };
  assert.doesNotThrow(() => assertCommissionInvariant(valid));
  assert.throws(() =>
    assertCommissionInvariant({ ...valid, sellerEntitlementCents: 901 }),
  );
  assert.throws(() => assertCommissionInvariant({ ...valid, commissionCents: -1 }));
});

test("empty line lists sum to zero without inventing values", () => {
  assert.equal(sumCommissions([]), 0);
  assert.equal(sumEntitlements([]), 0);
});
