/**
 * Force-reseed the catalog: clears categories/products and re-inserts
 * the initial data from `src/lib/db/seed-data.ts`.
 *
 *   npm run db:seed
 *
 * Note: this is normally NOT needed — a fresh database is created,
 * migrated and seeded automatically the first time the app boots
 * (see `ensureDbReady()` in `src/lib/db/index.ts`). Use this script to
 * deliberately reset the catalog, or to seed a remote database.
 * With the embedded database, stop the dev server first (only one
 * process can open ./.pglite at a time) — or simply delete the
 * `.pglite/` folder and let the next boot rebuild everything.
 */
import "dotenv/config";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  drizzle as drizzleNode,
  type NodePgDatabase,
} from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import * as schema from "../src/lib/db/schema";
import { categories, products } from "../src/lib/db/schema";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "../src/lib/db/seed-data";

type Database = NodePgDatabase<typeof schema>;

function isRemoteDatabaseUrl(raw?: string): boolean {
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname;
    return !["", "localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return false;
  }
}

async function reseed(db: Database): Promise<void> {
  console.log("[seed] clearing existing catalog (and dependent carts/orders)...");
  // Deepest FK children first so product deletes can't be restricted.
  await db.delete(schema.orderItems);
  await db.delete(schema.orders);
  await db.delete(schema.cartItems);
  await db.delete(products);
  await db.delete(categories);

  console.log("[seed] inserting categories...");
  const insertedCategories = await db
    .insert(categories)
    .values(SEED_CATEGORIES.map((c) => ({ ...c })))
    .returning();

  const idBySlug = new Map(insertedCategories.map((c) => [c.slug, c.id]));

  console.log("[seed] inserting products...");
  await db.insert(products).values(
    SEED_PRODUCTS.map(({ category, ...p }) => ({
      ...p,
      featured: p.featured ?? false,
      categoryId: idBySlug.get(category)!,
    })),
  );

  console.log(
    `[seed] done — ${insertedCategories.length} categories, ${SEED_PRODUCTS.length} products.`,
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (isRemoteDatabaseUrl(databaseUrl)) {
    console.log("[seed] target: remote PostgreSQL (DATABASE_URL)");
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await reseed(drizzleNode({ client: pool, schema }));
    } finally {
      await pool.end();
    }
    return;
  }

  console.log("[seed] target: embedded PGlite database (./.pglite)");
  const client = new PGlite(path.join(process.cwd(), ".pglite"));
  try {
    const db = drizzlePglite(client, { schema });
    await migratePglite(db, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
    await reseed(db as unknown as Database);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
