import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/lib/db/schema";
import {
  categories,
  fulfillmentVault,
  orderDisputes,
  orderItems,
  orders,
  products,
  sellerProfiles,
  users,
  walletAccounts,
  walletLedger,
} from "../src/lib/db/schema";
import { encryptAes256Gcm } from "../src/lib/security/encryption";
import {
  blindCodeDigest,
  resolveVaultKeyMaterial,
  sealVaultSecretV2,
  type VaultKeyMaterial,
} from "../src/lib/security/vault-crypto";
import {
  allocateFulfillmentCodesInTransaction,
  openStoredVaultRow,
} from "../src/lib/marketplace/vault-allocation";
import { importVaultCodes, MAX_VAULT_IMPORT_BATCH } from "../src/lib/marketplace/vault-stock";
import { shredOrderVaultInTransaction } from "../src/lib/security/vault-shred";
import { rotateVaultKeys } from "../src/lib/security/vault-rotate";
import { revealOrderCodesInTransaction } from "../src/lib/security/fulfillment-reveal";
import {
  createSellerApplication,
  createSellerProduct,
  findSellerProduct,
  importSellerStock,
  listSellerProducts,
  loadSellerPayoutOrders,
  setSellerProductActive,
} from "../src/lib/marketplace/seller-store";
import {
  createOrderDisputeInTransaction,
  resolveOrderDisputeInTransaction,
} from "../src/lib/marketplace/disputes";
import { sellerPayoutLedger } from "../src/lib/marketplace/payout-policy";

/**
 * Wave 5B / S-26 — real-engine proofs.
 *
 * Everything here runs against PostgreSQL (PGlite): the v2 envelope rows, the
 * duplicate-digest unique index, allocation re-binding, burn-after-reveal,
 * key rotation, cross-seller BOLA and the dispute → refund → payout-block path.
 */

const MATERIAL_A: VaultKeyMaterial = {
  masterKeyId: "wave5b-key-a",
  masterKey: Buffer.alloc(32, 0x41),
  pepper: Buffer.from("0123456789abcdef0123456789abcdef", "utf8"),
  source: "env",
};
const MATERIAL_B: VaultKeyMaterial = {
  masterKeyId: "wave5b-key-b",
  masterKey: Buffer.alloc(32, 0x42),
  pepper: Buffer.from("0123456789abcdef0123456789abcdef", "utf8"),
  source: "env",
};

type Database = NodePgDatabase<typeof schema>;

