/**
 * E-Vora marketplace commission engine — pure, dependency-free, integer-only.
 *
 * Intentionally NOT marked `server-only`: like `checkout-policy.ts` and
 * `money.ts` it is a pure policy module with no database or secret access, so
 * the test suite can import it directly. It must still only ever be called
 * from server code with prices read inside a transaction.
 *
 * OFFICIAL POLICY: platform commission = 10% (1000 basis points) of the
 * eligible item amount. Seller entitlement = the exact remainder (90%).
 *
 * Why this module is pure and contains no database access:
 *  - the rate, the rounding and the split are business rules that must be
 *    unit-tested exhaustively without a database;
 *  - callers pass trusted prices read from the catalog inside a transaction;
 *    nothing here accepts a client-supplied amount or total.
 *
 * ROUNDING RULE (documented in docs/DECISIONS.md D-10):
 *   commission = round-half-up(grossMinor * rateBps / 10_000)
 *   seller entitlement = grossMinor - commission
 * Half-up means the seller never receives a fraction of a minor unit that
 * does not exist, and — because the entitlement is the exact complement —
 * `commission + entitlement === gross` holds for every line, with no
 * residual rounding account. Commission is computed PER LINE and an order's
 * commission is the SUM of its lines, so split carts cannot drift.
 */

/** 10.00% — E-Vora's official commission. Never supplied by a client. */
export const PLATFORM_COMMISSION_BPS = 1000;

/**
 * Commission for E-Vora's own platform-owned catalogue: E-Vora keeps the
 * whole amount, so no platform commission is booked against itself (D-11).
 * Sales still produce ledger rows so platform and seller reporting share one
 * shape.
 */
export const PLATFORM_OWNED_COMMISSION_BPS = 0;

/** Defensive bound; a seller can never self-assign a higher rate. */
export const MAX_COMMISSION_BPS = 5000;

/** Keeps price × 99 inside int4 and comfortably inside Number.MAX_SAFE_INTEGER. */
export const MAX_PRODUCT_PRICE_CENTS = 10_000_000;

/** Mirrors cart_items/order_items CHECK quantity 1..99. */
export const MAX_LINE_QUANTITY = 99;

/** ISO-4217 shape. Currency is snapshotted per order; no FX math anywhere. */
export const CURRENCY_RE = /^[A-Z]{3}$/;

// BigInt() calls rather than literals keep the repo's ES2017 target intact.
export const BASIS_POINT_DENOMINATOR = BigInt(10_000);

export type CommissionErrorCode =
  | "INVALID_PRICE"
  | "INVALID_QUANTITY"
  | "INVALID_RATE"
  | "INVALID_CURRENCY"
  | "AMOUNT_OUT_OF_RANGE";

export class CommissionError extends Error {
  readonly code: CommissionErrorCode;

  constructor(code: CommissionErrorCode, message: string) {
    super(message);
    this.name = "CommissionError";
    this.code = code;
  }
}

export type CommissionLineInput = {
  /** Trusted unit price in integer minor units, read from the database. */
  unitPriceCents: number;
  quantity: number;
  /** Uppercase ISO-4217 code snapshotted on the order. */
  currency: string;
  /**
   * Rate for this line. Defaults to the platform rate. Platform-owned lines
   * pass `PLATFORM_OWNED_COMMISSION_BPS` from a server-side decision, never
   * from a request body.
   */
  rateBps?: number;
};

export type CommissionSnapshot = {
  /** unitPriceCents × quantity, in integer minor units. */
  grossCents: number;
  commissionRateBps: number;
  commissionCents: number;
  sellerEntitlementCents: number;
  currency: string;
};

function assertNonNegativeSafeInteger(
  value: unknown,
  code: CommissionErrorCode,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new CommissionError(code, `${label} must be a non-negative integer`);
  }
}

export function isValidCurrency(value: unknown): value is string {
  return typeof value === "string" && CURRENCY_RE.test(value);
}

/**
 * Half-up integer division by 10 000 without floating point.
 * `(gross * bps + 5 000) / 10 000` in BigInt = round-half-up for non-negative
 * operands.
 */
export function applyBasisPointsHalfUp(amountMinor: bigint, rateBps: bigint): bigint {
  if (amountMinor < BigInt(0) || rateBps < BigInt(0)) {
    throw new CommissionError("AMOUNT_OUT_OF_RANGE", "amounts and rates must be non-negative");
  }
  return (
    (amountMinor * rateBps + BASIS_POINT_DENOMINATOR / BigInt(2)) /
    BASIS_POINT_DENOMINATOR
  );
}

/**
 * Validate + compute one order line's financial snapshot.
 * Throws `CommissionError` for anything that is not a trusted integer value.
 */
