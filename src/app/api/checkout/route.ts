import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
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
import { getSessionUser } from "@/lib/security/auth";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { checkoutSchema } from "@/lib/validation";
import { shippingFor } from "@/lib/money";
import { jsonOk, jsonError, rateLimitedResponse, readJsonBody, handleUnexpected } from "@/lib/http";
import { securityLog } from "@/lib/log";

export const dynamic = "force-dynamic";

function newOrderNumber(): string {
  // WS-XXXXXXXXXX — unguessable (~49 bits), uppercase, no ambiguous chars.
  const alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = randomBytes(10);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `WS-${s}`;
}

/**
 * POST /api/checkout
 *
 * Creates an order from the session cart inside a single transaction:
 *  - prices and totals are computed exclusively from the database (the
 *    client can never dictate a price, discount or total),
 *  - stock is decremented atomically with a `stock >= qty` guard (plus a
 *    database CHECK constraint) so concurrent checkouts can never oversell,
 *  - inactive products abort the checkout,
 *  - a client-minted idempotency key (unique index) makes replayed or
 *    double-submitted checkouts return the original order,
 *  - the order is bound to the authenticated user when one exists,
 *  - the cart is destroyed and the session cookie cleared on success.
 */
export async function POST(req: NextRequest) {
  let idemKey: string | undefined;
  try {
    if (!verifySameOrigin(req)) return jsonError("Request rejected.", 403);
    if (!rateLimit(`checkout:${clientKey(req)}`, 10, 60_000)) {
      securityLog.rateLimited({ endpoint: "checkout", ip: clientKey(req) });
      return rateLimitedResponse();
    }

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("Invalid request body.", 400);

    const parsed = checkoutSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        "Please review the highlighted fields.",
        400,
        parsed.error.flatten().fieldErrors,
      );
    }
    const shipping = parsed.data;
    idemKey = shipping.idempotencyKey;

    // Idempotency: if this exact submission already created an order,
    // return it instead of creating a duplicate.
    const [existing] = await db
      .select({ orderNumber: orders.orderNumber, totalCents: orders.totalCents })
      .from(orders)
      .where(eq(orders.idempotencyKey, shipping.idempotencyKey))
      .limit(1);
    if (existing) return jsonOk(existing);

    const cartId = await getExistingCartId();
    if (!cartId) return jsonError("Your cart is empty.", 400);

    const user = await getSessionUser();

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
          active: products.active,
        })
        .from(cartItems)
        .innerJoin(products, eq(cartItems.productId, products.id))
        .where(eq(cartItems.cartId, cartId))
        .for("update");

      if (lines.length === 0) {
        return { error: "Your cart is empty." };
      }

      for (const line of lines) {
        if (!line.active) {
          return {
            error: `"${line.name}" is no longer available. Please remove it from your cart.`,
          };
        }
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
          userId: user?.id ?? null,
          idempotencyKey: shipping.idempotencyKey,
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

    if ("error" in result) {
      securityLog.checkoutFailure({ reason: result.error, ip: clientKey(req) });
      return jsonError(result.error, 409);
    }

    await clearCartCookie();
    return jsonOk(result.order, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("stock-conflict:")) {
      securityLog.checkoutFailure({ reason: "stock-race", ip: clientKey(req) });
      return jsonError(
        "An item in your cart just sold out. Please review your cart.",
        409,
      );
    }
    // Unique-violation race on the idempotency key: a concurrent request
    // with the same key won — return the order it created.
    if (isUniqueViolation(err) && idemKey) {
      const [winner] = await db
        .select({ orderNumber: orders.orderNumber, totalCents: orders.totalCents })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);
      if (winner) return jsonOk(winner);
      return jsonError("This order was already submitted.", 409);
    }
    return handleUnexpected("checkout", err);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}