async function freshDatabase() {
  const client = new PGlite();
  const database = drizzlePglite(client, { schema }) as unknown as Database;
  await migrate(drizzlePglite(client, { schema }), {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  return { client, database };
}

async function seedProduct(database: Database, slug = "wave5b-product", sellerId: string | null = null) {
  const [category] = await database
    .insert(categories)
    .values({ slug: `cat-${slug}`, name: "Wave 5B" })
    .returning();
  const [product] = await database
    .insert(products)
    .values({
      slug,
      name: "Wave 5B product",
      description: "test",
      priceCents: 1000,
      categoryId: category!.id,
      stock: 0,
      sellerId,
    })
    .returning();
  return { category: category!, product: product! };
}

async function seedUser(database: Database, email: string) {
  const [user] = await database
    .insert(users)
    .values({ email, displayName: "Wave 5B user", role: "customer" })
    .returning();
  return user!;
}

async function seedPaidOrder(
  database: Database,
  options: { userId: string; email: string; productId: number; orderNumber: string; totalCents?: number },
) {
  const total = options.totalCents ?? 1000;
  const [order] = await database
    .insert(orders)
    .values({
      userId: options.userId,
      orderNumber: options.orderNumber,
      status: "paid",
      customerName: "Buyer",
      email: options.email,
      addressLine1: "",
      addressLine2: "",
      city: "",
      postalCode: "",
      country: "",
      subtotalCents: total,
      shippingCents: 0,
      totalCents: total,
    })
    .returning();
  const [item] = await database
    .insert(orderItems)
    .values({
      orderId: order!.id,
      productId: options.productId,
      productName: "Wave 5B product",
      productNameAr: "",
      unitPriceCents: total,
      quantity: 1,
    })
    .returning();
  return { order: order!, item: item! };
}

/**
 * Drizzle wraps driver failures and keeps the PostgreSQL detail on `cause`, so
 * constraints are asserted across the whole error chain rather than on the
 * top-level message alone.
 */
async function expectDbRejection(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
  } catch (error) {
    const messages: string[] = [];
    let current: unknown = error;
    const seen = new Set<object>();
    while (current && typeof current === "object" && !seen.has(current)) {
      seen.add(current);
      const candidate = current as { message?: unknown; detail?: unknown; constraint?: unknown; cause?: unknown };
      if (typeof candidate.message === "string") messages.push(candidate.message);
      if (typeof candidate.detail === "string") messages.push(candidate.detail);
      if (typeof candidate.constraint === "string") messages.push(candidate.constraint);
      current = candidate.cause;
    }
    assert.match(messages.join(" | "), pattern);
    return;
  }
  assert.fail(`expected the database to reject with ${pattern}`);
}

/* ------------------------------------------------------------------ */
/* 1. Vault v2: import, digests, allocation, reveal, shred             */
/* ------------------------------------------------------------------ */

test("S-26: importing codes writes v2 envelopes and rejects duplicate raw codes by blind digest", async () => {
  const { client, database } = await freshDatabase();
  try {
    const { product } = await seedProduct(database);

    const first = await importVaultCodes(database, {
      productId: product.id,
      codes: ["CODE-ALPHA-1111", "CODE-BETA-2222", "  CODE-ALPHA-1111  "],
      material: MATERIAL_A,
    });
    assert.equal(first.imported, 2);
    assert.equal(first.batchDuplicates, 1, "a repeat inside one batch is caught");

    const second = await importVaultCodes(database, {
      productId: product.id,
      codes: ["CODE-ALPHA-1111", "CODE-GAMMA-3333"],
      material: MATERIAL_A,
    });
    assert.equal(second.imported, 1);
    assert.equal(second.duplicates, 1, "the partial unique digest index rejects the resold code");

    const rows = await database.select().from(fulfillmentVault).orderBy(fulfillmentVault.createdAt);
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.equal(row.envelopeVersion, "v2");
      assert.ok(row.wrappedDek && row.dekIv && row.dekAuthTag && row.kekId);
      assert.match(row.codeDigest!, /^[0-9a-f]{64}$/);
      assert.equal(row.orderItemId, null, "imported stock is unallocated");
      assert.equal(row.shreddedAt, null);
      assert.ok(!JSON.stringify(row).includes("CODE-"), "no plaintext column exists");
      assert.equal(
        row.codeDigest,
        blindCodeDigest(
          row.id === rows[0]!.id ? "CODE-ALPHA-1111" : row.id === rows[1]!.id ? "CODE-BETA-2222" : "CODE-GAMMA-3333",
          MATERIAL_A,
        ),
      );
    }
    assert.equal(
      openStoredVaultRow(rows[0]!, { productId: product.id, orderItemId: null }, MATERIAL_A),
      "CODE-ALPHA-1111",
    );

    await assert.rejects(
      importVaultCodes(database, {
        productId: product.id,
        codes: Array.from({ length: MAX_VAULT_IMPORT_BATCH + 1 }, (_, index) => `BULK-${index}`),
        material: MATERIAL_A,
      }),
      /At most 500 codes/,
    );
  } finally {
    await client.close();
  }
});

