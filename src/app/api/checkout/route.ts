import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { recordDemoOrder } from "@/lib/db/demo-order";
import { jsonError, jsonOk, handleUnexpected } from "@/lib/http";
import { resolveCheckoutMode, CHECKOUT_DISABLED_ERROR, CHECKOUT_DISABLED_STATUS } from "@/lib/checkout-policy";
import { getExistingCartId } from "@/lib/security/session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { enforceRateLimit, clientKey } from "@/lib/security/rate-limit";
import { readJsonBody, JSON_BODY_STATUS } from "@/lib/security/read-json";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { checkoutSchema } from "@/lib/validation";
import { getAuthSecret } from "@/lib/security/auth-core";
import { isClientIdempotencyKey, scopedCheckoutIdempotencyDigest } from "@/lib/marketplace/idempotency";

export const dynamic = "force-dynamic";

/**
 * Production has no verified payment provider, so it fails closed before
 * reading the request or touching the cart/database. Development records an
 * unpaid demo order without delivering fake codes, decrementing stock, or
 * deleting the cart.
 */
export async function POST(req: NextRequest) {
  try {
    if (resolveCheckoutMode() === "disabled") {
      return jsonError(CHECKOUT_DISABLED_ERROR, CHECKOUT_DISABLED_STATUS);
    }

    if (!verifySameOrigin(req)) return jsonError("REQUEST_REJECTED", 403);
    if (!(await enforceRateLimit("checkout", [clientKey(req)], 10, 60_000))) {
      return jsonError("RATE_LIMITED", 429);
    }

    const body = await readJsonBody(req, 16 * 1024);
    if (!body.ok) return jsonError("INVALID_BODY", JSON_BODY_STATUS[body.reason]);
    const raw: unknown = body.value;

    const parsed = checkoutSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        "INVALID_INPUT",
        400,
        parsed.error.flatten().fieldErrors,
      );
    }

    const cartId = await getExistingCartId();
    if (!cartId) return jsonError("CART_EMPTY", 400);

    if (!(await enforceRateLimit("checkout", [`cart:${cartId}`], 10, 60_000))) {
      return jsonError("RATE_LIMITED", 429);
    }
    const clientIdempotencyKey = req.headers.get("idempotency-key");
    if (!isClientIdempotencyKey(clientIdempotencyKey)) return jsonError("IDEMPOTENCY_KEY_REQUIRED", 400);

    // S-08: ownership comes from the signed-in session, never from the
    // email typed into the form. Guest keys are scoped to their verified cart.
    const accountUser = await getCurrentAccountUser().catch(() => null);
    const idempotencyKey = scopedCheckoutIdempotencyDigest(
      accountUser?.id ?? `guest-cart:${cartId}`,
      clientIdempotencyKey,
      getAuthSecret(),
    );
    const result = await recordDemoOrder(db, {
      cartId,
      userId: accountUser?.id ?? null,
      idempotencyKey,
      shipping: parsed.data,
    });
    if (result.status === "empty") return jsonError("CART_EMPTY", 400);
    if (result.status === "insufficient-stock") {
      return jsonError("INSUFFICIENT_STOCK", 409, {
        productName: [result.productName],
      });
    }
    if (result.status === "invalid-target") return jsonError("INVALID_FULFILLMENT_TARGET", 400);

    return jsonOk(
      { orderNumber: result.orderNumber, totalCents: result.totalCents, replayed: result.status === "replayed" },
      { status: result.status === "replayed" ? 200 : 201 },
    );
  } catch (error) {
    return handleUnexpected("checkout", error);
  }
}
