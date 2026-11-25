import type { NextRequest } from "next/server";
import { jsonError, jsonOk, handleUnexpected } from "@/lib/http";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { guardMutatingRequest } from "@/lib/security/request-guard";
import { enforceAuthRateLimit } from "@/lib/security/auth-rate-limit";
import { recordSecurityEvent } from "@/lib/security/audit-log";
import { readAuthJson } from "@/lib/security/auth-http";
import { db } from "@/lib/db";
import { createOrderDisputeInTransaction, orderDisputeSchema } from "@/lib/marketplace/disputes";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ orderId: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Buyer order dispute (S-26).
 *
 * Ownership is checked inside the transaction (`orders.user_id = session user`),
 * the order must be paid/fulfilled/completed, and at most one `open` dispute can
 * exist per order. Opening a dispute immediately freezes the seller's escrow
 * eligibility for that order (`payout-policy.ts`).
 */
export async function POST(request: NextRequest, context: Context) {
  const guard = await guardMutatingRequest(request);
  if (guard) return guard;

  const user = await getCurrentAccountUser();
  if (!user) return jsonError("AUTH_REQUIRED", 401);

  const { orderId } = await context.params;
  if (!UUID_RE.test(orderId)) return jsonError("ORDER_NOT_FOUND", 404);

  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = orderDisputeSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);

  try {
    if (
      !(await enforceAuthRateLimit(request, "order-dispute", user.email, {
        windowMs: 60 * 60 * 1000,
        ipLimit: 10,
        emailLimit: 5,
      }))
    ) {
      return jsonError("RATE_LIMITED", 429);
    }

    const outcome = await db.transaction((tx) =>
      createOrderDisputeInTransaction(tx, {
        orderId,
        userId: user.id,
        reason: parsed.data.reason,
        details: parsed.data.details ?? "",
      }),
    );
    if (!outcome.ok) {
      const status =
        outcome.error === "ORDER_NOT_FOUND" ? 404 : outcome.error === "ORDER_NOT_DISPUTABLE" ? 409 : 409;
      return jsonError(outcome.error, status);
    }

    await recordSecurityEvent("order_dispute_opened", user.id, outcome.disputeId);
    return jsonOk({ disputeId: outcome.disputeId, status: outcome.status }, { status: 201 });
  } catch (error) {
    return handleUnexpected("order-dispute", error);
  }
}
