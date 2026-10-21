import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateCartId } from "@/lib/security/session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { addToCartSchema } from "@/lib/validation";
import { getCartSummary } from "@/lib/cart";
import { addToCartLine } from "@/lib/db/cart-operations";
import { jsonOk, jsonError, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

/** POST /api/cart/items — add a product to the cart. */
export async function POST(req: NextRequest) {
  try {
    if (!verifySameOrigin(req)) {
      return jsonError("Request rejected.", 403);
    }
    if (!rateLimit(`cart:${clientKey(req)}`, 60, 60_000)) {
      return jsonError("Too many requests. Please slow down.", 429);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError("Invalid request body.", 400);
    }

    const parsed = addToCartSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("Invalid input.", 400, parsed.error.flatten().fieldErrors);
    }
    const { productId, quantity } = parsed.data;

    const cartId = await getOrCreateCartId();

    // Single atomic upsert inside a transaction; see addToCartLine. Concurrent
    // adds serialize on the locked product row and the conflict branch
    // increments the stored quantity, so no increment is ever lost.
    const outcome = await addToCartLine(db, { cartId, productId, quantity });

    if (outcome.error === "missing") {
      return jsonError("Product not found.", 404);
    }
    if (outcome.error === "out-of-stock") {
      return jsonError("This product is out of stock.", 409);
    }

    return jsonOk(await getCartSummary(cartId), { status: 201 });
  } catch (err) {
    return handleUnexpected("cart:add", err);
  }
}