export function calculateLineCommission(input: CommissionLineInput): CommissionSnapshot {
  const { unitPriceCents, quantity, currency } = input;
  const rateBps = input.rateBps ?? PLATFORM_COMMISSION_BPS;

  if (
    !Number.isSafeInteger(unitPriceCents) ||
    unitPriceCents <= 0 ||
    unitPriceCents > MAX_PRODUCT_PRICE_CENTS
  ) {
    throw new CommissionError(
      "INVALID_PRICE",
      `unit price must be an integer between 1 and ${MAX_PRODUCT_PRICE_CENTS} minor units`,
    );
  }
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_LINE_QUANTITY) {
    throw new CommissionError(
      "INVALID_QUANTITY",
      `quantity must be an integer between 1 and ${MAX_LINE_QUANTITY}`,
    );
  }
  assertNonNegativeSafeInteger(rateBps, "INVALID_RATE", "commission rate");
  if (rateBps > MAX_COMMISSION_BPS) {
    throw new CommissionError(
      "INVALID_RATE",
      `commission rate must not exceed ${MAX_COMMISSION_BPS} basis points`,
    );
  }
  if (!isValidCurrency(currency)) {
    throw new CommissionError("INVALID_CURRENCY", "currency must be an uppercase ISO-4217 code");
  }

  const gross = BigInt(unitPriceCents) * BigInt(quantity);
  const commission = applyBasisPointsHalfUp(gross, BigInt(rateBps));
  const entitlement = gross - commission;

  const grossCents = Number(gross);
  const commissionCents = Number(commission);
  const sellerEntitlementCents = Number(entitlement);
  if (
    !Number.isSafeInteger(grossCents) ||
    !Number.isSafeInteger(commissionCents) ||
    !Number.isSafeInteger(sellerEntitlementCents)
  ) {
    throw new CommissionError("AMOUNT_OUT_OF_RANGE", "line amount exceeds the safe integer range");
  }

  const snapshot: CommissionSnapshot = {
    grossCents,
    commissionRateBps: rateBps,
    commissionCents,
    sellerEntitlementCents,
    currency,
  };
  assertCommissionInvariant(snapshot);
  return snapshot;
}

/**
 * The single invariant every persisted snapshot must satisfy. Called by the
 * engine itself, and available to tests and to the ledger writer.
 */
export function assertCommissionInvariant(snapshot: CommissionSnapshot): void {
  const { grossCents, commissionCents, sellerEntitlementCents } = snapshot;
  for (const [label, value] of [
    ["grossCents", grossCents],
    ["commissionCents", commissionCents],
    ["sellerEntitlementCents", sellerEntitlementCents],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new CommissionError("AMOUNT_OUT_OF_RANGE", `${label} must be a non-negative integer`);
    }
  }
  if (commissionCents + sellerEntitlementCents !== grossCents) {
    throw new CommissionError(
      "AMOUNT_OUT_OF_RANGE",
      "commission plus seller entitlement must equal the gross amount",
    );
  }
  if (grossCents === 0) {
    throw new CommissionError("INVALID_PRICE", "gross amount must be positive");
  }
}

/** Sum of per-line commissions — the order-level figure. */
export function sumCommissions(snapshots: readonly CommissionSnapshot[]): number {
  let total = 0;
  for (const snapshot of snapshots) {
    assertCommissionInvariant(snapshot);
    total += snapshot.commissionCents;
  }
  if (!Number.isSafeInteger(total)) {
    throw new CommissionError("AMOUNT_OUT_OF_RANGE", "order commission exceeds the safe range");
  }
  return total;
}

/** Sum of per-line seller entitlements — the seller-level figure. */
export function sumEntitlements(snapshots: readonly CommissionSnapshot[]): number {
  let total = 0;
  for (const snapshot of snapshots) {
    assertCommissionInvariant(snapshot);
    total += snapshot.sellerEntitlementCents;
  }
  if (!Number.isSafeInteger(total)) {
    throw new CommissionError("AMOUNT_OUT_OF_RANGE", "order entitlement exceeds the safe range");
  }
  return total;
}

/** All lines must share the order currency; commission is never cross-currency. */
export function assertSingleCurrency(snapshots: readonly CommissionSnapshot[]): string {
  if (snapshots.length === 0) {
    throw new CommissionError("INVALID_CURRENCY", "at least one line is required");
  }
  const [first] = snapshots;
  if (!first) throw new CommissionError("INVALID_CURRENCY", "at least one line is required");
  for (const snapshot of snapshots) {
    if (snapshot.currency !== first.currency) {
      throw new CommissionError("INVALID_CURRENCY", "all lines in an order must share one currency");
    }
  }
  return first.currency;
}
