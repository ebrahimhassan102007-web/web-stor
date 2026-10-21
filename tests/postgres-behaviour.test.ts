/**
 * PostgreSQL integration tests for the retained architecture.
 *
 * These run against a disposable database via TEST_DATABASE_URL (the schema is
 * created with the documented `npm run db:push` workflow). The database name
 * must contain "test" and production is refused, so the suite can never wipe
 * real data. Configuration: see README → Tests.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/lib/db/schema";
import { cartItems, carts, categories, products } from "../src/lib/db/schema";
import { addToCartLine, MAX_QTY_PER_LINE } from "../src/lib/db/cart-operations";
import { seedMissingCatalog } from "../src/lib/db/seed-catalog";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "../src/lib/db/seed-data";

const testUrl = process.env.TEST_DATABASE_URL?.trim();

if (testUrl) {
  assert.notEqual(
    process.env.NODE_ENV,
    "production",
    "refusing to run database tests with NODE_ENV=production",
  );
  const databaseName = decodeURIComponent(new URL(testUrl).pathname.replace(/^\//, ""));
  assert.match(
    databaseName,
    /test/i,
    "TEST_DATABASE_URL must point at a disposable database whose name contains 'test'",
  );
}

const skip = testUrl
  ? false
  : "TEST_DATABASE_URL is not set — start PostgreSQL, run db:push against a *_test database and re-run";

const pool = testUrl ? new Pool({ connectionString: testUrl, max: 10 }) : null;
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

test("the retained PostgreSQL schema is present (db:push workflow, no migrations)", { skip }, async () => {
  assert.ok(pool);
  const { rows } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  assert.deepEqual(
    rows.map((row) => row.tablename),
    ["cart_items", "carts", "categories", "order_items", "orders", "products"],
  );

  const indexes = await pool.query<{ indexname: string }>(
    "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname",
  );
  const names = indexes.rows.map((row) => row.indexname);
  for (const expected of [
    "cart_items_cart_product_idx",
    "products_slug_idx",
    "orders_number_idx",
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

async function firstCategoryId(database: NodePgDatabase<typeof schema>) {
  const [existing] = await database.select().from(categories).limit(1);
  if (existing) return existing.id;
  const [created] = await database
    .insert(categories)
    .values({ slug: `fixture-category-${Date.now()}`, name: "Fixture" })
    .returning();
  return created.id;
}
