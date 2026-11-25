import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { cartItems, carts, orderItems, orders, products } from "./schema";
import { DEMO_ORDER_STATUS, resolveCheckoutMode } from "../checkout-policy";
import { calculateSubtotalCents } from "../money";
import { newOrderNumber } from "../order-number";
import { validateFulfillmentTarget } from "@/lib/validation";

export type DemoOrderInput = {
  cartId: string;
  /** Digest of the user/cart-scoped client idempotency key. */
  idempotencyKey: string;
  /** Owning account when the buyer is signed in (S-08). Never inferred from email. */
  userId?: string | null;
  shipping: {
    customerName: string;
    email: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    postalCode: string;
    country: string;
  };
};

export type DemoOrderResult =
  | { status: "empty" }
  | { status: "insufficient-stock"; productName: string }
  | { status: "invalid-target"; productName: string }
  | { status: "recorded" | "replayed"; orderNumber: string; totalCents: number };

/**
 * Persist an unpaid local preview order. The production lock is repeated here
 * (not just at the route) so direct/internal callers cannot bypass it.
 *
 * Locks follow the same cart -> cart-line -> product order used by cart writes.
 * Prices and totals come only from locked catalog rows and use bounded integer
 * minor units. Preview orders intentionally neither deduct demo funds nor
 * reserve stock/allocate delivery: no payment has occurred. A future paid
 * fulfillment path must allocate vault rows in its own order transaction.
 */
export async function recordDemoOrder<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>,
  input: DemoOrderInput,
): Promise<DemoOrderResult> {
  if (process.env.NODE_ENV === "production" || resolveCheckoutMode() !== "demo") {
    throw new Error("Demo orders are disabled in this environment");
  }
  if (!/^[a-f0-9]{64}$/.test(input.idempotencyKey)) {
    throw new Error("A valid scoped checkout idempotency digest is required");
  }

  return database.transaction(async (tx): Promise<DemoOrderResult> => {
    const [cart] = await tx
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.id, input.cartId))
      .for("update")
      .limit(1);
    if (!cart) return { status: "empty" };

    const [existing] = await tx
      .select({ orderNumber: orders.orderNumber, totalCents: orders.totalCents })
      .from(orders)
      .where(eq(orders.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) return { status: "replayed", ...existing };

    const cartLines = await tx
      .select({ productId: cartItems.productId, quantity: cartItems.quantity, inputValue: cartItems.inputValue })
      .from(cartItems)
      .where(eq(cartItems.cartId, input.cartId))
      .orderBy(asc(cartItems.productId))
      .for("update");
    if (cartLines.length === 0) return { status: "empty" };

    const lines: Array<{
      productId: number;
      quantity: number;
      inputValue: string | null;
      name: string;
      nameAr: string;
      priceCents: number;
      stock: number;
      inputType: string;
    }> = [];
    for (const cartLine of cartLines) {
      const [product] = await tx
        .select({
          id: products.id,
          name: products.name,
          nameAr: products.nameAr,
          priceCents: products.priceCents,
          stock: products.stock,
          inputType: products.inputType,
        })
        .from(products)
        .where(eq(products.id, cartLine.productId))
        .for("update")
        .limit(1);
      if (!product || cartLine.quantity > product.stock) {
        return { status: "insufficient-stock", productName: product?.name ?? "" };
      }
      const target = validateFulfillmentTarget(product.inputType, cartLine.inputValue);
      if (!target.ok) return { status: "invalid-target", productName: product.name };
      lines.push({ ...product, productId: product.id, quantity: cartLine.quantity, inputValue: target.value });
    }

    const subtotalCents = calculateSubtotalCents(
      lines.map((line) => ({ priceCents: line.priceCents, quantity: line.quantity })),
    );
    const shippingCents = 0;
    const totalCents = subtotalCents + shippingCents;

    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber: newOrderNumber(),
        idempotencyKey: input.idempotencyKey,
        userId: input.userId ?? null,
        status: DEMO_ORDER_STATUS,
        customerName: input.shipping.customerName,
        email: input.shipping.email,
        addressLine1: input.shipping.addressLine1,
        addressLine2: input.shipping.addressLine2 ?? "",
        city: input.shipping.city,
        postalCode: input.shipping.postalCode,
        country: input.shipping.country,
        subtotalCents,
        shippingCents,
        totalCents,
      })
      .onConflictDoNothing({ target: orders.idempotencyKey })
      .returning({ id: orders.id, orderNumber: orders.orderNumber });

    // A concurrent request from the same user may use a different cart and
    // therefore a different row lock. The UNIQUE idempotency index is final
    // arbiter; a conflict returns the already-committed result without writes.
    if (!order) {
      const [duplicate] = await tx
        .select({ orderNumber: orders.orderNumber, totalCents: orders.totalCents })
        .from(orders)
        .where(eq(orders.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (duplicate) return { status: "replayed", ...duplicate };
      throw new Error("Checkout idempotency conflict could not be resolved");
    }

    await tx.insert(orderItems).values(
      lines.map((line) => ({
        orderId: order.id,
        productId: line.productId,
        productName: line.name,
        productNameAr: line.nameAr,
        unitPriceCents: line.priceCents,
        quantity: line.quantity,
        deliveryCode: "",
        deliveryInfo: line.inputValue ? `${line.inputType}:${line.inputValue}` : null,
        fulfillmentTarget: line.inputValue ? { type: line.inputType, value: line.inputValue } : null,
      })),
    );

    return { status: "recorded", orderNumber: order.orderNumber, totalCents };
  });
}
