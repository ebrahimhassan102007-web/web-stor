import assert from "node:assert/strict";
import test from "node:test";
import {
  isClientIdempotencyKey,
  payoutLedgerKey,
  refundLedgerKey,
  resolveClientIdempotencyKey,
  saleLedgerKey,
  settlementLedgerKey,
} from "../src/lib/marketplace/idempotency";

test("well-formed client checkout keys are accepted", () => {
  assert.equal(isClientIdempotencyKey("checkout-2026-10-28-abc123"), true);
  assert.equal(isClientIdempotencyKey("A1b2C3d4E5f6G7h8"), true);
  assert.equal(
    isClientIdempotencyKey("6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b"),
    true,
  );
});

test("malformed client keys are replaced with a server-minted key", () => {
  for (const value of [
    undefined,
    null,
    "",
    "short",
    "has space in it 123456",
    "newline\ninjected-key-1234",
    "../../etc/passwd-1234",
    "-leading-dash-key-1234",
    "x".repeat(200),
  ]) {
    assert.equal(isClientIdempotencyKey(value), false, `${String(value)} must be refused`);
    const resolved = resolveClientIdempotencyKey(value);
    assert.match(resolved, /^srv-[0-9a-f-]{36}$/);
    assert.notEqual(resolved, "srv-" + String(value));
  }
});

test("server-minted keys are unique per call", () => {
  const keys = new Set(Array.from({ length: 50 }, () => resolveClientIdempotencyKey(undefined)));
  assert.equal(keys.size, 50);
});

test("ledger keys are deterministic so replays conflict instead of double-booking", () => {
  assert.equal(saleLedgerKey(42, "commission"), "sale:42:commission");
  assert.equal(saleLedgerKey(42, "seller_entitlement"), "sale:42:seller_entitlement");
  assert.equal(saleLedgerKey(42, "commission"), saleLedgerKey(42, "commission"));
  assert.notEqual(saleLedgerKey(42, "commission"), saleLedgerKey(43, "commission"));

  assert.equal(settlementLedgerKey(42), "settle:42:available");
  assert.equal(refundLedgerKey("rf_123", "refund"), "refund:rf_123:refund");
  assert.equal(payoutLedgerKey("p-1", "payout_hold"), "payout:p-1:payout_hold");
});

test("invalid identifiers never produce a ledger key", () => {
  for (const id of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => saleLedgerKey(id, "commission"));
    assert.throws(() => settlementLedgerKey(id));
  }
  assert.throws(() => refundLedgerKey("bad id!", "refund"));
  assert.throws(() => payoutLedgerKey("", "payout_hold"));
});
