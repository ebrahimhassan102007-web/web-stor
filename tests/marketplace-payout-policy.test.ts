import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PAYOUT_CENTS,
  PAYOUT_METHODS,
  PAYOUT_STATUSES,
  assertPayoutTransition,
  canTransitionPayout,
  evaluatePayoutRequest,
  isOpenPayoutStatus,
  isPayoutMethod,
  isPayoutStatus,
  type PayoutEligibilityInput,
} from "../src/lib/marketplace/payout-policy";

const baseEligibility: PayoutEligibilityInput = {
  sellerStatus: "approved",
  availableCents: 50_000,
  reservedCents: 0,
  amountCents: 20_000,
  method: "bank_transfer",
  hasOpenRequest: false,
  payoutsEnabled: true,
};

test("status and method allow-lists match the specification", () => {
  assert.deepEqual([...PAYOUT_STATUSES], [
    "requested",
    "under_review",
    "approved",
    "processing",
    "paid",
    "rejected",
    "cancelled",
  ]);
  assert.deepEqual([...PAYOUT_METHODS], [
    "bank_transfer",
    "instapay",
    "vodafone_cash",
    "other",
  ]);
  assert.equal(isPayoutStatus("paid"), true);
  assert.equal(isPayoutStatus("settled"), false);
  assert.equal(isPayoutMethod("paypal"), false);
  assert.equal(isOpenPayoutStatus("processing"), true);
  assert.equal(isOpenPayoutStatus("paid"), false);
});

test("a seller can never drive a payout to paid", () => {
  for (const from of PAYOUT_STATUSES) {
    assert.equal(canTransitionPayout(from, "paid", "seller"), false, `seller ${from} → paid`);
    assert.equal(canTransitionPayout(from, "approved", "seller"), false);
    assert.equal(canTransitionPayout(from, "processing", "seller"), false);
  }
  // Admin/system confirmation is the only path to paid, and only from processing.
  assert.equal(canTransitionPayout("processing", "paid", "admin"), true);
  assert.equal(canTransitionPayout("processing", "paid", "system"), true);
  assert.equal(canTransitionPayout("requested", "paid", "admin"), false);
});

test("the payout state machine follows the documented lifecycle", () => {
  const legal: Array<[Parameters<typeof canTransitionPayout>[0], Parameters<typeof canTransitionPayout>[1]]> = [
    ["requested", "under_review"],
    ["requested", "cancelled"],
    ["requested", "rejected"],
    ["under_review", "approved"],
    ["under_review", "rejected"],
    ["approved", "processing"],
    ["approved", "cancelled"],
    ["processing", "paid"],
    ["processing", "rejected"],
  ];
  for (const [from, to] of legal) {
    assert.equal(canTransitionPayout(from, to, "admin"), true, `${from} → ${to} must be legal`);
  }

  const illegal: typeof legal = [
    ["paid", "processing"],
    ["rejected", "approved"],
    ["cancelled", "requested"],
    ["processing", "requested"],
    ["approved", "paid"],
  ];
  for (const [from, to] of illegal) {
    assert.equal(canTransitionPayout(from, to, "admin"), false, `${from} → ${to} must be illegal`);
    assert.throws(() => assertPayoutTransition(from, to, "admin"), /ILLEGAL_PAYOUT_TRANSITION/);
  }
});

test("a seller may only cancel their own open request", () => {
  assert.equal(canTransitionPayout("requested", "cancelled", "seller"), true);
  assert.equal(canTransitionPayout("under_review", "cancelled", "seller"), true);
  assert.equal(canTransitionPayout("processing", "cancelled", "seller"), false);
  assert.equal(canTransitionPayout("paid", "cancelled", "seller"), false);
});

test("an approved seller with settled funds can request a valid payout", () => {
  const result = evaluatePayoutRequest(baseEligibility);
  assert.deepEqual(result, { allowed: true, amountCents: 20_000, method: "bank_transfer" });
});

test("amounts already reserved by open requests reduce the requestable balance", () => {
  const result = evaluatePayoutRequest({ ...baseEligibility, amountCents: 40_000, reservedCents: 20_000 });
  assert.deepEqual(result, { allowed: false, code: "INSUFFICIENT_AVAILABLE_BALANCE" });

  const allowed = evaluatePayoutRequest({ ...baseEligibility, amountCents: 30_000, reservedCents: 20_000 });
  assert.equal(allowed.allowed, true);
});

test("demo mode refuses payouts instead of inventing withdrawable balances", () => {
  for (const payoutsEnabled of [false]) {
    assert.deepEqual(evaluatePayoutRequest({ ...baseEligibility, payoutsEnabled }), {
      allowed: false,
      code: "PAYOUTS_DISABLED_DEMO",
    });
  }
});

test("unapproved, suspended and rejected sellers cannot request a payout", () => {
  for (const sellerStatus of ["pending", "rejected", "suspended"] as const) {
    assert.deepEqual(evaluatePayoutRequest({ ...baseEligibility, sellerStatus }), {
      allowed: false,
      code: "SELLER_NOT_APPROVED",
    });
  }
});

test("invalid amounts are refused without clamping", () => {
  for (const amountCents of [0, -1, 1.5, Number.NaN, MAX_PAYOUT_CENTS + 1]) {
    assert.deepEqual(evaluatePayoutRequest({ ...baseEligibility, amountCents }), {
      allowed: false,
      code: "INVALID_AMOUNT",
    });
  }
});

test("one open request per seller and only supported methods", () => {
  assert.deepEqual(evaluatePayoutRequest({ ...baseEligibility, hasOpenRequest: true }), {
    allowed: false,
    code: "OPEN_REQUEST_EXISTS",
  });
  assert.deepEqual(evaluatePayoutRequest({ ...baseEligibility, method: "paypal" }), {
    allowed: false,
    code: "UNSUPPORTED_METHOD",
  });
  assert.deepEqual(evaluatePayoutRequest({ ...baseEligibility, method: "instapay" }), {
    allowed: true,
    amountCents: 20_000,
    method: "instapay",
  });
});

test("zero available balance can never be paid out", () => {
  assert.deepEqual(
    evaluatePayoutRequest({ ...baseEligibility, availableCents: 0, amountCents: 1 }),
    { allowed: false, code: "INSUFFICIENT_AVAILABLE_BALANCE" },
  );
});
