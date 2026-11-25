import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { calculateSubtotalCents } from "../src/lib/money";
import { scopedCheckoutIdempotencyDigest } from "../src/lib/marketplace/idempotency";
import { decryptAes256Gcm, encryptAes256Gcm } from "../src/lib/security/encryption";
import { DEMO_WALLET_BALANCE } from "../src/lib/wallet";
import { validateFulfillmentTarget } from "../src/lib/validation";

test("fulfillment target normalization validates all supported target kinds", () => {
  assert.deepEqual(validateFulfillmentTarget("player-id", "  １２٣٤٥٦  "), { ok: true, value: "123456" });
  assert.deepEqual(validateFulfillmentTarget("region", " AE "), { ok: true, value: "ae" });
  assert.deepEqual(validateFulfillmentTarget("activation-email", " Buyer@Example.COM "), { ok: true, value: "buyer@example.com" });
  assert.deepEqual(validateFulfillmentTarget("none", null), { ok: true, value: null });
  for (const [type, value] of [["player-id", "12"], ["player-id", "12345abc"], ["region", "unknown"], ["activation-email", "not-an-email"], ["none", "unexpected"]] as const) {
    assert.deepEqual(validateFulfillmentTarget(type, value), { ok: false }, `${type}:${value}`);
  }
});

test("AES-256-GCM fulfillment envelope round-trips and authenticates its ciphertext", () => {
  const key = { id: "fulfillment-test", key: randomBytes(32) };
  const envelope = encryptAes256Gcm("ABCD-EFGH-1234", key, "evora-fulfillment");
  assert.notEqual(envelope.ciphertext, "ABCD-EFGH-1234");
  assert.equal(decryptAes256Gcm(envelope, key, "evora-fulfillment"), "ABCD-EFGH-1234");
  assert.throws(() => decryptAes256Gcm({ ...envelope, ciphertext: `${envelope.ciphertext}x` }, key, "evora-fulfillment"));
  assert.throws(() => decryptAes256Gcm(envelope, key, "other-purpose"));
});

test("checkout totals are integer minor units, bounded, and never use client totals", () => {
  assert.equal(calculateSubtotalCents([{ priceCents: 1299, quantity: 3 }, { priceCents: 1, quantity: 1 }]), 3898);
  assert.throws(() => calculateSubtotalCents([{ priceCents: 0, quantity: 1 }]));
  assert.throws(() => calculateSubtotalCents([{ priceCents: 2_147_483_647, quantity: 2 }]));
});

test("checkout idempotency digest is deterministic and scoped to the account", () => {
  const secret = "test-auth-secret-that-is-long-enough";
  const key = "client-key-1234567890";
  const first = scopedCheckoutIdempotencyDigest("user-a", key, secret);
  assert.equal(scopedCheckoutIdempotencyDigest("user-a", key, secret), first);
  assert.notEqual(scopedCheckoutIdempotencyDigest("user-b", key, secret), first);
  assert.notEqual(scopedCheckoutIdempotencyDigest("user-a", `${key}-other`, secret), first);
});

test("the documented demo wallet is empty and cannot be charged by preview checkout", () => {
  assert.deepEqual(DEMO_WALLET_BALANCE, { usdCents: 0, egpCents: 0, isDemo: true });
});

test("concurrent duplicate demo checkout writes one order and replays the winner", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("../src/lib/db/schema");
  const { categories, products, carts, cartItems, orders } = schema;
  const { migrateDatabase } = await import("../src/lib/db/migrations");
  const { recordDemoOrder } = await import("../src/lib/db/demo-order");
  const client = new PGlite();
  const previousMode = process.env.CHECKOUT_MODE;
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.CHECKOUT_MODE = "demo";
  delete process.env.APP_ORIGIN;
  try {
    await migrateDatabase({ client: client as never });
    const database = drizzle(client, { schema });
    const [category] = await database.insert(categories).values({ slug: "wave3a", name: "Wave 3A" }).returning();
    const [product] = await database.insert(products).values({
      slug: "wave3a-code", name: "Wave 3A code", description: "test", priceCents: 199,
      categoryId: category.id, stock: 2,
    }).returning();
    const [cart] = await database.insert(carts).values({}).returning();
    await database.insert(cartItems).values({ cartId: cart.id, productId: product.id, quantity: 1 });
    const input = {
      cartId: cart.id,
      idempotencyKey: "a".repeat(64),
      shipping: { customerName: "Test Buyer", email: "buyer@example.invalid", addressLine1: "", city: "", postalCode: "", country: "" },
    };
    const [one, two] = await Promise.all([recordDemoOrder(database, input), recordDemoOrder(database, input)]);
    assert.deepEqual([one.status, two.status].sort(), ["recorded", "replayed"]);
    assert.equal((await database.select().from(orders)).length, 1);
  } finally {
    await client.close();
    if (previousMode === undefined) delete process.env.CHECKOUT_MODE;
    else process.env.CHECKOUT_MODE = previousMode;
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  }
});

