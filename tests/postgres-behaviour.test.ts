/**
 * PostgreSQL integration tests for the retained architecture.
 *
 * ⚠ These tests TRUNCATE the catalog, cart and order tables, so they only run
 * against an explicitly identified disposable database. `TEST_DATABASE_URL`
 * is validated by `resolveTestDatabaseTarget()` before any connection exists:
 *
 *  - `NODE_ENV=production` is always refused,
 *  - the database name must end with `_test`,
 *  - the host must be loopback/local unless `ALLOW_REMOTE_TEST_DATABASE=YES`
 *    is set for a throwaway instance (see README → Tests).
 *
 * An unsafe target fails the run loudly instead of silently skipping.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/lib/db/schema";
import { cartItems, carts, categories, orders, products } from "../src/lib/db/schema";
import { addToCartLine, MAX_QTY_PER_LINE } from "../src/lib/db/cart-operations";
import { seedMissingCatalog } from "../src/lib/db/seed-catalog";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "../src/lib/db/seed-data";
import { recordDemoOrder } from "../src/lib/db/demo-order";
import { DEMO_ORDER_STATUS, isPaidOrConfirmedStatus } from "../src/lib/checkout-policy";
import {
  assertTestDatabaseTarget,
  type TestDatabaseTarget,
} from "../src/lib/db/test-database";

const configuredUrl = process.env.TEST_DATABASE_URL?.trim();

// Throws (and therefore fails the run) for production, remote-without-opt-in
// or wrongly named targets — before a pool is created.
const target: TestDatabaseTarget | null = configuredUrl
  ? assertTestDatabaseTarget(process.env)
  : null;

if (target) {
  console.log(
    `[tests] destructive integration tests target ${target.remote ? "OPTED-IN REMOTE" : "local"} database ${target.label}`,
  );
}

const skip = target
  ? false
  : "TEST_DATABASE_URL is not set — start PostgreSQL, run db:push against a *_test database and re-run";

const pool = target ? new Pool({ connectionString: target.connectionString, max: 10 }) : null;
const db: NodePgDatabase<typeof schema> | null = pool
  ? drizzle({ client: pool, schema })
  : null;

async function resetDatabase(): Promise<void> {
  assert.ok(pool);
  await pool.query(
    "TRUNCATE TABLE order_items, orders, cart_items, carts, products, categories RESTART IDENTITY CASCADE",
  );
}

before(async () => {
  if (!pool) return;
  await resetDatabase();
});

after(async () => {
  await pool?.end();
});

test("the clean PostgreSQL schema includes storefront and authentication tables", { skip }, async () => {
  assert.ok(pool);
  const { rows } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  assert.deepEqual(
    rows.map((row) => row.tablename),
    [
      "account_sessions",
      "auth_rate_limits",
      "cart_items",
      "carts",
      "categories",
      "email_verification_codes",
      "google_oauth_states",
      "order_items",
      "orders",
      "products",
      "users",
    ],
  );

  const indexes = await pool.query<{ indexname: string }>(
    "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname",
  );
  const names = indexes.rows.map((row) => row.indexname);
  for (const expected of [
    "account_sessions_token_hash_idx",
    "auth_rate_limits_window_idx",
    "cart_items_cart_product_idx",
    "email_verification_codes_expiry_idx",
    "google_oauth_states_expiry_idx",
    "orders_number_idx",
    "products_slug_idx",
    "users_email_idx",
    "users_google_sub_idx",
  ]) {
    assert.ok(names.includes(expected), `missing index ${expected}`);
  }
});

test("additive seeding preserves existing rows and is repeatable", { skip }, async () => {
  assert.ok(db);
  const first = await seedMissingCatalog(db);
  assert.equal(first.categoriesAdded, SEED_CATEGORIES.length);
  assert.equal(first.productsAdded, SEED_PRODUCTS.length);

  const [original] = await db.select().from(products).limit(1);
  assert.ok(original);
  await db
    .update(products)
    .set({ name: "Locally customized product", stock: 7 })
    .where(eq(products.id, original.id));

  const [customCategory] = await db
    .insert(categories)
    .values({ slug: "custom-category", name: "Keep me" })
    .returning();
  assert.ok(customCategory);
  await db.insert(products).values({
    slug: "custom-product",
    name: "Keep me too",
    description: "Locally added product that seeding must not touch.",
    priceCents: 1234,
    categoryId: customCategory.id,
    stock: 3,
  });

  const second = await seedMissingCatalog(db);
  assert.deepEqual(second, { categoriesAdded: 0, productsAdded: 0 });

  const [preserved] = await db
    .select()
    .from(products)
    .where(eq(products.id, original.id));
  assert.equal(preserved.name, "Locally customized product");
  assert.equal(preserved.stock, 7);

  const allProducts = await db.select().from(products);
  const allCategories = await db.select().from(categories);
  assert.equal(allProducts.length, SEED_PRODUCTS.length + 1);
  assert.equal(allCategories.length, SEED_CATEGORIES.length + 1);
  assert.ok(allProducts.some((product) => product.slug === "custom-product"));
  assert.ok(allCategories.some((category) => category.slug === "custom-category"));

  // Clean up the custom fixtures so later tests start from the seed catalog.
  await db.delete(products).where(eq(products.slug, "custom-product"));
  await db.delete(categories).where(eq(categories.slug, "custom-category"));
});

test("concurrent cart additions never lose an increment", { skip }, async () => {
  assert.ok(db);
  const [product] = await db
    .insert(products)
    .values({
      slug: `concurrent-cart-${Date.now()}`,
      name: "Concurrency Fixture",
      description: "Fixture product for the cart concurrency test.",
      priceCents: 1000,
      categoryId: (await firstCategoryId(db)),
      stock: 100,
    })
    .returning();
  const [cart] = await db.insert(carts).values({}).returning();

  await Promise.all(
    Array.from({ length: 20 }, () =>
      addToCartLine(db, { cartId: cart.id, productId: product.id, quantity: 2 }),
    ),
  );

  let [line] = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id));
  assert.equal(line.quantity, 40, "20 concurrent adds of 2 must total 40");

  // Clamp to stock (100) and the per-line maximum (99).
  await Promise.all(
    Array.from({ length: 100 }, () =>
      addToCartLine(db, { cartId: cart.id, productId: product.id, quantity: 3 }),
    ),
  );
  [line] = await db.select().from(cartItems).where(eq(cartItems.id, line.id));
  assert.equal(line.quantity, MAX_QTY_PER_LINE);

  // Clamp to the live stock ceiling.
  await db.update(cartItems).set({ quantity: 6 }).where(eq(cartItems.id, line.id));
  await db.update(products).set({ stock: 7 }).where(eq(products.id, product.id));
  await addToCartLine(db, { cartId: cart.id, productId: product.id, quantity: 5 });
  [line] = await db.select().from(cartItems).where(eq(cartItems.id, line.id));
  assert.equal(line.quantity, 7);

  // A second cart keeps its own line and hits the same ceiling.
  const [otherCart] = await db.insert(carts).values({}).returning();
  await addToCartLine(db, {
    cartId: otherCart.id,
    productId: product.id,
    quantity: 5,
  });
  const [otherLine] = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, otherCart.id));
  assert.equal(otherLine.quantity, 5);
});

test("cart additions validate the product and its stock", { skip }, async () => {
  assert.ok(db);
  const [cart] = await db.insert(carts).values({}).returning();

  const missing = await addToCartLine(db, {
    cartId: cart.id,
    productId: 2_147_483_647,
    quantity: 1,
  });
  assert.deepEqual(missing, { error: "missing" });

  const [outOfStock] = await db
    .insert(products)
    .values({
      slug: `out-of-stock-${Date.now()}`,
      name: "Out of Stock Fixture",
      description: "Fixture product with no stock.",
      priceCents: 500,
      categoryId: await firstCategoryId(db),
      stock: 0,
    })
    .returning();

  const unavailable = await addToCartLine(db, {
    cartId: cart.id,
    productId: outOfStock.id,
    quantity: 1,
  });
  assert.deepEqual(unavailable, { error: "out-of-stock" });

  const lines = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id));
  assert.equal(lines.length, 0);
});

test("demo checkout records an unpaid order without consuming stock or the cart", { skip }, async () => {
  assert.ok(db);
  const [category] = await db
    .insert(categories)
    .values({ slug: `demo-order-category-${Date.now()}`, name: "Demo Order Fixture" })
    .returning();
  const [product] = await db
    .insert(products)
    .values({
      slug: `demo-order-${Date.now()}`,
      name: "Demo Order Fixture",
      description: "Fixture product for the demo checkout test.",
      priceCents: 2500,
      categoryId: category.id,
      stock: 4,
    })
    .returning();
  const [cart] = await db.insert(carts).values({}).returning();
  await db
    .insert(cartItems)
    .values({ cartId: cart.id, productId: product.id, quantity: 2 });

  const result = await recordDemoOrder(db, {
    cartId: cart.id,
    shipping: {
      customerName: "Demo Customer",
      email: "demo@example.invalid",
      addressLine1: "1 Demo Street",
      city: "Demoville",
      postalCode: "DE1 1MO",
      country: "Demo",
    },
  });

  assert.equal(result.status, "recorded");
  if (result.status !== "recorded") return;
  assert.match(result.orderNumber, /^EV-[A-Z0-9]{12}$/);
  // Digital delivery is free in this catalog; demo checkout never charges or ships.
  assert.equal(result.totalCents, 5000);

  // The order is stored as explicitly unpaid — never as paid/confirmed.
  const [order] = await db.select().from(orders).limit(1);
  assert.equal(order.status, DEMO_ORDER_STATUS);
  assert.equal(isPaidOrConfirmedStatus(order.status), false);
  assert.notEqual(order.status, "confirmed");

  // No inventory was consumed and the cart is still usable for the demo.
  const [afterProduct] = await db
    .select()
    .from(products)
    .where(eq(products.id, product.id));
  assert.equal(afterProduct.stock, 4);
  const lines = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 2);

  // Oversized lines are rejected without writing an order.
  await db.update(cartItems).set({ quantity: 5 }).where(eq(cartItems.id, lines[0].id));
  const before = (await db.select().from(orders)).length;
  const rejected = await recordDemoOrder(db, {
    cartId: cart.id,
    shipping: {
      customerName: "Demo Customer",
      email: "demo@example.invalid",
      addressLine1: "1 Demo Street",
      city: "Demoville",
      postalCode: "DE1 1MO",
      country: "Demo",
    },
  });
  assert.deepEqual(rejected, { status: "insufficient-stock", productName: "Demo Order Fixture" });
  assert.equal((await db.select().from(orders)).length, before);
  const [stillStock] = await db
    .select()
    .from(products)
    .where(eq(products.id, product.id));
  assert.equal(stillStock.stock, 4);
});

async function firstCategoryId(database: NodePgDatabase<typeof schema>) {
  const [existing] = await database.select().from(categories).limit(1);
  if (existing) return existing.id;
  const [created] = await database
    .insert(categories)
    .values({ slug: `fixture-category-${Date.now()}`, name: "Fixture" })
    .returning();
  return created.id;
}
