import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, cartItems, products } from "@/lib/db";
import { getOrCreateCartId } from "@/lib/security/session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { addToCartSchema } from "@/lib/validation";
import { getCartSummary } from "@/lib/cart";
import { MAX_QTY_PER_LINE, quantityAfterConcurrentAdd } from "@/lib/db/cart-operations";
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
    const { productId, quantity, inputValue } = parsed.data;

    const cartId = await getOrCreateCartId();

    // Lock the product row to keep the stock ceiling stable, then perform a
    // single atomic upsert. Concurrent adds serialize on this row and the
    // conflict expression increments the latest stored quantity (not a stale
    // quantity read by this request).
    const addResult = await db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id, stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .for("update");

      if (!product) return { error: "missing" as const };
      if (product.stock <= 0) return { error: "stock" as const };

      await tx
        .insert(cartItems)
        .values({
          cartId,
          productId,
          quantity: Math.min(quantity, product.stock, MAX_QTY_PER_LINE),
          inputValue,
        })
        .onConflictDoUpdate({
          target: [cartItems.cartId, cartItems.productId],
          set: {
            quantity: quantityAfterConcurrentAdd(quantity, product.stock),
            // An omitted value preserves the previously entered target.
            ...(inputValue ? { inputValue } : {}),
          },
        });
      return { error: null } as const;
    });

    if (addResult.error === "missing") return jsonError("Product not found.", 404);
    if (addResult.error === "stock") return jsonError("This product is out of stock.", 409);
    return jsonOk(await getCartSummary(cartId), { status: 201 });
  } catch (err) {
    return handleUnexpected("cart:add", err);
  }
}
