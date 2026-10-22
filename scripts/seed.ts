/**
 * Add any missing E-Vora demo-catalog rows without deleting or rewriting
 * existing catalog, carts, or orders.
 *
 * Remote databases require ALLOW_REMOTE_SEED=YES, and this script always
 * refuses NODE_ENV=production. Normal application boot seeds an empty
 * database automatically.
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
import { seedMissingCatalog } from "../src/lib/db/seed-catalog";

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

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run the catalog seed script in production.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (isRemoteDatabaseUrl(databaseUrl)) {
    if (process.env.ALLOW_REMOTE_SEED !== "YES") {
      throw new Error(
        "Refusing a remote database target. Set ALLOW_REMOTE_SEED=YES only for a disposable non-production database.",
      );
    }
    console.log("[seed] target: explicitly authorized non-production PostgreSQL");
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const result = await seedMissingCatalog(
        drizzleNode({ client: pool, schema }),
      );
      console.log(
        `[seed] added ${result.categoriesAdded} categories and ${result.productsAdded} products; existing data was preserved.`,
      );
    } finally {
      await pool.end();
    }
    return;
  }

  console.log("[seed] target: local embedded PGlite database (./.pglite)");
  const client = new PGlite(path.join(process.cwd(), ".pglite"));
  try {
    const db = drizzlePglite(client, { schema });
    await migratePglite(db, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
    const result = await seedMissingCatalog(db as unknown as Database);
    console.log(
      `[seed] added ${result.categoriesAdded} categories and ${result.productsAdded} products; existing data was preserved.`,
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err instanceof Error ? err.message : "Unknown error");
  process.exit(1);
});