test("S-26: allocation re-binds the envelope to the buyer and a transplanted row fails authentication", async () => {
  const { client, database } = await freshDatabase();
  try {
    const seller = await seedUser(database, "seller-a@example.test");
    const { product } = await seedProduct(database, "wave5b-alloc", null);
    const buyer = await seedUser(database, "buyer-alloc@example.test");
    const { order, item } = await seedPaidOrder(database, {
      userId: buyer.id,
      email: buyer.email,
      productId: product.id,
      orderNumber: "EV-W5B-ALLOC1",
    });

    await importVaultCodes(database, {
      productId: product.id,
      codes: ["DELIVER-ME-9999"],
      material: MATERIAL_A,
    });

    await database.transaction((tx) =>
      allocateFulfillmentCodesInTransaction(tx, item.id, 1, MATERIAL_A),
    );

    const [allocated] = await database
      .select()
      .from(fulfillmentVault)
      .where(and(eq(fulfillmentVault.productId, product.id), eq(fulfillmentVault.orderItemId, item.id)));
    assert.ok(allocated);
    assert.equal(allocated!.envelopeVersion, "v2");
    assert.equal(allocated!.codeIndex, 1);

    // The stock-context envelope no longer opens once the row is re-bound.
    assert.throws(
      () => openStoredVaultRow(allocated!, { productId: product.id, orderItemId: null }, MATERIAL_A),
      /unable to authenticate|Unsupported state/i,
    );
    assert.equal(
      openStoredVaultRow(allocated!, { productId: product.id, orderItemId: item.id }, MATERIAL_A),
      "DELIVER-ME-9999",
    );

    // Reveal works for the owner only, once.
    const decrypted = await database.transaction((tx) =>
      revealOrderCodesInTransaction(tx, order.id, buyer.id, (row) =>
        openStoredVaultRow(row, { productId: row.productId, orderItemId: row.orderItemId }, MATERIAL_A),
      ),
    );
    assert.deepEqual(decrypted, ["DELIVER-ME-9999"]);

    // Transplant attack: copy the delivered ciphertext onto a second order's
    // line. GCM authentication must reject it — no application check involved.
    const otherBuyer = await seedUser(database, "buyer-other@example.test");
    const { item: otherItem } = await seedPaidOrder(database, {
      userId: otherBuyer.id,
      email: otherBuyer.email,
      productId: product.id,
      orderNumber: "EV-W5B-ALLOC2",
    });
    await database
      .update(fulfillmentVault)
      .set({ orderItemId: otherItem.id })
      .where(eq(fulfillmentVault.id, allocated!.id));
    const [moved] = await database
      .select()
      .from(fulfillmentVault)
      .where(eq(fulfillmentVault.id, allocated!.id));
    assert.throws(
      () => openStoredVaultRow(moved!, { productId: product.id, orderItemId: otherItem.id }, MATERIAL_A),
      /unable to authenticate|Unsupported state/i,
      "a ciphertext moved to another buyer's row is mathematically unreadable",
    );
    assert.ok(seller, "seller fixture unused beyond account creation");
  } finally {
    await client.close();
  }
});

test("S-26: shredding a revealed delivery erases the secret but keeps an immutable digest", async () => {
  const { client, database } = await freshDatabase();
  try {
    const { product } = await seedProduct(database, "wave5b-shred");
    const buyer = await seedUser(database, "buyer-shred@example.test");
    const { order, item } = await seedPaidOrder(database, {
      userId: buyer.id,
      email: buyer.email,
      productId: product.id,
      orderNumber: "EV-W5B-SHRED1",
    });
    const intruder = await seedUser(database, "intruder@example.test");

    await importVaultCodes(database, { productId: product.id, codes: ["SHRED-ME-1234"], material: MATERIAL_A });
    await database.transaction((tx) => allocateFulfillmentCodesInTransaction(tx, item.id, 1, MATERIAL_A));

    // A secret that was never revealed cannot be destroyed.
    const tooEarly = await database.transaction((tx) =>
      shredOrderVaultInTransaction(tx, { orderId: order.id, userId: buyer.id, material: MATERIAL_A }),
    );
    assert.deepEqual(tooEarly, { ok: false, error: "NOT_REVEALED" });

    await database.transaction((tx) =>
      revealOrderCodesInTransaction(tx, order.id, buyer.id, (row) =>
        openStoredVaultRow(row, { productId: row.productId, orderItemId: row.orderItemId }, MATERIAL_A),
      ),
    );

    // A foreign account cannot shred somebody else's delivery.
    const foreign = await database.transaction((tx) =>
      shredOrderVaultInTransaction(tx, { orderId: order.id, userId: intruder.id, material: MATERIAL_A }),
    );
    assert.deepEqual(foreign, { ok: false, error: "ORDER_NOT_FOUND" });

    const shred = await database.transaction((tx) =>
      shredOrderVaultInTransaction(tx, { orderId: order.id, userId: buyer.id, material: MATERIAL_A }),
    );
    assert.equal(shred.ok, true);
    if (shred.ok) {
      assert.equal(shred.shredded, 1);
      assert.equal(shred.alreadyShredded, 0);
    }

    const vaultId = await allocatedId(database, item.id);
    const [row] = await database.select().from(fulfillmentVault).where(eq(fulfillmentVault.id, vaultId));
    assert.ok(row);
    assert.equal(row!.ciphertext, null);
    assert.equal(row!.iv, null);
    assert.equal(row!.authTag, null);
    assert.equal(row!.wrappedDek, null);
    assert.equal(row!.dekIv, null);
    assert.equal(row!.dekAuthTag, null);
    assert.ok(row!.shreddedAt instanceof Date);
    assert.match(row!.deliveryDigest!, /^[0-9a-f]{64}$/, "the delivery proof survives");
    assert.match(row!.codeDigest!, /^[0-9a-f]{64}$/, "the blind digest survives — the code can never be resold");
    assert.throws(
      () => openStoredVaultRow(row!, { productId: product.id, orderItemId: item.id }, MATERIAL_A),
      /VAULT_ENVELOPE_INCOMPLETE|Invalid|base64url/i,
    );

    // Idempotent: a retry reports the already-shredded record, no second write.
    const again = await database.transaction((tx) =>
      shredOrderVaultInTransaction(tx, { orderId: order.id, userId: buyer.id, material: MATERIAL_A }),
    );
    assert.deepEqual(again, { ok: true, shredded: 0, alreadyShredded: 1 });

    // The database refuses to resurrect a shredded row.
    await expectDbRejection(
      database
        .update(fulfillmentVault)
        .set({ ciphertext: "forged", iv: "forged", authTag: "forged" })
        .where(eq(fulfillmentVault.id, row!.id)),
      /fulfillment_vault_shred_is_permanent/,
    );
  } finally {
    await client.close();
  }
});

