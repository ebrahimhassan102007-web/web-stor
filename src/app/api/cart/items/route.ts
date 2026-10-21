import type { NextRequest } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db, cartItems, products } from "@/lib/db";
import { getOrCreateCartId } from "@/lib/security/session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { addToCartSchema } from "@/lib/validation";
import { getCartSummary } from "@/lib/cart";
import { jsonOk, jsonError, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

const MAX_QTY_PER_LINE = 99;

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

    // Product must exist and have stock.
    const [product] = await db
      .select({ id: products.id, stock: products.stock })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product) return jsonError("Product not found.", 404);
    if (product.stock <= 0) return jsonError("This product is out of stock.", 409);

    const cartId = await getOrCreateCartId();

    // Upsert the line, clamping to available stock and per-line max.
    const [existing] = await db
      .select({ id: cartItems.id, quantity: cartItems.quantity })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)))
      .limit(1);

    const target = Math.min(
      (existing?.quantity ?? 0) + quantity,
      product.stock,
      MAX_QTY_PER_LINE,
    );

    if (existing) {
      await db
        .update(cartItems)
        .set({
          quantity: target,
          // Keep the previously entered delivery input when the latest
          // add doesn't provide a new one.
          ...(inputValue ? { inputValue } : {}),
        })
        .where(eq(cartItems.id, existing.id));
    } else {
      await db
        .insert(cartItems)
        .values({ cartId, productId, quantity: target, inputValue })
        .onConflictDoUpdate({
          target: [cartItems.cartId, cartItems.productId],
          set: { quantity: sql`excluded.quantity` },
        });
    }

    return jsonOk(await getCartSummary(cartId), { status: 201 });
  } catch (err) {
    return handleUnexpected("cart:add", err);
  }
}