test("direct demo-order invocation is blocked in production", async () => {
  const { recordDemoOrder } = await import("../src/lib/db/demo-order");
  const env = process.env as Record<string, string | undefined>;
  const prior = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    await assert.rejects(
      recordDemoOrder(null as never, { cartId: "not-used", idempotencyKey: "b".repeat(64), shipping: { customerName: "Buyer", email: "buyer@example.invalid", addressLine1: "", city: "", postalCode: "", country: "" } }),
      /Demo orders are disabled/,
    );
  } finally {
    if (prior === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = prior;
  }
});

test("fulfillment vault reveal is owner-only, decrypts on demand once, and stores ciphertext", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("../src/lib/db/schema");
  const { migrateDatabase } = await import("../src/lib/db/migrations");
  const { revealOrderCodesInTransaction } = await import("../src/lib/security/fulfillment-reveal");
  const client = new PGlite();
  await migrateDatabase({ client: client as never });
  const database = drizzle(client, { schema });
  const key = { id: "fulfillment-test", key: randomBytes(32) };
  const clearCode = "VAULT-CODE-DO-NOT-STORE";
  const envelope = encryptAes256Gcm(clearCode, key, "evora-fulfillment");
  try {
    const [category] = await database.insert(schema.categories).values({ slug: "vault-test", name: "Vault" }).returning();
    const [product] = await database.insert(schema.products).values({ slug: "vault-product", name: "Vault item", description: "test", priceCents: 100, categoryId: category.id, stock: 1 }).returning();
    const [owner] = await database.insert(schema.users).values({ email: "vault-owner@example.invalid", displayName: "Owner" }).returning();
    const [otherUser] = await database.insert(schema.users).values({ email: "vault-other@example.invalid", displayName: "Other" }).returning();
    const [order] = await database.insert(schema.orders).values({
      userId: owner.id, orderNumber: "EV-VAULTTEST01", status: "paid", customerName: "Owner", email: owner.email,
      addressLine1: "", addressLine2: "", city: "", postalCode: "", country: "", subtotalCents: 100, shippingCents: 0, totalCents: 100,
    }).returning();
    const [item] = await database.insert(schema.orderItems).values({
      orderId: order.id, productId: product.id, productName: product.name, productNameAr: "", unitPriceCents: 100, quantity: 1,
    }).returning();
    await database.insert(schema.fulfillmentVault).values({
      productId: product.id, orderItemId: item.id, codeIndex: 1,
      ciphertext: envelope.ciphertext, iv: envelope.iv, authTag: envelope.authTag, keyId: envelope.keyId,
    });
    // S-26 widened the row shape (nullable payload fields for shredded rows,
    // plus the v2 envelope columns); legacy v1 rows still decrypt exactly the
    // same way.
    const decrypt = (row: {
      keyId: string;
      ciphertext: string | null;
      iv: string | null;
      authTag: string | null;
    }) =>
      decryptAes256Gcm(
        { keyId: row.keyId, ciphertext: row.ciphertext ?? "", iv: row.iv ?? "", authTag: row.authTag ?? "" },
        key,
        "evora-fulfillment",
      );
    const denied = await database.transaction((tx) => revealOrderCodesInTransaction(tx, order.id, otherUser.id, decrypt));
    assert.deepEqual(denied, [], "a different authenticated user cannot reveal another owner's code");
    const codes = await database.transaction((tx) => revealOrderCodesInTransaction(tx, order.id, owner.id, decrypt));
    assert.deepEqual(codes, [clearCode]);
    await assert.rejects(
      database.transaction((tx) => revealOrderCodesInTransaction(tx, order.id, owner.id, decrypt)),
      /FULFILLMENT_ALREADY_REVEALED/,
    );
    const [stored] = await database.select().from(schema.fulfillmentVault);
    assert.notEqual(stored.ciphertext, clearCode);
    assert.equal(stored.revealCount, 1);
    assert.ok(stored.revealedAt);
  } finally {
    await client.close();
  }
});
