import type { NextRequest } from "next/server";
import { jsonError, jsonOk, handleUnexpected } from "@/lib/http";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { guardMutatingRequest } from "@/lib/security/request-guard";
import { enforceAuthRateLimit } from "@/lib/security/auth-rate-limit";
import { recordSecurityEvent } from "@/lib/security/audit-log";
import { db } from "@/lib/db";
import { shredOrderVaultInTransaction } from "@/lib/security/vault-shred";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ orderId: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cryptographic burn-after-reveal (S-26).
 *
 * The buyer destroys the stored ciphertext, wrapped DEK and every wrapping
 * field of an order they already revealed. The row survives with an immutable
 * delivery digest and both timestamps; the code itself is unrecoverable.
 *
 * Idempotent: shredding twice reports `alreadyShredded` instead of failing, so
 * a double-click or retry cannot corrupt state.
 */
export async function POST(request: NextRequest, context: Context) {
  const guard = await guardMutatingRequest(request);
  if (guard) return guard;

  const user = await getCurrentAccountUser();
  if (!user) return jsonError("AUTH_REQUIRED", 401);

  const { orderId } = await context.params;
  if (!UUID_RE.test(orderId)) return jsonError("ORDER_NOT_FOUND", 404);

  try {
    if (
      !(await enforceAuthRateLimit(request, "fulfillment-shred", user.email, {
        windowMs: 10 * 60_000,
        ipLimit: 10,
        emailLimit: 6,
      }))
    ) {
      return jsonError("RATE_LIMITED", 429);
    }

    const outcome = await db.transaction((tx) =>
      shredOrderVaultInTransaction(tx, { orderId, userId: user.id }),
    );
    if (!outcome.ok) {
      return outcome.error === "NOT_REVEALED"
        ? jsonError("FULFILLMENT_NOT_REVEALED", 409)
        : jsonError("ORDER_NOT_FOUND", 404);
    }

    if (outcome.shredded > 0) {
      await recordSecurityEvent(
        "fulfillment_code_shredded",
        user.id,
        `${outcome.shredded} code(s)`,
      );
    }
    return jsonOk({
      shredded: outcome.shredded,
      alreadyShredded: outcome.alreadyShredded,
    });
  } catch (error) {
    return handleUnexpected("fulfillment-shred", error);
  }
}
