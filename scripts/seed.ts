/**
 * Safe, additive local demo seed. Existing rows are never deleted or updated.
 *
 *   npm run db:seed
 *
 * A destructive reset is intentionally separate and must be explicitly
 * confirmed; it only targets the embedded local PGlite database:
 *   NODE_ENV=development RESET_LOCAL_CATALOG=YES npm run db:seed -- --reset
 */
import "dotenv/config";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/lib/db/schema";
import { deleteCatalogAndDemoOrders, seedMissingCatalog } from "../src/lib/db/seed-catalog";
import { assertLocalResetAllowed, assertNotProduction } from "../src/lib/db/seed-safety";

async function resetLocal(db: PgliteDatabase<typeof schema>): Promise<void> {
  console.warn("[seed] deleting the LOCAL embedded catalog and dependent demo orders/carts...");
  await deleteCatalogAndDemoOrders(db);
  await seedMissingCatalog(db);
}

async function main(): Promise<void> {
  assertNotProduction(process.env);
  const reset = process.argv.includes("--reset");
  if (reset) assertLocalResetAllowed(process.env);
  if (process.env.DATABASE_URL) {
    throw new Error("Seed script only targets embedded PGlite; unset DATABASE_URL to continue.");
  }

  const client = new PGlite(path.join(process.cwd(), ".pglite"));
  try {
    const db = drizzlePglite(client, { schema });
    await migratePglite(db, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
    if (reset) await resetLocal(db);
    else {
      await seedMissingCatalog(db);
      console.log("[seed] added missing demo records; existing catalog data was preserved.");
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err instanceof Error ? err.message : "unknown error");
  process.exitCode = 1;
});
