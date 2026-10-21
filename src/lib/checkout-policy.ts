/**
 * Checkout policy.
 *
 * This project has **no payment provider**, so it cannot verify that a
 * customer actually paid. Recording a paid/confirmed order without verified
 * payment would let a deployed store hand out goods for free, consume real
 * inventory and issue order references that look settled. Therefore:
 *
 *  - in production, checkout fails closed (HTTP 503) before reading or
 *    mutating anything;
 *  - outside production, checkout records an explicitly unpaid demo order so
 *    the storefront can still be exercised manually. Demo checkouts never
 *    decrement stock and never use a paid/confirmed status.
 *
 * A future phase must add a real provider integration with server-side
 * payment verification (e.g. verified webhooks or a payment-intent status
 * check) and only then re-enable production checkout — restoring an atomic,
 * payment-guarded stock decrement inside that verified transaction.
 *
 * The module is dependency-free so the policy is unit tested directly.
 */

export type CheckoutMode = "disabled" | "demo";

export type CheckoutEnv = {
  readonly NODE_ENV?: string | undefined;
};

/** HTTP status returned when checkout is disabled. */
export const CHECKOUT_DISABLED_STATUS = 503;

/** Non-sensitive message: no internals, no stack, no configuration detail. */
export const CHECKOUT_DISABLED_MESSAGE =
  "Checkout is currently unavailable. This store cannot accept orders until payment can be verified.";

/**
 * Status stored for demo orders. It deliberately does not use the schema
 * default (`confirmed`) because nothing was paid or confirmed.
 */
export const DEMO_ORDER_STATUS = "demo-unpaid";

/** Statuses that would imply a paid or settled order. */
export const PAID_OR_CONFIRMED_STATUSES = ["confirmed", "paid", "completed"] as const;

/** `disabled` in production — checkout has no payment provider. */
export function resolveCheckoutMode(env: CheckoutEnv = process.env): CheckoutMode {
  return env.NODE_ENV === "production" ? "disabled" : "demo";
}

/** True when a status would claim payment/settlement that never happened. */
export function isPaidOrConfirmedStatus(status: string): boolean {
  return (PAID_OR_CONFIRMED_STATUSES as readonly string[]).includes(status);
}
