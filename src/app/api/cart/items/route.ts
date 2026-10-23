import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, products } from "@/lib/db";
import { addToCartLine } from "@/lib/db/cart-operations";
import { getOrCreateCartId } from "@/lib/security/session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
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
