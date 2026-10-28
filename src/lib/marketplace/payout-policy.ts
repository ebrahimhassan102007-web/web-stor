/**
 * Seller payout policy — pure state machine + eligibility rules.
 *
 * Deliberately free of database access so every transition and every
 * rejection reason can be unit-tested. Server code resolves the authenticated
 * seller, reads the derived available balance inside a transaction, and then
 * asks this module whether a request is allowed; the seller can never mark
 * their own payout as paid (no transition below leads from a seller action to
 * `paid`).
 */

export const PAYOUT_STATUSES = [
  "requested",
  "under_review",
  "approved",
  "processing",
  "paid",
  "rejected",
  "cancelled",
] as const;

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PAYOUT_METHODS = [
  "bank_transfer",
  "instapay",
  "vodafone_cash",
  "other",
] as const;

export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

/** Statuses that reserve seller funds and therefore block a second request. */
export const OPEN_PAYOUT_STATUSES = [
  "requested",
  "under_review",
  "approved",
  "processing",
] as const;

const PAYOUT_TRANSITIONS: Readonly<Record<PayoutStatus, readonly PayoutStatus[]>> = {
  requested: ["under_review", "cancelled", "rejected"],
  under_review: ["approved", "rejected", "cancelled"],
  approved: ["processing", "rejected", "cancelled"],
  processing: ["paid", "rejected"],
  paid: [],
  rejected: [],
  cancelled: [],
};

/** Guard so a seller cannot drive a payout to `paid`. */
const SELLER_ALLOWED_TARGETS: ReadonlySet<PayoutStatus> = new Set<PayoutStatus>(["cancelled"]);

export type PayoutTransitionActor = "seller" | "admin" | "system";

export function isPayoutStatus(value: unknown): value is PayoutStatus {
  return typeof value === "string" && (PAYOUT_STATUSES as readonly string[]).includes(value);
}

export function isPayoutMethod(value: unknown): value is PayoutMethod {
  return typeof value === "string" && (PAYOUT_METHODS as readonly string[]).includes(value);
}

export function isOpenPayoutStatus(value: unknown): boolean {
  return typeof value === "string" && (OPEN_PAYOUT_STATUSES as readonly string[]).includes(value);
}

/**
 * Whether `actor` may move `from` → `to`.
 * Sellers may only cancel; only an admin (or, later, a verified payout-provider
 * webhook acting as `system`) may mark a payout paid.
 */
export function canTransitionPayout(
  from: PayoutStatus,
  to: PayoutStatus,
  actor: PayoutTransitionActor,
): boolean {
  if (!PAYOUT_TRANSITIONS[from].includes(to)) return false;
  if (actor === "seller") return SELLER_ALLOWED_TARGETS.has(to);
  return true;
}

export function assertPayoutTransition(
  from: PayoutStatus,
  to: PayoutStatus,
  actor: PayoutTransitionActor,
): void {
  if (!canTransitionPayout(from, to, actor)) {
    throw new Error(`ILLEGAL_PAYOUT_TRANSITION: ${actor} cannot move ${from} to ${to}`);
  }
}

/* ------------------------------------------------------------------ */
/* Request eligibility                                                 */
/* ------------------------------------------------------------------ */

export type PayoutRefusalCode =
  | "SELLER_NOT_APPROVED"
  | "PAYOUTS_DISABLED_DEMO"
  | "INVALID_AMOUNT"
  | "INSUFFICIENT_AVAILABLE_BALANCE"
  | "OPEN_REQUEST_EXISTS"
  | "UNSUPPORTED_METHOD";

/** Upper bound on a single request, in integer minor units (defensive). */
export const MAX_PAYOUT_CENTS = 100_000_000;

export type PayoutEligibilityInput = {
  sellerStatus: "pending" | "approved" | "rejected" | "suspended";
  /** Sum of provider-settled, available ledger entries (never demo rows). */
  availableCents: number;
  /** Sum of funds already reserved by open requests. */
  reservedCents: number;
  amountCents: number;
  method: PayoutMethod | string;
  hasOpenRequest: boolean;
  /** False until a verified payment provider exists (D-05). */
  payoutsEnabled: boolean;
};

export type PayoutEligibility =
  | { allowed: true; amountCents: number; method: PayoutMethod }
  | { allowed: false; code: PayoutRefusalCode };

export function evaluatePayoutRequest(input: PayoutEligibilityInput): PayoutEligibility {
  if (input.sellerStatus !== "approved") {
    return { allowed: false, code: "SELLER_NOT_APPROVED" };
  }
  if (!input.payoutsEnabled) {
    return { allowed: false, code: "PAYOUTS_DISABLED_DEMO" };
  }
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    input.amountCents > MAX_PAYOUT_CENTS
  ) {
    return { allowed: false, code: "INVALID_AMOUNT" };
  }
  if (!Number.isSafeInteger(input.availableCents) || !Number.isSafeInteger(input.reservedCents)) {
    return { allowed: false, code: "INVALID_AMOUNT" };
  }
  if (!isPayoutMethod(input.method)) {
    return { allowed: false, code: "UNSUPPORTED_METHOD" };
  }
  if (input.hasOpenRequest) {
    return { allowed: false, code: "OPEN_REQUEST_EXISTS" };
  }
  if (input.amountCents > input.availableCents - input.reservedCents) {
    return { allowed: false, code: "INSUFFICIENT_AVAILABLE_BALANCE" };
  }
  return { allowed: true, amountCents: input.amountCents, method: input.method };
}

/** Human-actionable reason for the UI; codes stay machine-readable in APIs. */
export const PAYOUT_REFUSAL_COPY: Readonly<Record<PayoutRefusalCode, { en: string; ar: string }>> = {
  SELLER_NOT_APPROVED: {
    en: "Your seller account must be approved before you can request a payout.",
    ar: "لازم يتم اعتماد حساب التاجر قبل طلب السحب.",
  },
  PAYOUTS_DISABLED_DEMO: {
    en: "Payouts are unavailable because no verified payment provider is connected yet.",
    ar: "السحب غير متاح لأن بوابة الدفع الموثّقة لسه مش متصلة.",
  },
  INVALID_AMOUNT: {
    en: "Enter a valid amount greater than zero.",
    ar: "اكتب مبلغ صحيح أكبر من صفر.",
  },
  INSUFFICIENT_AVAILABLE_BALANCE: {
    en: "The requested amount is higher than your available balance.",
    ar: "المبلغ المطلوب أكبر من رصيدك المتاح.",
  },
  OPEN_REQUEST_EXISTS: {
    en: "You already have a payout request in progress.",
    ar: "عندك طلب سحب شغّال بالفعل.",
  },
  UNSUPPORTED_METHOD: {
    en: "Choose one of the supported payout methods.",
    ar: "اختر طريقة سحب مدعومة.",
  },
};
