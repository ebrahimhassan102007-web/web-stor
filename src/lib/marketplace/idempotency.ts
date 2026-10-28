import { randomUUID } from "node:crypto";

/**
 * Idempotency keys for financial writes.
 *
 * Every commission, entitlement, refund, chargeback and payout row in
 * `seller_ledger_entries` / `payout_requests` carries a deterministic key with
 * a database UNIQUE constraint. Replaying the same business event therefore
 * conflicts instead of double-booking money, which is what makes
 * "recorded exactly once" enforceable at the storage layer rather than by
 * convention.
 *
 * Browser-supplied keys are only ever used to deduplicate a *checkout
 * submission*; they are validated and normalized here, and never used as a
 * ledger key.
 */

/** Client checkout keys: bounded, printable, no whitespace or control chars. */
const CLIENT_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,63}$/;

export type LedgerEntryType =
  | "sale_gross"
  | "commission"
  | "seller_entitlement"
  | "refund"
  | "refund_reversal"
  | "chargeback"
  | "adjustment"
  | "payout_hold"
  | "payout_release"
  | "payout_paid"
  | "payout_reversal";

export function isClientIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && CLIENT_KEY_RE.test(value);
}

/**
 * Accept a client key when well-formed, otherwise mint a server key. Never
 * reject a checkout solely because a key is missing — the server always has a
 * safe fallback.
 */
export function resolveClientIdempotencyKey(value: unknown): string {
  return isClientIdempotencyKey(value) ? value : `srv-${randomUUID()}`;
}

function requirePositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

/** `sale:<orderItemId>:<entryType>` — one entry per line and type. */
export function saleLedgerKey(orderItemId: number, entryType: LedgerEntryType): string {
  requirePositiveSafeInteger(orderItemId, "orderItemId");
  return `sale:${orderItemId}:${entryType}`;
}

/** `refund:<refundId>:<entryType>` — a refund can never be applied twice. */
export function refundLedgerKey(refundId: string, entryType: LedgerEntryType): string {
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(refundId)) {
    throw new Error("refundId contains unsupported characters");
  }
  return `refund:${refundId}:${entryType}`;
}

/** `payout:<payoutId>:<entryType>` — holds/paid rows are unique per payout. */
export function payoutLedgerKey(payoutId: string, entryType: LedgerEntryType): string {
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(payoutId)) {
    throw new Error("payoutId contains unsupported characters");
  }
  return `payout:${payoutId}:${entryType}`;
}

/** `settle:<orderItemId>:available` — provider settlement applied once. */
export function settlementLedgerKey(orderItemId: number): string {
  requirePositiveSafeInteger(orderItemId, "orderItemId");
  return `settle:${orderItemId}:available`;
}

export const MAX_LEDGER_KEY_LENGTH = 160;
