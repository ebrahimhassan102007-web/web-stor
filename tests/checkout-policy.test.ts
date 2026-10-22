import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CHECKOUT_DISABLED_ERROR,
  CHECKOUT_DISABLED_STATUS,
  DEMO_ORDER_STATUS,
  isPaidOrConfirmedStatus,
  resolveCheckoutMode,
} from "../src/lib/checkout-policy";

const checkoutRoute = readFileSync("src/app/api/checkout/route.ts", "utf8");
const receiptPage = readFileSync("src/app/checkout/success/page.tsx", "utf8");

test("production checkout fails closed before reading or mutating anything", () => {
  assert.equal(resolveCheckoutMode({ NODE_ENV: "production" }), "disabled");
  assert.equal(resolveCheckoutMode({ NODE_ENV: "development" }), "demo");
  assert.equal(CHECKOUT_DISABLED_STATUS, 503);
  assert.equal(CHECKOUT_DISABLED_ERROR, "CHECKOUT_DISABLED");

  const handler = checkoutRoute.slice(checkoutRoute.indexOf("export async function POST"));
  const guard = handler.indexOf("resolveCheckoutMode()");
  assert.notEqual(guard, -1);
  for (const laterOperation of [
    "verifySameOrigin(req)",
    "req.json()",
    "getExistingCartId()",
    "recordDemoOrder(db",
  ]) {
    assert.ok(guard < handler.indexOf(laterOperation), `${laterOperation} must follow the production guard`);
  }
});

test("demo checkout status never implies payment or confirmation", () => {
  assert.equal(DEMO_ORDER_STATUS, "demo-unpaid");
  for (const paidStatus of ["confirmed", "paid", "completed"]) {
    assert.equal(isPaidOrConfirmedStatus(paidStatus), true);
  }
  assert.equal(isPaidOrConfirmedStatus(DEMO_ORDER_STATUS), false);
});

test("the public receipt checks existence only and never renders private order details", () => {
  assert.match(receiptPage, /orderExistsByNumber/);
  assert.doesNotMatch(receiptPage, /getOrderByNumber|customerName|deliveryCode|email|totalCents/);
  assert.match(receiptPage, /robots: \{ index: false, follow: false \}/);
});
