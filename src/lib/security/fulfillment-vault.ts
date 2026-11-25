import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, fulfillmentVault, orderItems, orders } from "@/lib/db";
import type * as schema from "@/lib/db/schema";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { decryptAes256Gcm, encryptAes256Gcm, encryptionKeyFromEnv, type AuthenticatedEnvelope } from "@/lib/security/encryption";
import { revealOrderCodesInTransaction as revealCodes } from "@/lib/security/fulfillment-reveal";

const PURPOSE = "evora-fulfillment";
const eligibleStatuses = ["paid", "fulfilled", "completed"] as const;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function fulfillmentKey() {
  return encryptionKeyFromEnv("FULFILLMENT_ENCRYPTION_KEY", "FULFILLMENT_ENCRYPTION_KEY_ID");
}

export function encryptFulfillmentCode(code: string): AuthenticatedEnvelope {
  const normalized = code.trim();
  if (!normalized || normalized.length > 4096 || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error("Invalid fulfillment code");
  return encryptAes256Gcm(normalized, fulfillmentKey(), PURPOSE);
}

export function decryptFulfillmentCode(envelope: AuthenticatedEnvelope): string {
  return decryptAes256Gcm(envelope, fulfillmentKey(), PURPOSE);
}

/** Add an encrypted, unallocated code to a product's fulfillment inventory. */
export async function addFulfillmentInventoryCode(
  database: PgDatabase<PgQueryResultHKT, typeof schema>,
  productId: number,
  code: string,
): Promise<void> {
  const encrypted = encryptFulfillmentCode(code);
  await database.insert(fulfillmentVault).values({
    productId,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    keyId: encrypted.keyId,
  });
}

/**
 * Allocate inventory codes within the caller's order/payment transaction.
 * Product inventory rows are locked with SKIP LOCKED and assignment is a
 * conditional update, so concurrent fulfillers cannot allocate one code twice.
 */
export async function allocateFulfillmentCodesInTransaction<TQueryResult extends PgQueryResultHKT>(
  tx: PgTransaction<TQueryResult, typeof schema, ExtractTablesWithRelations<typeof schema>>,
  orderItemId: number,
  quantity: number,
): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("Invalid fulfillment quantity");
  const [item] = await tx.select({ productId: orderItems.productId, orderId: orderItems.orderId })
    .from(orderItems).where(eq(orderItems.id, orderItemId)).for("update").limit(1);
  if (!item) throw new Error("Order item not found");
  const [order] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, item.orderId)).for("update").limit(1);
  if (!order || !(eligibleStatuses as readonly string[]).includes(order.status)) throw new Error("Fulfillment requires a paid order");
  const available = await tx.select({ id: fulfillmentVault.id }).from(fulfillmentVault)
    .where(and(eq(fulfillmentVault.productId, item.productId), isNull(fulfillmentVault.orderItemId)))
    .orderBy(asc(fulfillmentVault.createdAt), asc(fulfillmentVault.id))
    .limit(quantity)
    .for("update", { skipLocked: true });
  if (available.length !== quantity) throw new Error("INSUFFICIENT_FULFILLMENT_INVENTORY");
  for (const [index, code] of available.entries()) {
    const updated = await tx.update(fulfillmentVault)
      .set({ orderItemId, codeIndex: index + 1 })
      .where(and(eq(fulfillmentVault.id, code.id), isNull(fulfillmentVault.orderItemId)))
      .returning({ id: fulfillmentVault.id });
    if (updated.length !== 1) throw new Error("FULFILLMENT_ALLOCATION_CONFLICT");
  }
}

/** Allocate via a standalone transaction where a caller has no larger payment transaction. */
export async function allocateFulfillmentCodes(orderItemId: number, quantity: number): Promise<void> {
  await db.transaction((tx) => allocateFulfillmentCodesInTransaction(tx, orderItemId, quantity));
}

export function decryptVaultRow(row: {
  keyId: string;
  ciphertext: string;
  iv: string;
  authTag: string;
}): string {
  return decryptFulfillmentCode(row as AuthenticatedEnvelope);
}

export async function revealOrderCodesInTransaction(tx: Tx, orderId: string, userId: string): Promise<string[]> {
  return revealCodes(tx, orderId, userId, decryptVaultRow);
}
