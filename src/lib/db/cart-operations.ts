import { sql, type SQL } from "drizzle-orm";
import { cartItems } from "./schema";

export const MAX_QTY_PER_LINE = 99;

/** Atomic conflict-update expression shared by the API and concurrency tests. */
export function quantityAfterConcurrentAdd(addQuantity: number, stockLimit: number): SQL {
  return sql`LEAST(${cartItems.quantity} + ${addQuantity}, ${stockLimit}, ${MAX_QTY_PER_LINE})`;
}