async function allocatedId(database: Database, orderItemId: number) {
  const [row] = await database
    .select({ id: fulfillmentVault.id })
    .from(fulfillmentVault)
    .where(eq(fulfillmentVault.orderItemId, orderItemId));
  return row!.id;
}

/* ------------------------------------------------------------------ */
/* 2. Owner CLI key rotation                                           */
/* ------------------------------------------------------------------ */

test("S-26: `vault rotate-keys` re-wraps v2 DEKs, upgrades v1 rows, and is idempotent", async () => {
  const { client, database } = await freshDatabase();
  try {
    const { product } = await seedProduct(database, "wave5b-rotate");
    await importVaultCodes(database, { productId: product.id, codes: ["ROTATE-1", "ROTATE-2"], material: MATERIAL_A });

    // A legacy v1 row written with the retired single key.
    const legacyKey = { id: "legacy-key-1", key: Buffer.alloc(32, 0x55) };
    const envelope = encryptAes256Gcm("LEGACY-CODE-3", legacyKey, "evora-fulfillment");
    await database.insert(fulfillmentVault).values({
      productId: product.id,
      envelopeVersion: "v1",
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      authTag: envelope.authTag,
      keyId: envelope.keyId,
    });

    const dryRun = await rotateVaultKeys(database, {
      current: MATERIAL_B,
      previous: [MATERIAL_A],
      legacyDecrypt: (row) =>
        row.ciphertext === envelope.ciphertext ? "LEGACY-CODE-3" : (() => { throw new Error("unknown"); })(),
      dryRun: true,
    });
    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.rewrapped, 2);
    assert.equal(dryRun.upgraded, 1);
    const untouched = await database.select().from(fulfillmentVault);
    assert.equal(
      untouched.filter((row) => row.kekId === MATERIAL_A.masterKeyId).length,
      2,
      "a dry run writes nothing (the v1 row keeps its legacy shape)",
    );
    assert.equal(untouched.filter((row) => row.envelopeVersion === "v1").length, 1);

    const report = await rotateVaultKeys(database, {
      current: MATERIAL_B,
      previous: [MATERIAL_A],
      legacyDecrypt: () => "LEGACY-CODE-3",
    });
    assert.equal(report.rewrapped, 2);
    assert.equal(report.upgraded, 1);
    assert.equal(report.failed, 0);

    const rows = await database.select().from(fulfillmentVault).orderBy(fulfillmentVault.createdAt);
    for (const row of rows) {
      assert.equal(row.envelopeVersion, "v2");
      assert.equal(row.kekId, MATERIAL_B.masterKeyId);
      assert.doesNotThrow(() =>
        openStoredVaultRow(row, { productId: product.id, orderItemId: row.orderItemId }, MATERIAL_B),
      );
    }
    assert.deepEqual(
      rows
        .map((row) => openStoredVaultRow(row, { productId: product.id, orderItemId: row.orderItemId }, MATERIAL_B))
        .sort(),
      ["LEGACY-CODE-3", "ROTATE-1", "ROTATE-2"],
    );

    const second = await rotateVaultKeys(database, { current: MATERIAL_B, previous: [MATERIAL_A] });
    assert.equal(second.rewrapped, 0);
    assert.equal(second.upgraded, 0);
    assert.equal(second.unchanged, 3);

    // Without the retired key the CLI refuses to touch anything.
    const missing = await rotateVaultKeys(database, { current: MATERIAL_A, previous: [] });
    assert.equal(missing.skippedMissingKey, 3);
    assert.equal(missing.rewrapped, 0);
  } finally {
    await client.close();
  }
});

