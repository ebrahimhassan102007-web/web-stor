/**
 * Vault stock writes (S-26) — import digital fulfillment codes as v2
 * split-key envelopes and reject duplicates by keyed blind digest.
 *
 * Deliberately free of `server-only` and of the database singleton: every
 * function takes the caller's database or transaction. That makes the real
 * encryption and duplicate-rejection path testable against an embedded
 * PostgreSQL without mocking, and keeps the merchant route, the owner CLI and
 * the tests on exactly one code path.
 */
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { asc, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { fulfillmentVault, products } from "../db/schema";
import {
  blindCodeDigest,
  normalizeVaultCode,
  resolveVaultKeyMaterial,
  sealVaultSecretV2,
  type VaultKeyMaterial,
} from "../security/vault-crypto";

export type VaultDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Hard bound per import request (a merchant cannot stream unbounded rows). */
export const MAX_VAULT_IMPORT_BATCH = 500;

export type VaultImportResult = {
  /** Newly sealed rows. */
  imported: number;
  /** Codes already present for this product (digest collision). */
  duplicates: number;
  /** Codes rejected by validation (empty, too long, control characters). */
  rejected: number;
  /** Codes repeated inside this very batch. */
  batchDuplicates: number;
};

/**
 * Seal and insert codes for one product.
 *
 * The insert uses `ON CONFLICT DO NOTHING`, so the partial unique index
 * `fulfillment_vault_code_digest_idx` rejects a duplicate code atomically even
 * when two imports race: the loser simply reports `duplicates` instead of
 * overwriting a delivered code.
 */
export async function importVaultCodes(
  database: VaultDatabase,
  input: {
    productId: number;
    codes: readonly string[];
    material?: VaultKeyMaterial;
    now?: Date;
  },
): Promise<VaultImportResult> {
  if (!Number.isSafeInteger(input.productId) || input.productId <= 0) {
    throw new Error("Invalid vault product");
  }
  if (input.codes.length > MAX_VAULT_IMPORT_BATCH) {
    throw new Error(`At most ${MAX_VAULT_IMPORT_BATCH} codes can be imported at once`);
  }

  const material = input.material ?? resolveVaultKeyMaterial();
  const now = input.now ?? new Date();
  const seen = new Set<string>();
  const result: VaultImportResult = {
    imported: 0,
    duplicates: 0,
    rejected: 0,
    batchDuplicates: 0,
  };

  for (const raw of input.codes) {
    let code: string;
    try {
      code = normalizeVaultCode(raw);
    } catch {
      result.rejected += 1;
      continue;
    }
    const digest = blindCodeDigest(code, material);
    if (seen.has(digest)) {
      result.batchDuplicates += 1;
      continue;
    }
    seen.add(digest);

    const sealed = sealVaultSecretV2({
      plaintext: code,
      context: { productId: input.productId, orderItemId: null },
      material,
    });

    const inserted = await database
      .insert(fulfillmentVault)
      .values({
        productId: input.productId,
        orderItemId: null,
        codeIndex: 0,
        envelopeVersion: sealed.envelopeVersion,
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        authTag: sealed.authTag,
        keyId: sealed.kekId,
        wrappedDek: sealed.wrappedDek,
        dekIv: sealed.dekIv,
        dekAuthTag: sealed.dekAuthTag,
        kekId: sealed.kekId,
        codeDigest: digest,
        revealedAt: null,
        revealCount: 0,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: fulfillmentVault.id });

    if (inserted.length === 1) result.imported += 1;
    else result.duplicates += 1;
  }

  return result;
}

/**
 * Import codes and advance the product's visible stock counter by exactly the
 * number of rows that were actually created.
 */
export async function importVaultCodesForProduct(
  database: VaultDatabase,
  input: {
    productId: number;
    codes: readonly string[];
    material?: VaultKeyMaterial;
    now?: Date;
  },
): Promise<VaultImportResult> {
  const result = await importVaultCodes(database, input);
  if (result.imported > 0) {
    await database
      .update(products)
      .set({ stock: sql`${products.stock} + ${result.imported}` })
      .where(eq(products.id, input.productId));
  }
  return result;
}

/** Count of unallocated, unshredded codes a product can still deliver. */
export async function availableVaultStock(database: VaultDatabase, productId: number): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(fulfillmentVault)
    .where(
      sql`${fulfillmentVault.productId} = ${productId} AND ${fulfillmentVault.orderItemId} IS NULL AND ${fulfillmentVault.shreddedAt} IS NULL`,
    );
  return row?.count ?? 0;
}

/** Test/diagnostic helper: rows in creation order (never returns plaintext). */
export async function listVaultMetadata(database: VaultDatabase, productId: number) {
  return database
    .select({
      id: fulfillmentVault.id,
      orderItemId: fulfillmentVault.orderItemId,
      envelopeVersion: fulfillmentVault.envelopeVersion,
      codeDigest: fulfillmentVault.codeDigest,
      shreddedAt: fulfillmentVault.shreddedAt,
    })
    .from(fulfillmentVault)
    .where(eq(fulfillmentVault.productId, productId))
    .orderBy(asc(fulfillmentVault.createdAt), asc(fulfillmentVault.id));
}
