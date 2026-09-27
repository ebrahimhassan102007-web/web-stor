import type { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, cartItems, products } from "@/lib/db";
import { getExistingCartId } from "@/lib/security/session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { updateCartItemSchema, cartItemIdSchema, MAX_LINE_QTY } from "@/lib/validation";
import { getCartSummary } from "@/lib/cart";
import { jsonOk, jsonError, rateLimitedResponse, readJsonBody, handleUnexpected } from "@/lib/http";

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
    if (!verifySameOrigin(req)) return jsonError("تم رفض الطلب.", 403);
    if (!rateLimit(`cart:${clientKey(req)}`, 60, 60_000)) {
      return rateLimitedResponse();
    }

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("بيانات غير صالحة.", 400);

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("طلب غير صالح.", 400);

    const parsed = updateCartItemSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("بيانات غير صالحة.", 400, parsed.error.flatten().fieldErrors);
    }

    const cartId = await getExistingCartId();
    if (!cartId) return jsonError("السلة غير موجودة.", 404);

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

    if (!line) return jsonError("العنصر غير موجود.", 404);

    const quantity = Math.min(parsed.data.quantity, line.stock, MAX_LINE_QTY);
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
    if (!verifySameOrigin(req)) return jsonError("تم رفض الطلب.", 403);
    if (!rateLimit(`cart:${clientKey(req)}`, 60, 60_000)) {
      return rateLimitedResponse();
    }

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("بيانات غير صالحة.", 400);

    const cartId = await getExistingCartId();
    if (!cartId) return jsonError("السلة غير موجودة.", 404);

    await db
      .delete(cartItems)
      .where(and(eq(cartItems.id, idParsed.data), eq(cartItems.cartId, cartId)));

    return jsonOk(await getCartSummary(cartId));
  } catch (err) {
    return handleUnexpected("cart:delete", err);
  }
}
