import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { enforceAuthRateLimit } from "@/lib/security/auth-rate-limit";
import { recordSecurityEvent } from "@/lib/security/audit-log";
import { db } from "@/lib/db";
import { revealOrderCodesInTransaction } from "@/lib/security/fulfillment-vault";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ orderId: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, context: Context) {
  if (!verifySameOrigin(request)) return jsonError("REQUEST_REJECTED", 403);
  const user = await getCurrentAccountUser();
  if (!user) return jsonError("AUTH_REQUIRED", 401);
  const { orderId } = await context.params;
  if (!UUID_RE.test(orderId)) return jsonError("ORDER_NOT_FOUND", 404);
  try {
    if (!(await enforceAuthRateLimit(request, "fulfillment-reveal", user.email, { windowMs: 10 * 60_000, ipLimit: 8, emailLimit: 5 }))) {
      return jsonError("RATE_LIMITED", 429);
    }
    const codes = await db.transaction((tx) => revealOrderCodesInTransaction(tx, orderId, user.id));
    if (!codes.length) return jsonError("ORDER_NOT_FOUND", 404);
    await recordSecurityEvent("fulfillment_code_revealed", user.id, `${codes.length} code(s)`);
    return jsonOk({ codes });
  } catch (error) {
    if (error instanceof Error && error.message === "FULFILLMENT_ALREADY_REVEALED") {
      return jsonError("FULFILLMENT_ALREADY_REVEALED", 409);
    }
    return jsonError("FULFILLMENT_UNAVAILABLE", 503);
  }
}