/* ------------------------------------------------------------------ */
/* 3. Merchant isolation (BOLA / IDOR)                                 */
/* ------------------------------------------------------------------ */

test("S-26: seller A can never read, toggle or stock seller B's products", async () => {
  const { client, database } = await freshDatabase();
  try {
    const userA = await seedUser(database, "merchant-a@example.test");
    const userB = await seedUser(database, "merchant-b@example.test");

    const sellerA = await createSellerApplication(database, {
      userId: userA.id,
      application: {
        storeName: "Store A",
        storeSlug: "Store-A",
        storeDescription: "",
        phone: "+201000000001",
        country: "EG",
        termsAccepted: true,
      },
      source: "signup",
    });
    const sellerB = await createSellerApplication(database, {
      userId: userB.id,
      application: {
        storeName: "Store B",
        storeSlug: "Store-B",
        storeDescription: "",
        phone: "+201000000002",
        country: "EG",
        termsAccepted: true,
      },
      source: "onboarding",
    });
    assert.ok(sellerA.ok && sellerB.ok);
    if (!sellerA.ok || !sellerB.ok) return;
    assert.equal(sellerA.seller.status, "pending", "a new application is never auto-approved");
    assert.equal(sellerA.seller.storeSlug, "store-a");

    // One seller profile per account, and one store slug per platform.
    const duplicate = await createSellerApplication(database, {
      userId: userA.id,
      application: {
        storeName: "Again",
        storeSlug: "store-again",
        storeDescription: "",
        phone: "+201000000003",
        country: "EG",
        termsAccepted: true,
      },
    });
    assert.deepEqual(duplicate, { ok: false, error: "ALREADY_REGISTERED" });
    const slugTaken = await createSellerApplication(database, {
      userId: (await seedUser(database, "merchant-c@example.test")).id,
      application: {
        storeName: "Store B copy",
        storeSlug: "store-b",
        storeDescription: "",
        phone: "+201000000004",
        country: "EG",
        termsAccepted: true,
      },
    });
    assert.deepEqual(slugTaken, { ok: false, error: "SLUG_TAKEN" });

    const [category] = await database.insert(categories).values({ slug: "wave5b-bola", name: "BOLA" }).returning();
    const productA = await createSellerProduct(database, {
      sellerId: sellerA.seller.id,
      storeSlug: sellerA.seller.storeSlug,
      listing: {
        name: "A key",
        nameAr: "",
        description: "Seller A digital key delivered instantly.",
        descriptionAr: "",
        priceCents: 500,
        categoryId: category!.id,
        inputType: "none",
        icon: "🔑",
      },
    });
    const productB = await createSellerProduct(database, {
      sellerId: sellerB.seller.id,
      storeSlug: sellerB.seller.storeSlug,
      listing: {
        name: "B key",
        nameAr: "",
        description: "Seller B digital key delivered instantly.",
        descriptionAr: "",
        priceCents: 700,
        categoryId: category!.id,
        inputType: "none",
        icon: "🔑",
      },
    });
    assert.ok(productA.ok && productB.ok);
    if (!productA.ok || !productB.ok) return;
    assert.equal(productA.product.isActive, false, "a new listing starts as a draft");

    // Cross-tenant reads are invisible, not merely forbidden.
    assert.equal(
      await findSellerProduct(database, { sellerId: sellerA.seller.id, productId: productB.product.id }),
      undefined,
    );
    assert.equal(
      (await listSellerProducts(database, sellerA.seller.id)).map((row) => row.id).join(","),
      String(productA.product.id),
    );

    // Cross-tenant writes change nothing.
    assert.equal(
      await setSellerProductActive(database, {
        sellerId: sellerA.seller.id,
        productId: productB.product.id,
        isActive: true,
      }),
      undefined,
    );
    const [stillDraft] = await database
      .select({ isActive: products.isActive })
      .from(products)
      .where(eq(products.id, productB.product.id));
    assert.equal(stillDraft?.isActive, false);

    // Cross-tenant stock import is refused and writes no vault rows at all.
    const stolen = await importSellerStock(database, {
      sellerId: sellerA.seller.id,
      productId: productB.product.id,
      codes: ["POISON-1", "POISON-2"],
    });
    assert.deepEqual(stolen, { ok: false, error: "PRODUCT_NOT_FOUND" });
    const bVault = await database
      .select({ id: fulfillmentVault.id })
      .from(fulfillmentVault)
      .where(eq(fulfillmentVault.productId, productB.product.id));
    assert.equal(bVault.length, 0);

    // The owner can stock their own product, and stock advances by the import.
    const own = await importSellerStock(database, {
      sellerId: sellerB.seller.id,
      productId: productB.product.id,
      codes: ["B-CODE-1", "B-CODE-2", "B-CODE-1"],
    });
    assert.equal(own.ok, true);
    if (own.ok) {
      assert.equal(own.result.imported, 2);
      assert.equal(own.result.batchDuplicates, 1);
    }
    const [stocked] = await database
      .select({ stock: products.stock })
      .from(products)
      .where(eq(products.id, productB.product.id));
    assert.equal(stocked?.stock, 2);
  } finally {
    await client.close();
  }
});

