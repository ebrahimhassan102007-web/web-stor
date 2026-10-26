import type { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, cartItems, products } from "@/lib/db";
import { getExistingCartId } from "@/lib/security/session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { enforceRateLimit, clientKey } from "@/lib/security/rate-limit";
import { readJsonBody, JSON_BODY_STATUS } from "@/lib/security/read-json";
import { updateCartItemSchema, cartItemIdSchema } from "@/lib/validation";
import { getCartSummary } from "@/lib/cart";
import { jsonOk, jsonError, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Ownership is always enforced: every mutation is scoped to the cart id from
 * the verified session cookie, so one visitor can never touch another
 * visitor's cart lines (no IDOR).
 */

/** PATCH /api/cart/items/:id — set quantity (0 removes the line). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    if (!verifySameOrigin(req)) return jsonError("Request rejected.", 403);
    if (!(await enforceRateLimit("cart", [clientKey(req)], 60, 60_000))) {
      return jsonError("Too many requests. Please slow down.", 429);
    }

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("Invalid input.", 400);

    const body = await readJsonBody(req, 4 * 1024);
    if (!body.ok) {
      return jsonError("Invalid request body.", JSON_BODY_STATUS[body.reason]);
    }
    const raw: unknown = body.value;
    const parsed = updateCartItemSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("Invalid input.", 400, parsed.error.flatten().fieldErrors);
    }

    const cartId = await getExistingCartId();
    if (!cartId) return jsonError("Cart not found.", 404);

    const [line] = await db
      .select({
        id: cartItems.id,
        productId: cartItems.productId,
        stock: products.stock,
      })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(and(eq(cartItems.id, idParsed.data), eq(cartItems.cartId, cartId)))
      .limit(1);

    if (!line) return jsonError("Cart item not found.", 404);

    const quantity = Math.min(parsed.data.quantity, line.stock);
    if (quantity <= 0) {
      await db
        .delete(cartItems)
        .where(and(eq(cartItems.id, line.id), eq(cartItems.cartId, cartId)));
    } else {
      await db
        .update(cartItems)
        .set({ quantity })
        .where(and(eq(cartItems.id, line.id), eq(cartItems.cartId, cartId)));
    }

    return jsonOk(await getCartSummary(cartId));
  } catch (err) {
    return handleUnexpected("cart:update", err);
  }
}

/** DELETE /api/cart/items/:id — remove a line. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    if (!verifySameOrigin(req)) return jsonError("Request rejected.", 403);
    if (!(await enforceRateLimit("cart", [clientKey(req)], 60, 60_000))) {
      return jsonError("Too many requests. Please slow down.", 429);
    }

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("Invalid input.", 400);

    const cartId = await getExistingCartId();
    if (!cartId) return jsonError("Cart not found.", 404);

    await db
      .delete(cartItems)
      .where(and(eq(cartItems.id, idParsed.data), eq(cartItems.cartId, cartId)));

    return jsonOk(await getCartSummary(cartId));
  } catch (err) {
    return handleUnexpected("cart:delete", err);
  }
}
