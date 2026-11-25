/**
 * Cryptographic burn-after-reveal (S-26).
 *
 * A buyer who has already revealed a delivered code can permanently destroy the
 * stored secret: the ciphertext, IV, auth tag, wrapped DEK and every wrapping
 * field are `NULL`ed, while the row keeps the immutable delivery digest, the
 * reveal timestamp and the shred timestamp as audit facts.
 *
 * After this runs the code is unrecoverable — not by the buyer, not by the
 * merchant, and not by E-Vora with the master key, because the DEK is gone.
 *
 * Like `fulfillment-reveal.ts` this module takes the caller's transaction and
 * has no `server-only` marker, so the destructive path is proved against a real
 * PostgreSQL engine in the test suite.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import { fulfillmentVault, orderItems, orders } from "../db/schema";
import {
  computeDeliveryDigest,
  resolveVaultKeyMaterial,
  type VaultKeyMaterial,
} from "../security/vault-crypto";

/** Orders whose delivery may be shredded (a refund/cancel cannot destroy proof). */
const SHREDDABLE_STATUSES = ["paid", "fulfilled", "completed"] as const;

export type ShredOutcome =
  | { ok: true; shredded: number; alreadyShredded: number }
  | { ok: false; error: "ORDER_NOT_FOUND" | "NOT_REVEALED" };

/**
 * Shred every delivered secret of one order for its owner.
 *
 * Ownership is part of the row lock predicate, so a foreign `orderId` is
 * indistinguishable from a missing one (`ORDER_NOT_FOUND`) and cannot be used
 * to probe other buyers' orders.
 */
export async function shredOrderVaultInTransaction(
  tx: PgDatabase<PgQueryResultHKT, typeof schema>,
  input: {
    orderId: string;
    userId: string;
    now?: Date;
    material?: VaultKeyMaterial;
  },
): Promise<ShredOutcome> {
  const [order] = await tx
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.userId, input.userId)))
    .for("update")
    .limit(1);
  if (!order || !(SHREDDABLE_STATUSES as readonly string[]).includes(order.status)) {
    return { ok: false, error: "ORDER_NOT_FOUND" };
  }

  const items = await tx
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));
  if (items.length === 0) return { ok: false, error: "ORDER_NOT_FOUND" };

  const rows = await tx
    .select()
    .from(fulfillmentVault)
    .where(
      inArray(
        fulfillmentVault.orderItemId,
        items.map((item) => item.id),
      ),
    )
    .for("update");
  if (rows.length === 0) return { ok: false, error: "ORDER_NOT_FOUND" };

  // Only a secret the buyer has actually received can be destroyed: shredding
  // an unrevealed code would silently burn paid inventory.
  if (rows.some((row) => row.revealedAt === null)) {
    return { ok: false, error: "NOT_REVEALED" };
  }

  const material = input.material ?? resolveVaultKeyMaterial();
  const now = input.now ?? new Date();
  let shredded = 0;
  let alreadyShredded = 0;

  for (const row of rows) {
    if (row.shreddedAt !== null) {
      alreadyShredded += 1;
      continue;
    }
    const context = { productId: row.productId, orderItemId: row.orderItemId };
    const digest = computeDeliveryDigest(material, {
      vaultId: row.id,
      context,
      codeDigest: row.codeDigest,
      preShredCiphertext: row.ciphertext,
    });

    await tx
      .update(fulfillmentVault)
      .set({
        ciphertext: null,
        iv: null,
        authTag: null,
        wrappedDek: null,
        dekIv: null,
        dekAuthTag: null,
        deliveryDigest: digest,
        shreddedAt: now,
      })
      .where(eq(fulfillmentVault.id, row.id));
    shredded += 1;
  }

  return { ok: true, shredded, alreadyShredded };
}