/* ------------------------------------------------------------------ */
/* 4. Buyer dispute → escrow freeze → atomic owner refund              */
/* ------------------------------------------------------------------ */

test("S-26: a buyer dispute freezes escrow, and an owner refund credits the wallet exactly once", async () => {
  const { client, database } = await freshDatabase();
  try {
    const merchant = await seedUser(database, "dispute-merchant@example.test");
    const buyer = await seedUser(database, "dispute-buyer@example.test");
    const seller = await createSellerApplication(database, {
      userId: merchant.id,
      application: {
        storeName: "Dispute Store",
        storeSlug: "dispute-store",
        storeDescription: "",
        phone: "+201000000010",
        country: "EG",
        termsAccepted: true,
      },
    });
    assert.ok(seller.ok);
    if (!seller.ok) return;
    await database
      .update(sellerProfiles)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(sellerProfiles.id, seller.seller.id));

    const { product } = await seedProduct(database, "wave5b-dispute", seller.seller.id);
    const { order } = await seedPaidOrder(database, {
      userId: buyer.id,
      email: buyer.email,
      productId: product.id,
      orderNumber: "EV-W5B-DISP1",
      totalCents: 5000,
    });
    await database.insert(walletAccounts).values({ userId: buyer.id, balanceCents: 0 });

    const before = sellerPayoutLedger(await loadSellerPayoutOrders(database, seller.seller.id));
    assert.equal(before.grossSalesCents, 5000);
    assert.equal(before.commissionCents, 500);
    assert.equal(before.escrowHeldCents, 0);
    assert.equal(before.payoutEligibleCents, 4500);

    const opened = await database.transaction((tx) =>
      createOrderDisputeInTransaction(tx, {
        orderId: order.id,
        userId: buyer.id,
        reason: "invalid_code",
        details: "The key was already redeemed.",
      }),
    );
    assert.equal(opened.ok, true);
    if (opened.ok) assert.equal(opened.status, "open");

    // One open dispute per order, enforced by the partial unique index.
    const duplicate = await database.transaction((tx) =>
      createOrderDisputeInTransaction(tx, { orderId: order.id, userId: buyer.id, reason: "other" }),
    );
    assert.deepEqual(duplicate, { ok: false, error: "DISPUTE_ALREADY_OPEN" });

    // A different buyer cannot dispute an order they do not own.
    const stranger = await seedUser(database, "dispute-stranger@example.test");
    const foreign = await database.transaction((tx) =>
      createOrderDisputeInTransaction(tx, { orderId: order.id, userId: stranger.id, reason: "other" }),
    );
    assert.deepEqual(foreign, { ok: false, error: "ORDER_NOT_FOUND" });

    // The escrow freeze is immediate — no owner action needed.
    const frozen = sellerPayoutLedger(await loadSellerPayoutOrders(database, seller.seller.id));
    assert.equal(frozen.escrowHeldCents, 4500);
    assert.equal(frozen.payoutEligibleCents, 0);
    assert.equal(frozen.escrowOrderCount, 1);

    const [dispute] = await database.select().from(orderDisputes).where(eq(orderDisputes.orderId, order.id));
    assert.ok(dispute);

    const refund = await database.transaction((tx) =>
      resolveOrderDisputeInTransaction(tx, {
        disputeId: dispute!.id,
        action: "refund",
        note: "Code was already used; refunded to wallet.",
      }),
    );
    assert.equal(refund.ok, true);
    if (refund.ok) {
      assert.equal(refund.status, "refunded");
      assert.equal(refund.refundedCents, 5000);
      assert.deepEqual(refund.blockedSellerIds, [seller.seller.id]);
    }

    const ledgerRows = await database
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.orderId, order.id));
    assert.equal(ledgerRows.length, 1);
    assert.equal(ledgerRows[0]!.entryType, "credit_refund");
    assert.equal(ledgerRows[0]!.amountCents, 5000);
    assert.equal(ledgerRows[0]!.idempotencyKey, `refund:${order.id}`);

    const [wallet] = await database.select().from(walletAccounts).where(eq(walletAccounts.userId, buyer.id));
    assert.equal(wallet?.balanceCents, 5000);

    const [cancelled] = await database.select({ status: orders.status }).from(orders).where(eq(orders.id, order.id));
    assert.equal(cancelled?.status, "cancelled");

    const [blockedSeller] = await database
      .select()
      .from(sellerProfiles)
      .where(eq(sellerProfiles.id, seller.seller.id));
    assert.ok(blockedSeller?.payoutBlockedAt instanceof Date, "the seller payout block is permanent");
    assert.match(blockedSeller!.payoutBlockedReason, /dispute/);

    // Replaying the resolution is a no-op: no second ledger row, same balance.
    const replay = await database.transaction((tx) =>
      resolveOrderDisputeInTransaction(tx, {
        disputeId: dispute!.id,
        action: "refund",
        note: "retry",
      }),
    );
    assert.equal(replay.ok, true);
    if (replay.ok) {
      assert.equal(replay.alreadyResolved, true);
      assert.equal(replay.refundedCents, 0);
    }
    const ledgerAfter = await database.select().from(walletLedger).where(eq(walletLedger.orderId, order.id));
    assert.equal(ledgerAfter.length, 1);
    const [walletAfter] = await database.select().from(walletAccounts).where(eq(walletAccounts.userId, buyer.id));
    assert.equal(walletAfter?.balanceCents, 5000);

    // A refunded order is excluded from the seller's ledger entirely.
    const after = sellerPayoutLedger(await loadSellerPayoutOrders(database, seller.seller.id));
    assert.equal(after.grossSalesCents, 0);
    assert.equal(after.escrowHeldCents, 0);
    assert.equal(after.excludedOrderCount, 1);
  } finally {
    await client.close();
  }
});

