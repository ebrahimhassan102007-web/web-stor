import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getExistingCartId } from "@/lib/security/session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { checkoutSchema } from "@/lib/validation";
import { recordDemoOrder } from "@/lib/db/demo-order";
import {
  CHECKOUT_DISABLED_MESSAGE,
  CHECKOUT_DISABLED_STATUS,
  resolveCheckoutMode,
} from "@/lib/checkout-policy";
import { jsonOk, jsonError, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/checkout
 *
 * Production fails closed: this application has no payment provider, so it
 * cannot verify payment. Until a verified integration exists, production
 * returns 503 as the **first** statement of the handler — before the request
 * body is read, before the cart is loaded and before any order row, stock
 * update or cart deletion could happen.
 *
 * Outside production the same endpoint records an explicitly unpaid demo order
 * (`status = demo-unpaid`) for manual storefront testing:
 *  - prices/totals are computed exclusively from the database,
 *  - stock is never decremented and the cart is never destroyed,
 *  - the receipt shows the reference only and states that nothing was paid.
 */
export async function POST(req: NextRequest) {
  try {
    // Fail-closed production guard. Keep this first: no other work may run.
    if (resolveCheckoutMode() === "disabled") {
      return jsonError(CHECKOUT_DISABLED_MESSAGE, CHECKOUT_DISABLED_STATUS);
    }

    if (!verifySameOrigin(req)) return jsonError("Request rejected.", 403);
    if (!rateLimit(`checkout:${clientKey(req)}`, 10, 60_000)) {
      return jsonError("Too many requests. Please slow down.", 429);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError("Invalid request body.", 400);
    }

    const parsed = checkoutSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        "Please review the highlighted fields.",
        400,
        parsed.error.flatten().fieldErrors,
      );
    }

    const cartId = await getExistingCartId();
    if (!cartId) return jsonError("Your cart is empty.", 400);

    const result = await recordDemoOrder(db, {
      cartId,
      shipping: parsed.data,
    });

    if (result.status === "empty") {
      return jsonError("Your cart is empty.", 400);
    }
    if (result.status === "insufficient-stock") {
      return jsonError(
        `Insufficient stock for "${result.productName}". Please adjust your cart.`,
        409,
      );
    }

    return jsonOk(
      { orderNumber: result.orderNumber, totalCents: result.totalCents },
      { status: 201 },
    );
  } catch (err) {
    return handleUnexpected("checkout", err);
  }
}
