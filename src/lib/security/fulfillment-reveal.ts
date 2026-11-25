import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { fulfillmentVault, orderItems, orders } from "@/lib/db/schema";

const eligibleStatuses = ["paid", "fulfilled", "completed"] as const;

type CiphertextRow = { keyId: string; ciphertext: string; iv: string; authTag: string };

/**
 * Owner-scoped, one-time decryption primitive. The caller must wrap this in a
 * transaction; decryption is injected so this domain operation is testable
 * without importing the server-only database singleton.
 */
export async function revealOrderCodesInTransaction<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult, typeof schema>,
  orderId: string,
  userId: string,
  decrypt: (row: CiphertextRow) => string,
): Promise<string[]> {
  const [order] = await tx.select({ id: orders.id, status: orders.status }).from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId))).for("update").limit(1);
  if (!order || !(eligibleStatuses as readonly string[]).includes(order.status)) return [];
  const itemRows = await tx.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, order.id));
  if (!itemRows.length) return [];
  const rows = await tx.select().from(fulfillmentVault)
    .where(inArray(fulfillmentVault.orderItemId, itemRows.map((item) => item.id)))
    .orderBy(asc(fulfillmentVault.orderItemId), asc(fulfillmentVault.codeIndex))
    .for("update");
  if (!rows.length || rows.some((row) => row.revealedAt !== null)) throw new Error("FULFILLMENT_ALREADY_REVEALED");
  const codes = rows.map(decrypt);
  const updated = await tx.update(fulfillmentVault)
    .set({ revealedAt: new Date(), revealCount: 1 })
    .where(and(inArray(fulfillmentVault.id, rows.map((row) => row.id)), isNull(fulfillmentVault.revealedAt)))
    .returning({ id: fulfillmentVault.id });
  if (updated.length !== rows.length) throw new Error("FULFILLMENT_REVEAL_CONFLICT");
  return codes;
}