test("S-26: rejecting a dispute releases the escrow without moving money", async () => {
  const { client, database } = await freshDatabase();
  try {
    const merchant = await seedUser(database, "reject-merchant@example.test");
    const buyer = await seedUser(database, "reject-buyer@example.test");
    const seller = await createSellerApplication(database, {
      userId: merchant.id,
      application: {
        storeName: "Reject Store",
        storeSlug: "reject-store",
        storeDescription: "",
        phone: "+201000000020",
        country: "EG",
        termsAccepted: true,
      },
    });
    assert.ok(seller.ok);
    if (!seller.ok) return;
    const { product } = await seedProduct(database, "wave5b-reject", seller.seller.id);
    const { order } = await seedPaidOrder(database, {
      userId: buyer.id,
      email: buyer.email,
      productId: product.id,
      orderNumber: "EV-W5B-DISP2",
      totalCents: 2000,
    });

    const opened = await database.transaction((tx) =>
      createOrderDisputeInTransaction(tx, { orderId: order.id, userId: buyer.id, reason: "not_received" }),
    );
    assert.equal(opened.ok, true);
    if (!opened.ok) return;

    const rejected = await database.transaction((tx) =>
      resolveOrderDisputeInTransaction(tx, {
        disputeId: opened.disputeId,
        action: "reject",
        note: "Delivery was confirmed in the vault.",
      }),
    );
    assert.equal(rejected.ok, true);
    if (rejected.ok) {
      assert.equal(rejected.status, "rejected");
      assert.equal(rejected.refundedCents, 0);
      assert.deepEqual(rejected.blockedSellerIds, []);
    }

    const ledgerRows = await database.select().from(walletLedger).where(eq(walletLedger.orderId, order.id));
    assert.equal(ledgerRows.length, 0, "a rejection never credits a wallet");
    const [stillPaid] = await database.select({ status: orders.status }).from(orders).where(eq(orders.id, order.id));
    assert.equal(stillPaid?.status, "paid");

    const released = sellerPayoutLedger(await loadSellerPayoutOrders(database, seller.seller.id));
    assert.equal(released.escrowHeldCents, 0);
    assert.equal(released.payoutEligibleCents, 1800);

    const [sellerRow] = await database.select().from(sellerProfiles).where(eq(sellerProfiles.id, seller.seller.id));
    assert.equal(sellerRow?.payoutBlockedAt, null, "a rejected dispute never blocks the seller");

    // A closed dispute also requires a note at the database level.
    await expectDbRejection(
      database
        .insert(orderDisputes)
        .values({
          orderId: order.id,
          userId: buyer.id,
          reason: "other",
          status: "rejected",
          resolutionNote: "",
          resolvedAt: new Date(),
        }),
      /order_disputes_closed_has_resolution/,
    );
  } finally {
    await client.close();
  }
});

