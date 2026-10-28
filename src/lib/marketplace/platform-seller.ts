/**
 * The single platform-owned seller profile.
 *
 * E-Vora sells some catalogue items itself. Rather than special-casing "no
 * seller" in every report, orders and ledger rows reference this system
 * profile (DECISIONS D-11):
 *
 *  - it has no `user_id`, so it can never be signed into;
 *  - it is created by migration `0004_marketplace_identity` with a
 *    deterministic id, and a partial unique index guarantees only one exists;
 *  - platform lines are recorded with a 0 bps rate, so E-Vora books no
 *    commission against itself (`PLATFORM_OWNED_COMMISSION_BPS`).
 *
 * This constant is exported so tests and server code share the same id. It is
 * never accepted from a request.
 */
export const PLATFORM_SELLER_ID = "e0e0e0e0-0000-4000-8000-000000000001";
export const PLATFORM_SELLER_SLUG = "e-vora-platform";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlatformSeller(sellerId: string | null | undefined): boolean {
  return sellerId === PLATFORM_SELLER_ID;
}

/** Accepts only canonical UUID text; used to validate route parameters. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
