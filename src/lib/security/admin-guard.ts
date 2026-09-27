import "server-only";
import type { NextRequest } from "next/server";
import { getSessionUser, type SafeUser } from "@/lib/security/auth";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { jsonError, rateLimitedResponse } from "@/lib/http";
import { securityLog } from "@/lib/log";

/**
 * Server-side gate for every admin endpoint.
 *
 * Order of checks:
 *  1. Origin verification for state-changing methods (CSRF)
 *  2. Rate limit
 *  3. Authentication (401)
 *  4. Role check (403) — role comes from the DB row, never from the client
 */
export async function guardAdmin(
  req: NextRequest,
): Promise<{ user: SafeUser } | { response: Response }> {
  const mutating = !["GET", "HEAD"].includes(req.method);

  if (mutating && !verifySameOrigin(req)) {
    return { response: jsonError("Request rejected.", 403) };
  }
  if (!rateLimit(`admin:${clientKey(req)}`, 120, 60_000)) {
    securityLog.rateLimited({ endpoint: "admin", ip: clientKey(req) });
    return { response: rateLimitedResponse() };
  }

  const user = await getSessionUser();
  if (!user) {
    return { response: jsonError("Authentication required.", 401) };
  }
  if (user.role !== "admin") {
    securityLog.authzDenied({
      endpoint: req.nextUrl.pathname,
      userId: user.id,
    });
    return { response: jsonError("Forbidden.", 403) };
  }

  return { user };
}
