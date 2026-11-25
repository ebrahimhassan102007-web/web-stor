import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { calculatePromoDiscount, hasSufficientWalletBalance, isPromoWithinLimits, normalizePromoCode } from "../src/lib/wallet-math";
import { verifyWalletWebhookSignature } from "../src/lib/wallet-webhook";

test("promo normalization applies NFKC and uppercase consistently", () => {
  assert.equal(normalizePromoCode("  ｅvora-20 "), "EVORA-20");
});

test("promo discount handles basis points, fixed cents, minimums, and caps", () => {
  const base = { minSubtotalCents: 500, subtotalCents: 2000, maxDiscountCents: 250 };
  assert.equal(calculatePromoDiscount({ ...base, discountType: "percentage", discountValue: 2000 }), 250);
  assert.equal(calculatePromoDiscount({ ...base, discountType: "fixed_cents", discountValue: 500 }), 250);
  assert.equal(calculatePromoDiscount({ ...base, subtotalCents: 499, discountType: "fixed_cents", discountValue: 250 }), 0);
  assert.equal(calculatePromoDiscount({ ...base, subtotalCents: 100, minSubtotalCents: 0, maxDiscountCents: null, discountType: "percentage", discountValue: 10000 }), 100);
});

test("promo redemption limits and wallet insufficient-funds checks are strict", () => {
  assert.equal(isPromoWithinLimits({ globalCount: 0, maxRedemptions: 10, redeemerCount: 0, perUserLimit: 1 }), true);
  assert.equal(isPromoWithinLimits({ globalCount: 10, maxRedemptions: 10, redeemerCount: 0, perUserLimit: 1 }), false);
  assert.equal(isPromoWithinLimits({ globalCount: 0, maxRedemptions: null, redeemerCount: 1, perUserLimit: 1 }), false);
  assert.equal(hasSufficientWalletBalance(500, 500), true);
  assert.equal(hasSufficientWalletBalance(499, 500), false);
  assert.equal(hasSufficientWalletBalance(-1, 0), false);
});

test("wallet webhook signature verifies only with fresh timestamp and exact body", () => {
  const secret = "a-secret-that-is-at-least-thirty-two-characters";
  const timestamp = "1795620000";
  const body = '{"eventId":"evt-1","amountCents":500}';
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  assert.equal(verifyWalletWebhookSignature({ secret, timestamp, signature, rawBody: body, nowSeconds: Number(timestamp) }), true);
  assert.equal(verifyWalletWebhookSignature({ secret, timestamp, signature, rawBody: `${body} `, nowSeconds: Number(timestamp) }), false);
  assert.equal(verifyWalletWebhookSignature({ secret, timestamp, signature, rawBody: body, nowSeconds: Number(timestamp) + 301 }), false);
  assert.equal(verifyWalletWebhookSignature({ secret: undefined, timestamp, signature, rawBody: body, nowSeconds: Number(timestamp) }), false);
});
