import { eq, sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { cartItems, carts, products } from "./schema";
import { validateFulfillmentTarget } from "@/lib/validation";

/** Per-line cap, mirrored by the validator and cart UI. */
export const MAX_QTY_PER_LINE = 99;

export type AddToCartOutcome =
  | { error: "missing" }
  | { error: "out-of-stock" }
  | { error: "invalid-target" }
  | { error: null };

/** Quantity is computed from the stored row in the atomic conflict update. */
export function quantityAfterConcurrentAdd(
  addQuantity: number,
  stockLimit: number,
): SQL {
  return sql`LEAST(${cartItems.quantity} + ${addQuantity}, ${stockLimit}, ${MAX_QTY_PER_LINE})`;
}

/**
 * Add one product line without a read-modify-write race. The product row is
 * locked to keep its stock ceiling stable, and the line is updated through one
 * `INSERT ... ON CONFLICT DO UPDATE` statement. Customer delivery input is
 * replaced only when a new non-empty value is provided.
 */
export async function addToCartLine<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>,
  input: {
    cartId: string;
    productId: number;
    quantity: number;
    inputValue?: string;
  },
): Promise<AddToCartOutcome> {
  return database.transaction(async (tx): Promise<AddToCartOutcome> => {
    const [cart] = await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, input.cartId)).for("update").limit(1);
    if (!cart) return { error: "missing" };

    const [product] = await tx
      .select({ id: products.id, stock: products.stock, inputType: products.inputType })
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update")
      .limit(1);

    if (!product) return { error: "missing" };
    if (product.stock <= 0) return { error: "out-of-stock" };
    const target = validateFulfillmentTarget(product.inputType, input.inputValue);
    if (!target.ok) return { error: "invalid-target" };

    await tx
      .insert(cartItems)
      .values({
        cartId: input.cartId,
        productId: product.id,
        quantity: Math.min(input.quantity, product.stock, MAX_QTY_PER_LINE),
        inputValue: target.value,
      })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.productId],
        set: {
          quantity: quantityAfterConcurrentAdd(input.quantity, product.stock),
          inputValue: target.value,
        },
      });

    return { error: null };
  });
}
