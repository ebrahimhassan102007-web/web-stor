import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { cartItems, orderItems, orders, products } from "./schema";
import { DEMO_ORDER_STATUS } from "../checkout-policy";
import { shippingFor } from "../money";
import { newOrderNumber } from "../order-number";

export type DemoOrderShipping = {
  customerName: string;
  email: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postalCode: string;
  country: string;
};

export type DemoOrderResult =
  | { status: "empty" }
  | { status: "insufficient-stock"; productName: string }
  | { status: "recorded"; orderNumber: string; totalCents: number };

/**
 * Records a **demo, unpaid** order for the current cart.
 *
 * Deliberately mutation-free outside the new order rows:
 *  - prices and totals come exclusively from the database,
 *  - product stock is **not** decremented (nothing was paid, so inventory must
 *    not be consumed),
 *  - the cart and its cookie are **not** deleted (the demo stays repeatable),
 *  - the stored status is `demo-unpaid`, never `confirmed`.
 *
 * The `orders`/`order_items` inserts share one transaction so an order can
 * never be stored without its line snapshots.
 */
export async function recordDemoOrder<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult, typeof schema>,
  input: { cartId: string; shipping: DemoOrderShipping },
): Promise<DemoOrderResult> {
  return db.transaction(async (tx): Promise<DemoOrderResult> => {
    // Authoritative prices/stock; read-only, so no row locks are taken.
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
      .where(eq(cartItems.cartId, input.cartId));

    if (lines.length === 0) return { status: "empty" };

    for (const line of lines) {
      if (line.quantity > line.stock) {
        return { status: "insufficient-stock", productName: line.name };
      }
    }

    const subtotalCents = lines.reduce(
      (sum, line) => sum + line.priceCents * line.quantity,
      0,
    );
    const shippingCents = shippingFor(subtotalCents);
    const totalCents = subtotalCents + shippingCents;

    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber: newOrderNumber(),
        // Explicitly unpaid: nothing was charged or verified.
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
      .returning({ id: orders.id, orderNumber: orders.orderNumber });

    // Snapshots only — order history must not change if the catalog does.
    await tx.insert(orderItems).values(
      lines.map((line) => ({
        orderId: order.id,
        productId: line.productId,
        productName: line.name,
        unitPriceCents: line.priceCents,
        quantity: line.quantity,
      })),
    );

    return { status: "recorded", orderNumber: order.orderNumber, totalCents };
  });
}
