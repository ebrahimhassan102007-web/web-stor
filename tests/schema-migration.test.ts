import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/lib/db/schema";
import { products } from "../src/lib/db/schema";
import { seedMissingCatalog } from "../src/lib/db/seed-catalog";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "../src/lib/db/seed-data";

test("a clean embedded PostgreSQL database applies all migrations and additive seed safely", async () => {
  const client = new PGlite();
  try {
    const pgliteDb = drizzlePglite(client, { schema });
    const migrationsFolder = path.join(process.cwd(), "drizzle");
    await migrate(pgliteDb, { migrationsFolder });

    const { rows } = await client.query<{ tablename: string }>(
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

    const database = pgliteDb as unknown as NodePgDatabase<typeof schema>;
    const first = await seedMissingCatalog(database);
    assert.deepEqual(first, {
      categoriesAdded: SEED_CATEGORIES.length,
      productsAdded: SEED_PRODUCTS.length,
    });

    const [original] = await database.select().from(products).limit(1);
    assert.ok(original);
    await database
      .update(products)
      .set({ name: "Existing row preserved", stock: 9 })
      .where(eq(products.id, original.id));

    const second = await seedMissingCatalog(database);
    assert.deepEqual(second, { categoriesAdded: 0, productsAdded: 0 });
    const [preserved] = await database
      .select()
      .from(products)
      .where(eq(products.id, original.id));
    assert.equal(preserved.name, "Existing row preserved");
    assert.equal(preserved.stock, 9);
  } finally {
    await client.close();
  }
});
