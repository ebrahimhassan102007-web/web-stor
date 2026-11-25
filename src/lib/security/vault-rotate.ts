/**
 * Owner-driven vault key rotation (S-26).
 *
 * Two safe operations, both without ever touching a stored plaintext in bulk:
 *
 *  1. **Re-wrap** — a `v2` DEK is unwrapped with the previous KEK and wrapped
 *     again with the current KEK. The ciphertext and its AAD stay byte-identical,
 *     so a rotation cannot corrupt a delivered secret.
 *  2. **Upgrade** — a legacy `v1` row is decrypted with the retired single key
 *     and re-sealed as a `v2` envelope (fresh DEK, context-bound AAD).
 *
 * The caller (the local owner CLI) supplies the key material and, for `v1`,
 * an injected legacy decryptor; this module has no `server-only` marker and no
 * database singleton so the whole migration is testable against PGlite.
 */
import { asc, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import { fulfillmentVault } from "../db/schema";
import {
  rewrapVaultDek,
  sealVaultSecretV2,
  VAULT_ENVELOPE_V1,
  VAULT_ENVELOPE_V2,
  type VaultKeyMaterial,
} from "../security/vault-crypto";

export type VaultRotationReport = {
  dryRun: boolean;
  scanned: number;
  rewrapped: number;
  upgraded: number;
  unchanged: number;
  skippedMissingKey: number;
  shreddedSkipped: number;
  failed: number;
};

export type LegacyVaultRow = {
  keyId: string;
  ciphertext: string | null;
  iv: string | null;
  authTag: string | null;
};

export async function rotateVaultKeys(
  database: PgDatabase<PgQueryResultHKT, typeof schema>,
  options: {
    current: VaultKeyMaterial;
    /** Materials for keys being retired, matched by `masterKeyId`. */
    previous?: readonly VaultKeyMaterial[];
    /** Decryptor for `v1` rows (the retired `FULFILLMENT_ENCRYPTION_KEY`). */
    legacyDecrypt?: (row: LegacyVaultRow) => string;
    dryRun?: boolean;
    limit?: number;
  },
): Promise<VaultRotationReport> {
  const dryRun = options.dryRun === true;
  const limit = Math.min(Math.max(options.limit ?? 5000, 1), 50_000);
  const previousById = new Map((options.previous ?? []).map((material) => [material.masterKeyId, material]));
  const report: VaultRotationReport = {
    dryRun,
    scanned: 0,
    rewrapped: 0,
    upgraded: 0,
    unchanged: 0,
    skippedMissingKey: 0,
    shreddedSkipped: 0,
    failed: 0,
  };

  // A shredded row holds no key material at all, so it is not scanned.
  const rows = await database
    .select()
    .from(fulfillmentVault)
    .where(isNull(fulfillmentVault.shreddedAt))
    .orderBy(asc(fulfillmentVault.createdAt), asc(fulfillmentVault.id))
    .limit(limit);

  for (const row of rows) {
    report.scanned += 1;
    const context = { productId: row.productId, orderItemId: row.orderItemId };

    if (row.envelopeVersion === VAULT_ENVELOPE_V1) {
      if (!options.legacyDecrypt || !row.ciphertext || !row.iv || !row.authTag) {
        report.skippedMissingKey += 1;
        continue;
      }
      try {
        const code = options.legacyDecrypt({
          keyId: row.keyId,
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.authTag,
        });
        const sealed = sealVaultSecretV2({
          plaintext: code,
          context,
          material: options.current,
        });
        if (!dryRun) {
          await database
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
        report.upgraded += 1;
      } catch {
        report.failed += 1;
      }
      continue;
    }

    if (row.envelopeVersion !== VAULT_ENVELOPE_V2) {
      report.skippedMissingKey += 1;
      continue;
    }
    if (row.kekId === options.current.masterKeyId) {
      report.unchanged += 1;
      continue;
    }
    const from = row.kekId ? previousById.get(row.kekId) : undefined;
    if (!from) {
      report.skippedMissingKey += 1;
      continue;
    }
    try {
      const rewrapped = rewrapVaultDek({
        record: {
          kekId: row.kekId,
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.authTag,
          wrappedDek: row.wrappedDek,
          dekIv: row.dekIv,
          dekAuthTag: row.dekAuthTag,
        },
        context,
        from,
        to: options.current,
      });
      if (!dryRun) {
        await database
          .update(fulfillmentVault)
          .set({
            wrappedDek: rewrapped.wrappedDek,
            dekIv: rewrapped.dekIv,
            dekAuthTag: rewrapped.dekAuthTag,
            kekId: rewrapped.kekId,
            keyId: rewrapped.kekId,
          })
          .where(eq(fulfillmentVault.id, row.id));
      }
      report.rewrapped += 1;
    } catch {
      report.failed += 1;
    }
  }

  return report;
}
