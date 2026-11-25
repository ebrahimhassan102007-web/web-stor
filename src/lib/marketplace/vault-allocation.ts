/**
 * Vault allocation + context re-binding (S-26).
 *
 * Stock is imported with the canonical **stock** context (`orderItemId = NULL`).
 * When an order line consumes it, the record is re-sealed with the **buyer**
 * context (product + order item), which becomes the v2 payload AAD.
 *
 * That single re-seal is the anti-transplant guarantee: a ciphertext copied onto
 * another row, product or order item can no longer be authenticated, so a
 * database-level attacker cannot redirect someone else's delivery to themselves.
 *
 * Split out of `fulfillment-vault.ts` (which is `server-only`) so the real
 * allocation and de-transplant behaviour can be proved on PostgreSQL in tests.
 * It also reads legacy `v1` rows, upgrading them to `v2` on allocation.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import { fulfillmentVault, orderItems, orders } from "../db/schema";
import { decryptAes256Gcm, encryptionKeyFromEnv } from "../security/encryption";
import {
  openVaultSecretV2,
  resolveVaultKeyMaterial,
  sealVaultSecretV2,
  VAULT_ENVELOPE_V2,
  type VaultKeyMaterial,
  type VaultRecordContext,
} from "../security/vault-crypto";

const ELIGIBLE_ORDER_STATUSES = ["paid", "fulfilled", "completed"] as const;
const LEGACY_PURPOSE = "evora-fulfillment";

/** Every column a reader may need; `v1` rows predate the v2 envelope. */
export type VaultCiphertextRowShape = {
  productId: number;
  orderItemId: number | null;
  envelopeVersion: string;
  keyId: string;
  ciphertext: string | null;
  iv: string | null;
  authTag: string | null;
  wrappedDek?: string | null;
  dekIv?: string | null;
  dekAuthTag?: string | null;
  kekId?: string | null;
};

/** Legacy `v1` decryption (single shared key, read-only after S-26). */
export function decryptLegacyFulfillmentCode(row: VaultCiphertextRowShape): string {
  if (!row.ciphertext || !row.iv || !row.authTag) {
    throw new Error("VAULT_ENVELOPE_INCOMPLETE:v1");
  }
  return decryptAes256Gcm(
    { keyId: row.keyId, ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag },
    encryptionKeyFromEnv("FULFILLMENT_ENCRYPTION_KEY", "FULFILLMENT_ENCRYPTION_KEY_ID"),
    LEGACY_PURPOSE,
  );
}

/** Open one stored row under an explicit record context. */
export function openStoredVaultRow(
  row: VaultCiphertextRowShape,
  context: VaultRecordContext,
  material: VaultKeyMaterial = resolveVaultKeyMaterial(),
): string {
  if (row.envelopeVersion === VAULT_ENVELOPE_V2) {
    return openVaultSecretV2({
      record: {
        kekId: row.kekId ?? null,
        ciphertext: row.ciphertext ?? null,
        iv: row.iv ?? null,
        authTag: row.authTag ?? null,
        wrappedDek: row.wrappedDek ?? null,
        dekIv: row.dekIv ?? null,
        dekAuthTag: row.dekAuthTag ?? null,
      },
      context,
      material,
    });
  }
  return decryptLegacyFulfillmentCode(row);
}

/**
 * Re-bind a freshly allocated row to its buyer (new context, fresh DEK).
 * Legacy `v1` rows are upgraded to `v2` here as a side effect.
 */
export async function rebindVaultRowToBuyer(
  tx: PgDatabase<PgQueryResultHKT, typeof schema>,
  row: VaultCiphertextRowShape & { id: string },
  orderItemId: number,
  material: VaultKeyMaterial = resolveVaultKeyMaterial(),
): Promise<void> {
  const code = openStoredVaultRow(row, { productId: row.productId, orderItemId: null }, material);
  const sealed = sealVaultSecretV2({
    plaintext: code,
    context: { productId: row.productId, orderItemId },
    material,
  });
  await tx
    .update(fulfillmentVault)
    .set({
      envelopeVersion: sealed.envelopeVersion,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      authTag: sealed.authTag,
      keyId: sealed.kekId,
      wrappedDek: sealed.wrappedDek,
      dekIv: sealed.dekIv,
      dekAuthTag: sealed.dekAuthTag,
      kekId: sealed.kekId,
    })
    .where(eq(fulfillmentVault.id, row.id));
}

/**
 * Allocate inventory codes inside the caller's payment transaction.
 *
 * Rows are locked with `SKIP LOCKED` and assignment is a conditional update, so
 * two concurrent fulfillers can never take the same code. Each taken row is then
 * re-bound to the order item.
 */
export async function allocateFulfillmentCodesInTransaction(
  tx: PgDatabase<PgQueryResultHKT, typeof schema>,
  orderItemId: number,
  quantity: number,
  material: VaultKeyMaterial = resolveVaultKeyMaterial(),
): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new Error("Invalid fulfillment quantity");
  }
  const [item] = await tx
    .select({ productId: orderItems.productId, orderId: orderItems.orderId })
    .from(orderItems)
    .where(eq(orderItems.id, orderItemId))
    .for("update")
    .limit(1);
  if (!item) throw new Error("Order item not found");
  const [order] = await tx
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, item.orderId))
    .for("update")
    .limit(1);
  if (!order || !(ELIGIBLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
    throw new Error("Fulfillment requires a paid order");
  }

  const available = await tx
    .select()
    .from(fulfillmentVault)
    .where(
      and(
        eq(fulfillmentVault.productId, item.productId),
        isNull(fulfillmentVault.orderItemId),
        isNull(fulfillmentVault.shreddedAt),
      ),
    )
    .orderBy(asc(fulfillmentVault.createdAt), asc(fulfillmentVault.id))
    .limit(quantity)
    .for("update", { skipLocked: true });
  if (available.length !== quantity) throw new Error("INSUFFICIENT_FULFILLMENT_INVENTORY");

  for (const [index, row] of available.entries()) {
    const updated = await tx
      .update(fulfillmentVault)
      .set({ orderItemId, codeIndex: index + 1 })
      .where(and(eq(fulfillmentVault.id, row.id), isNull(fulfillmentVault.orderItemId)))
      .returning({ id: fulfillmentVault.id });
    if (updated.length !== 1) throw new Error("FULFILLMENT_ALLOCATION_CONFLICT");
    await rebindVaultRowToBuyer(tx, row, orderItemId, material);
  }
}
