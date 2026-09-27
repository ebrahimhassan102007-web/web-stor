import "server-only";
import type { NextRequest } from "next/server";

/**
 * CSRF defense-in-depth for state-changing Route Handlers.
 *
 * Primary defense: the cart cookie is SameSite=Lax, so browsers do not attach
 * it to cross-site POST/PATCH/DELETE requests.
 *
 * Secondary defense (this check): the request's Origin header must match the
 * host the request was actually served on. Cross-origin form posts and
 * scripted requests from other sites fail this check.
 */
export function verifySameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  // Same-origin fetches always carry Origin for non-GET methods; a missing
  // Origin on a state-changing request is rejected.
  if (!origin) return false;

  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
