import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { cartItems, carts, categories, products } from "../src/lib/db/schema";
import { seedMissingCatalog } from "../src/lib/db/seed-catalog";
import { quantityAfterConcurrentAdd } from "../src/lib/db/cart-operations";

async function createDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return { client, db };
}

test("normal catalog seeding is repeatable and preserves existing customized and extra data", async () => {
  const { client, db } = await createDb();
  try {
    await seedMissingCatalog(db);
    const [original] = await db.select().from(products).limit(1);
    assert.ok(original);
    await db.update(products).set({ name: "Locally customized product" }).where(eq(products.id, original.id));
    await db.insert(categories).values({ slug: "custom-category", name: "Keep me" });

    await seedMissingCatalog(db);

    const [preserved] = await db.select().from(products).where(eq(products.id, original.id));
    const [customCategory] = await db.select().from(categories).where(eq(categories.slug, "custom-category"));
    assert.equal(preserved.name, "Locally customized product");
    assert.equal(customCategory.name, "Keep me");
    assert.equal((await db.select().from(products)).length, 18);
  } finally {
    await client.close();
  }
});

test("simultaneous cart additions increment atomically and clamp to stock and 99", async () => {
  const { client, db } = await createDb();
  try {
    await seedMissingCatalog(db);
    const [category] = await db.select().from(categories).limit(1);
    const [product] = await db.select().from(products).limit(1);
    const [cart] = await db.insert(carts).values({}).returning();
    assert.ok(category && product && cart);

    const add = (quantity: number, stock: number) =>
      db.insert(cartItems)
        .values({ cartId: cart.id, productId: product.id, quantity: Math.min(quantity, stock, 99) })
        .onConflictDoUpdate({
          target: [cartItems.cartId, cartItems.productId],
          set: { quantity: quantityAfterConcurrentAdd(quantity, stock) },
        });

    await Promise.all(Array.from({ length: 20 }, () => add(2, 100)));
    let [line] = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id));
    assert.equal(line.quantity, 40);

    await Promise.all(Array.from({ length: 100 }, () => add(3, 100)));
    [line] = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id));
    assert.equal(line.quantity, 99);

    await db.update(cartItems).set({ quantity: 6 }).where(eq(cartItems.id, line.id));
    await add(5, 7);
    [line] = await db.select().from(cartItems).where(eq(cartItems.id, line.id));
    assert.equal(line.quantity, 7);
  } finally {
    await client.close();
  }
});
