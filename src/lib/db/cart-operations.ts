import { eq, sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { cartItems, products } from "./schema";

/** Per-line cap, mirrored by `updateCartItemSchema` and the cart UI. */
export const MAX_QTY_PER_LINE = 99;

export type AddToCartOutcome =
  | { error: "missing" }
  | { error: "out-of-stock" }
  | { error: null };

/**
 * Quantity expression for the conflict branch of the cart upsert.
 *
 * It is evaluated by PostgreSQL against the *stored* row, so concurrent adds
 * cannot lose an increment (no read-modify-write race), and the result is
 * clamped to the live stock ceiling and the per-line maximum.
 */
export function quantityAfterConcurrentAdd(
  addQuantity: number,
  stockLimit: number,
): SQL {
  return sql`LEAST(${cartItems.quantity} + ${addQuantity}, ${stockLimit}, ${MAX_QTY_PER_LINE})`;
}

/**
 * Adds a product line to a cart atomically.
 *
 * The product row is locked `FOR UPDATE` — which both validates availability
 * and keeps the stock ceiling stable for the duration of the transaction — and
 * the insert/update is a single `INSERT … ON CONFLICT DO UPDATE` statement.
 * Prices and stock limits always come from the database; the client only ever
 * supplies a product id and a bounded quantity.
 */
export async function addToCartLine<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult, typeof schema>,
  input: { cartId: string; productId: number; quantity: number },
): Promise<AddToCartOutcome> {
  return db.transaction(async (tx): Promise<AddToCartOutcome> => {
    const [product] = await tx
      .select({ id: products.id, stock: products.stock })
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");

    if (!product) return { error: "missing" };
    if (product.stock <= 0) return { error: "out-of-stock" };

    await tx
      .insert(cartItems)
      .values({
        cartId: input.cartId,
        productId: product.id,
        quantity: Math.min(input.quantity, product.stock, MAX_QTY_PER_LINE),
      })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.productId],
        set: {
          quantity: quantityAfterConcurrentAdd(input.quantity, product.stock),
        },
      });

    return { error: null };
  });
}
