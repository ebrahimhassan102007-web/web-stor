import type { NextRequest } from "next/server";
import { eq, and, gte, sql } from "drizzle-orm";
import {
  db,
  carts,
  cartItems,
  products,
  orders,
  orderItems,
} from "@/lib/db";
import {
  getExistingCartId,
  clearCartCookie,
} from "@/lib/security/session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { checkoutSchema } from "@/lib/validation";
import { shippingFor } from "@/lib/money";
import { newOrderNumber } from "@/lib/order-number";
import { jsonOk, jsonError, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/checkout
 *
 * Creates an order from the session cart inside a single transaction:
 *  - prices and totals are computed exclusively from the database (the
 *    client can never dictate a price),
 *  - stock is decremented atomically with a `stock >= qty` guard so two
 *    simultaneous checkouts can never oversell,
 *  - the cart is destroyed and the session cookie cleared on success.
 */
export async function POST(req: NextRequest) {
  try {
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
    const shipping = parsed.data;

    const cartId = await getExistingCartId();
    if (!cartId) return jsonError("Your cart is empty.", 400);

    type CheckoutResult =
      | { error: string }
      | { order: { orderNumber: string; totalCents: number } };

    const result = await db.transaction(async (tx): Promise<CheckoutResult> => {
      // Load cart lines with authoritative prices, locking product rows.
      const lines = await tx
        .select({
          productId: cartItems.productId,
          quantity: cartItems.quantity,
          name: products.name,
          priceCents: products.priceCents,
          stock: products.stock,
        })
        .from(cartItems)
        .innerJoin(products, eq(cartItems.productId, products.id))
        .where(eq(cartItems.cartId, cartId))
        .for("update");

      if (lines.length === 0) {
        return { error: "Your cart is empty." };
      }

      for (const line of lines) {
        if (line.quantity > line.stock) {
          return {
            error: `Insufficient stock for "${line.name}". Please adjust your cart.`,
          };
        }
      }

      const subtotalCents = lines.reduce(
        (s, l) => s + l.priceCents * l.quantity,
        0,
      );
      const shippingCents = shippingFor(subtotalCents);
      const totalCents = subtotalCents + shippingCents;

      // Atomic stock decrement, guarded against underflow.
      for (const line of lines) {
        const updated = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${line.quantity}` })
          .where(
            and(
              eq(products.id, line.productId),
              gte(products.stock, line.quantity),
            ),
          )
          .returning({ id: products.id });
        if (updated.length === 0) {
          throw new Error(`stock-conflict:${line.productId}`);
        }
      }

      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber: newOrderNumber(),
          status: "confirmed",
          customerName: shipping.customerName,
          email: shipping.email,
          addressLine1: shipping.addressLine1,
          addressLine2: shipping.addressLine2,
          city: shipping.city,
          postalCode: shipping.postalCode,
          country: shipping.country,
          subtotalCents,
          shippingCents,
          totalCents,
        })
        .returning({ id: orders.id, orderNumber: orders.orderNumber });

      await tx.insert(orderItems).values(
        lines.map((l) => ({
          orderId: order.id,
          productId: l.productId,
          productName: l.name,
          unitPriceCents: l.priceCents,
          quantity: l.quantity,
        })),
      );

      // Destroy the cart (cascade removes its items).
      await tx.delete(carts).where(eq(carts.id, cartId));

      return { order: { orderNumber: order.orderNumber, totalCents } };
    });

    if ("error" in result) return jsonError(result.error, 409);

    await clearCartCookie();
    return jsonOk(result.order, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("stock-conflict:")) {
      return jsonError(
        "An item in your cart just sold out. Please review your cart.",
        409,
      );
    }
    return handleUnexpected("checkout", err);
  }
}