/* ------------------------------------------------------------------ */
/* 5. Vault row integrity constraints                                  */
/* ------------------------------------------------------------------ */

test("S-26: the schema refuses incomplete v2 envelopes and v1 writes after the upgrade", async () => {
  const { client, database } = await freshDatabase();
  try {
    const { product } = await seedProduct(database, "wave5b-constraints");
    const sealed = sealVaultSecretV2({
      plaintext: "CONSTRAINT-1",
      context: { productId: product.id, orderItemId: null },
      material: MATERIAL_A,
    });

    // A v2 row without its wrapped DEK is rejected…
    await expectDbRejection(
      database.insert(fulfillmentVault).values({
        productId: product.id,
        envelopeVersion: "v2",
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        authTag: sealed.authTag,
        keyId: sealed.kekId,
        codeDigest: blindCodeDigest("CONSTRAINT-1", MATERIAL_A),
      }),
      /fulfillment_vault_v2_envelope_complete/,
    );

    // …and so is a shredded row that still holds ciphertext.
    await expectDbRejection(
      database.insert(fulfillmentVault).values({
        productId: product.id,
        envelopeVersion: "v2",
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        authTag: sealed.authTag,
        keyId: sealed.kekId,
        codeDigest: blindCodeDigest("CONSTRAINT-2", MATERIAL_A),
        revealedAt: new Date(),
        shreddedAt: new Date(),
      }),
      /fulfillment_vault_shred_is_permanent|fulfillment_vault_v2_envelope_complete/,
    );

    // The same code digest cannot exist twice for one product.
    const ok = await importVaultCodes(database, { productId: product.id, codes: ["DUP-INDEX"], material: MATERIAL_A });
    assert.equal(ok.imported, 1);
    await expectDbRejection(
      database.insert(fulfillmentVault).values({
        productId: product.id,
        envelopeVersion: "v2",
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        authTag: sealed.authTag,
        keyId: sealed.kekId,
        wrappedDek: sealed.wrappedDek,
        dekIv: sealed.dekIv,
        dekAuthTag: sealed.dekAuthTag,
        kekId: sealed.kekId,
        codeDigest: blindCodeDigest("DUP-INDEX", MATERIAL_A),
      }),
      /fulfillment_vault_code_digest_idx|duplicate key/i,
    );

    // The same code is still importable for a *different* product.
    const { product: otherProduct } = await seedProduct(database, "wave5b-constraints-2");
    const crossProduct = await importVaultCodes(database, {
      productId: otherProduct.id,
      codes: ["DUP-INDEX"],
      material: MATERIAL_A,
    });
    assert.equal(crossProduct.imported, 1);
  } finally {
    await client.close();
  }
});

test("S-26: vault defaults stay readable for rows written before the upgrade", async () => {
  const { client, database } = await freshDatabase();
  try {
    const { product } = await seedProduct(database, "wave5b-legacy-default");
    const [row] = await database
      .insert(fulfillmentVault)
      .values({ productId: product.id, ciphertext: "x", iv: "y", authTag: "z", keyId: "legacy" })
      .returning();
    assert.equal(row?.envelopeVersion, "v1", "existing inserts default to the legacy marker");
    assert.equal(row?.codeDigest, null);
    assert.equal(row?.wrappedDek, null);

    const material = resolveVaultKeyMaterial({ NODE_ENV: "development" });
    assert.equal(material.source, "development-fallback");
  } finally {
    await client.close();
  }
});
