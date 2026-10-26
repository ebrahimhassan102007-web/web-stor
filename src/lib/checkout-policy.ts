/**
 * Payment safety policy (S-11). This store has no payment provider and cannot
 * verify a charge, so checkout is controlled by an explicit `CHECKOUT_MODE`
 * environment variable instead of `NODE_ENV` alone:
 *
 *  - `CHECKOUT_MODE=demo`     → record explicitly unpaid demo orders, but
 *                               ONLY when the app is not production and
 *                               APP_ORIGIN is not a public https origin.
 *  - `CHECKOUT_MODE=disabled` → always disabled (also the production default).
 *  - unset                    → demo in local development only; disabled in
 *                               production (fail closed).
 *
 * A staging deploy with NODE_ENV unset can therefore no longer silently
 * accept orders on a public origin.
 */
export type CheckoutMode = "disabled" | "demo";

export type CheckoutEnv = {
  readonly NODE_ENV?: string | undefined;
  readonly CHECKOUT_MODE?: string | undefined;
  readonly APP_ORIGIN?: string | undefined;
};

export const CHECKOUT_DISABLED_STATUS = 503;
export const CHECKOUT_DISABLED_ERROR = "CHECKOUT_DISABLED";
export const DEMO_ORDER_STATUS = "demo-unpaid";

export const PAID_OR_CONFIRMED_STATUSES = ["confirmed", "paid", "completed"] as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** True when APP_ORIGIN points at a publicly reachable https origin. */
export function isPublicHttpsOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return false;
    return !LOCAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    // A malformed origin is treated as unsafe for demo mode.
    return true;
  }
}

export function resolveCheckoutMode(env: CheckoutEnv = process.env): CheckoutMode {
  const explicit = env.CHECKOUT_MODE?.trim().toLowerCase();
  const demoSafeHere =
    env.NODE_ENV !== "production" && !isPublicHttpsOrigin(env.APP_ORIGIN);

  if (explicit === "disabled") return "disabled";
  if (explicit === "demo") return demoSafeHere ? "demo" : "disabled";
  // Unknown explicit values fail closed in production-like contexts only;
  // in local dev an unset/misspelled value keeps the demo usable for tests.
  if (explicit) return demoSafeHere ? "demo" : "disabled";
  return env.NODE_ENV === "production" ? "disabled" : demoSafeHere ? "demo" : "disabled";
}

export function isPaidOrConfirmedStatus(status: string): boolean {
  return (PAID_OR_CONFIRMED_STATUSES as readonly string[]).includes(status);
}
