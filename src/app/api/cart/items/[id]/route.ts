import type { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, cartItems, carts, products } from "@/lib/db";
import { getExistingCartId } from "@/lib/security/session";
import { guardMutatingRequest, noteRejectedBody } from "@/lib/security/request-guard";
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
    const guard = await guardMutatingRequest(req);
  if (guard) return guard;
    if (!(await enforceRateLimit("cart", [clientKey(req)], 60, 60_000))) {
      return jsonError("Too many requests. Please slow down.", 429);
    }

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("Invalid input.", 400);

    const body = await readJsonBody(req, 4 * 1024);
    if (!body.ok) {
      await noteRejectedBody(req, body);
      return jsonError("Invalid request body.", JSON_BODY_STATUS[body.reason]);
    }
    const raw: unknown = body.value;
    const parsed = updateCartItemSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("Invalid input.", 400, parsed.error.flatten().fieldErrors);
    }

    const cartId = await getExistingCartId();
    if (!cartId) return jsonError("Cart not found.", 404);

    const updated = await db.transaction(async (tx) => {
      const [cart] = await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, cartId)).for("update").limit(1);
      if (!cart) return false;
      const [line] = await tx.select({ id: cartItems.id, productId: cartItems.productId }).from(cartItems)
        .where(and(eq(cartItems.id, idParsed.data), eq(cartItems.cartId, cartId))).for("update").limit(1);
      if (!line) return false;
      const [product] = await tx.select({ stock: products.stock }).from(products).where(eq(products.id, line.productId)).for("update").limit(1);
      if (!product) return false;
      const quantity = Math.min(parsed.data.quantity, product.stock);
      if (quantity <= 0) await tx.delete(cartItems).where(and(eq(cartItems.id, line.id), eq(cartItems.cartId, cartId)));
      else await tx.update(cartItems).set({ quantity }).where(and(eq(cartItems.id, line.id), eq(cartItems.cartId, cartId)));
      return true;
    });
    if (!updated) return jsonError("Cart item not found.", 404);

    return jsonOk(await getCartSummary(cartId));
  } catch (err) {
    return handleUnexpected("cart:update", err);
  }
}

/** DELETE /api/cart/items/:id — remove a line. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const guard = await guardMutatingRequest(req);
  if (guard) return guard;
    if (!(await enforceRateLimit("cart", [clientKey(req)], 60, 60_000))) {
      return jsonError("Too many requests. Please slow down.", 429);
    }

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("Invalid input.", 400);

    const cartId = await getExistingCartId();
    if (!cartId) return jsonError("Cart not found.", 404);

    await db.transaction(async (tx) => {
      await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, cartId)).for("update").limit(1);
      await tx.delete(cartItems).where(and(eq(cartItems.id, idParsed.data), eq(cartItems.cartId, cartId)));
    });

    return jsonOk(await getCartSummary(cartId));
  } catch (err) {
    return handleUnexpected("cart:delete", err);
  }
}
