import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, products } from "@/lib/db";
import { addToCartLine } from "@/lib/db/cart-operations";
import { getOrCreateCartId } from "@/lib/security/session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { enforceRateLimit, clientKey } from "@/lib/security/rate-limit";
import { readJsonBody, JSON_BODY_STATUS } from "@/lib/security/read-json";
import { addToCartSchema } from "@/lib/validation";
import { getCartSummary } from "@/lib/cart";
import { jsonOk, jsonError, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

/** POST /api/cart/items — add a product to the cart atomically. */
export async function POST(req: NextRequest) {
  try {
    if (!verifySameOrigin(req)) {
      return jsonError("Request rejected.", 403);
    }
    if (!(await enforceRateLimit("cart", [clientKey(req)], 60, 60_000))) {
      return jsonError("Too many requests. Please slow down.", 429);
    }

    const body = await readJsonBody(req, 8 * 1024);
    if (!body.ok) {
      return jsonError("Invalid request body.", JSON_BODY_STATUS[body.reason]);
    }
    const raw: unknown = body.value;

    const parsed = addToCartSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("Invalid input.", 400, parsed.error.flatten().fieldErrors);
    }
    const { productId, quantity, inputValue } = parsed.data;

    // Preserve the existing not-found response without creating an empty cart.
    // The operation below re-reads and locks this row as the authoritative check.
    const [candidate] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!candidate) return jsonError("PRODUCT_NOT_FOUND", 404);

    const cartId = await getOrCreateCartId();
    if (!(await enforceRateLimit("cart", [`cart:${cartId}`], 60, 60_000))) {
      return jsonError("Too many requests. Please slow down.", 429);
    }
    const result = await addToCartLine(db, {
      cartId,
      productId,
      quantity,
      inputValue,
    });
    if (result.error === "missing") return jsonError("PRODUCT_NOT_FOUND", 404);
    if (result.error === "out-of-stock") return jsonError("OUT_OF_STOCK", 409);

    return jsonOk(await getCartSummary(cartId), { status: 201 });
  } catch (error) {
    return handleUnexpected("cart:add", error);
  }
}
