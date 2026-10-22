/**
 * Additive catalog seed.
 *
 *   npm run db:seed            (after `npm run db:push`)
 *
 * Only missing demo categories/products are inserted. Existing rows — and any
 * carts or orders that reference them — are never updated or deleted, so
 * running this script twice is a no-op. It refuses to run with
 * `NODE_ENV=production`.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/db/schema";
import { resolveDatabaseUrl } from "../src/lib/db/config";
import { seedMissingCatalog } from "../src/lib/db/seed-catalog";

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: resolveDatabaseUrl(), max: 1 });
  try {
    const db = drizzle({ client: pool, schema });
    const result = await seedMissingCatalog(db);
    console.log(
      `[seed] added ${result.categoriesAdded} categories and ${result.productsAdded} products; existing data left untouched.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(
    "[seed] failed:",
    err instanceof Error ? err.message : "unknown error",
  );
  process.exitCode = 1;
});
