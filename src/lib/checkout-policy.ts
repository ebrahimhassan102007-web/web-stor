/**
 * Payment safety policy. This store has no payment provider and cannot verify
 * a charge, so production checkout remains disabled. Non-production checkout
 * may record an explicitly unpaid demo order, but never consumes inventory or
 * claims fulfilment.
 */
export type CheckoutMode = "disabled" | "demo";

export type CheckoutEnv = {
  readonly NODE_ENV?: string | undefined;
};

export const CHECKOUT_DISABLED_STATUS = 503;
export const CHECKOUT_DISABLED_ERROR = "CHECKOUT_DISABLED";
export const DEMO_ORDER_STATUS = "demo-unpaid";

export const PAID_OR_CONFIRMED_STATUSES = ["confirmed", "paid", "completed"] as const;

export function resolveCheckoutMode(
  env: CheckoutEnv = process.env,
): CheckoutMode {
  return env.NODE_ENV === "production" ? "disabled" : "demo";
}

export function isPaidOrConfirmedStatus(status: string): boolean {
  return (PAID_OR_CONFIRMED_STATUSES as readonly string[]).includes(status);
}
