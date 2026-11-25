import "server-only";
import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/security/csrf";
import { activeBanForRequest, recordThreat } from "@/lib/security/threat-shield";
import { clearAccountSession } from "@/lib/security/account-session";
import type { JsonBodyResult } from "@/lib/security/read-json";

/**
 * Central mutation guard (S-25).
 *
 * Every state-changing API route runs the same two checks before touching
 * data:
 *
 *  1. **CSRF/origin** — a forged cross-origin mutation is a tier-1 signal, so
 *     the actor is recorded and banned on the spot.
 *  2. **Active ban** — a banned actor is refused with the same generic payload
 *     a CSRF failure produces, so the response never reveals which control
 *     caught them.
 *
 * Both failures return `403` with `Cache-Control: private, no-store`.
 */
export function rejectionResponse(): NextResponse {
  return NextResponse.json(
    { ok: false as const, error: "REQUEST_REJECTED" },
    {
      status: 403,
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
        Vary: "Cookie",
      },
    },
  );
}

/**
 * Returns a response to send, or `null` when the request may proceed.
 *
 * A ban lookup that fails (database blip) does not block the request: the
 * handler's own query will fail closed immediately afterwards, and locking the
 * whole storefront out on a transient read error would be worse than letting a
 * banned actor through for one request.
 */
export async function guardMutatingRequest(
  request: Request,
): Promise<NextResponse | null> {
  if (!verifySameOrigin(request as Parameters<typeof verifySameOrigin>[0])) {
    await recordThreat(request, "csrf_forgery");
    return rejectionResponse();
  }

  try {
    if (await activeBanForRequest(request)) return rejectionResponse();
  } catch {
    // See above: fail open on the *lookup*, the handler still fails closed.
  }

  return null;
}

/** Record a rejected body that carried prototype-mutating keys (tier 1). */
export async function noteRejectedBody(
  request: Request,
  body: JsonBodyResult,
): Promise<void> {
  if (!body.ok && body.reason === "prototype-pollution") {
    await recordThreat(request, "prototype_pollution");
  }
}

/**
 * Honeypot handling: the field is invisible to humans and only automation
 * fills it in, so a non-empty value is a tier-1 signal. Any session the actor
 * already had is revoked as well, so a bot that got in earlier loses its
 * footing immediately.
 */
export async function rejectHoneypot(request: Request): Promise<NextResponse> {
  await recordThreat(request, "honeypot");
  try {
    await clearAccountSession();
  } catch {
    // No cookie store (non-request context) — the ban still applies.
  }
  return rejectionResponse();
}
