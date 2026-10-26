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
    // S-08: ownership comes from the signed-in session, never from the
    // email typed into the form.
    const accountUser = await getCurrentAccountUser().catch(() => null);
    const result = await recordDemoOrder(db, {
      cartId,
      userId: accountUser?.id ?? null,
      shipping: parsed.data,
    });
    if (result.status === "empty") return jsonError("CART_EMPTY", 400);
    if (result.status === "insufficient-stock") {
      return jsonError("INSUFFICIENT_STOCK", 409, {
        productName: [result.productName],
      });
    }

    return jsonOk(
      { orderNumber: result.orderNumber, totalCents: result.totalCents },
      { status: 201 },
    );
  } catch (error) {
    return handleUnexpected("checkout", error);
  }
}
