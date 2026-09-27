import type { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, cartItems, products } from "@/lib/db";
import type { ProductType } from "@/lib/db/schema";
import { getOrCreateCartId } from "@/lib/security/session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { addToCartSchema, MAX_LINE_QTY } from "@/lib/validation";
import { validateCustomerInputs } from "@/lib/product-fields";
import { getCartSummary } from "@/lib/cart";
import { jsonOk, jsonError, rateLimitedResponse, readJsonBody, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

/** POST /api/cart/items — add a product to the cart. */
export async function POST(req: NextRequest) {
  try {
    if (!verifySameOrigin(req)) {
      return jsonError("تم رفض الطلب.", 403);
    }
    if (!rateLimit(`cart:${clientKey(req)}`, 60, 60_000)) {
      return rateLimitedResponse();
    }

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("طلب غير صالح.", 400);

    const parsed = addToCartSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("بيانات غير صالحة.", 400, parsed.error.flatten().fieldErrors);
    }
    const { productId, quantity } = parsed.data;

    // Product must exist, be active and have stock.
    const [product] = await db
      .select({
        id: products.id,
        stock: products.stock,
        active: products.active,
        type: products.type,
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product || !product.active) {
      return jsonError("المنتج غير متوفر.", 404);
    }
    if (product.stock <= 0) {
      return jsonError("هذا المنتج غير متوفر حالياً.", 409);
    }

    // Server-side validation of per-type customer inputs (player id, phone…).
    const inputs = validateCustomerInputs(
      product.type as ProductType,
      parsed.data.customerInputs ?? {},
    );
    if (inputs === null) {
      return jsonError("يرجى إدخال البيانات المطلوبة بشكل صحيح.", 400);
    }

    const cartId = await getOrCreateCartId();

    const [existing] = await db
      .select({ id: cartItems.id, quantity: cartItems.quantity })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)))
      .limit(1);

    const target = Math.min(
      (existing?.quantity ?? 0) + quantity,
      product.stock,
      MAX_LINE_QTY,
    );

    if (existing) {
      await db
        .update(cartItems)
        .set({ quantity: target, customerInputs: inputs })
        .where(eq(cartItems.id, existing.id));
    } else {
      await db
        .insert(cartItems)
        .values({ cartId, productId, quantity: target, customerInputs: inputs })
        .onConflictDoNothing();
    }

    return jsonOk(await getCartSummary(cartId), { status: 201 });
  } catch (err) {
    return handleUnexpected("cart:add", err);
  }
}
