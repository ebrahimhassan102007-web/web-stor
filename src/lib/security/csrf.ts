import "server-only";
import type { NextRequest } from "next/server";
import { configuredOrigin, isAllowedOrigin } from "./origin";

/**
 * CSRF defense-in-depth for state-changing Route Handlers.
 *
 * Primary defense: the cart cookie is `SameSite=Lax`, so browsers do not
 * attach it to cross-site POST/PATCH/DELETE requests.
 *
 * Secondary defense (this check): the request's `Origin` header must match a
 * trusted origin.
 *  - Production: the exact `APP_ORIGIN` from configuration. When it is
 *    missing or malformed the request is rejected (fail closed).
 *  - Development: the `Host` the request was served on. `X-Forwarded-Host` is
 *    never trusted because any client can set it.
 */
export function verifySameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;

  const expected = configuredOrigin();
  if (expected) return isAllowedOrigin(origin, expected);

  // No configured origin: only development may fall back to the request Host.
  if (process.env.NODE_ENV === "production") return false;

  const host = req.headers.get("host");
  if (!host) return false;

  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    return parsed.host === host;
  } catch {
    return false;
  }
}
