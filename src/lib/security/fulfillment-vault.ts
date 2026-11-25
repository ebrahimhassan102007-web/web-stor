import "server-only";
import { db } from "@/lib/db";
import { decryptAes256Gcm, encryptAes256Gcm, encryptionKeyFromEnv, type AuthenticatedEnvelope } from "@/lib/security/encryption";
import { resolveVaultKeyMaterial, type VaultKeyMaterial } from "@/lib/security/vault-crypto";
import {
  allocateFulfillmentCodesInTransaction as allocateInTransaction,
  openStoredVaultRow,
  rebindVaultRowToBuyer as rebindRow,
  type VaultCiphertextRowShape,
} from "@/lib/marketplace/vault-allocation";
import { importVaultCodes } from "@/lib/marketplace/vault-stock";
import { revealOrderCodesInTransaction as revealCodes } from "@/lib/security/fulfillment-reveal";

const PURPOSE = "evora-fulfillment";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The columns a reader needs; `v1` rows predate the split-key envelope. */
export type VaultCiphertextRow = VaultCiphertextRowShape;

function fulfillmentKey() {
  return encryptionKeyFromEnv("FULFILLMENT_ENCRYPTION_KEY", "FULFILLMENT_ENCRYPTION_KEY_ID");
}

/**
 * Legacy `v1` envelope (pre-S-26). Retained only so rows written before the
 * split-key upgrade stay readable; every new write is a `v2` envelope.
 */
export function encryptFulfillmentCode(code: string): AuthenticatedEnvelope {
  const normalized = code.trim();
  if (!normalized || normalized.length > 4096 || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error("Invalid fulfillment code");
  return encryptAes256Gcm(normalized, fulfillmentKey(), PURPOSE);
}

export function decryptFulfillmentCode(envelope: AuthenticatedEnvelope): string {
  return decryptAes256Gcm(envelope, fulfillmentKey(), PURPOSE);
}

/**
 * Decrypt one vault row, dispatching on the stored envelope version.
 * The record context (product + order item) is the v2 GCM AAD, so a ciphertext
 * read from a different row cannot be opened here.
 */
export function decryptVaultRow(
  row: VaultCiphertextRow,
  material: VaultKeyMaterial = resolveVaultKeyMaterial(),
): string {
  return openStoredVaultRow(row, { productId: row.productId, orderItemId: row.orderItemId }, material);
}

/**
 * Add one encrypted, unallocated code to a product's fulfillment inventory.
 *
 * Writing uses the v2 split-key envelope with the stock context
 * (`orderItemId = NULL`) and stores a keyed blind digest, so re-uploading the
 * same code is rejected without the code ever being stored in clear.
 */
export async function addFulfillmentInventoryCode(
  database: Parameters<typeof importVaultCodes>[0],
  productId: number,
  code: string,
): Promise<void> {
  const result = await importVaultCodes(database, { productId, codes: [code] });
  if (result.imported !== 1) throw new Error("DUPLICATE_FULFILLMENT_CODE");
}

/** Re-bind an allocated row to its buyer (see `marketplace/vault-allocation`). */
export async function rebindVaultRowToBuyer(
  tx: Parameters<typeof rebindRow>[0],
  row: VaultCiphertextRow & { id: string },
  orderItemId: number,
  material?: VaultKeyMaterial,
): Promise<void> {
  await rebindRow(tx, row, orderItemId, material);
}

/**
 * Allocate inventory codes within the caller's order/payment transaction.
 * Rows are locked with SKIP LOCKED and each taken row is re-sealed against its
 * order item, so a code can never later be transplanted to another buyer.
 */
export async function allocateFulfillmentCodesInTransaction(
  tx: Parameters<typeof allocateInTransaction>[0],
  orderItemId: number,
  quantity: number,
): Promise<void> {
  await allocateInTransaction(tx, orderItemId, quantity);
}

/** Allocate via a standalone transaction where a caller has no larger payment transaction. */
export async function allocateFulfillmentCodes(orderItemId: number, quantity: number): Promise<void> {
  await db.transaction((tx) => allocateFulfillmentCodesInTransaction(tx, orderItemId, quantity));
}

export async function revealOrderCodesInTransaction(tx: Tx, orderId: string, userId: string): Promise<string[]> {
  return revealCodes(tx, orderId, userId, (row) => decryptVaultRow(row));
}
