/**
 * Add missing E-Vora demo-catalog rows without deleting or rewriting existing
 * catalogue, carts, orders, or accounts.
 *
 * Run this only after the explicit schema migration step:
 *   npm run db:migrate
 *   npm run db:seed
 *
 * The script never migrates and never runs in production. A non-loopback
 * target additionally requires ALLOW_REMOTE_SEED=YES for an intentionally
 * disposable, non-production database.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/db/schema";
import { resolveDatabaseUrl } from "../src/lib/db/config";
import { seedMissingCatalog } from "../src/lib/db/seed-catalog";

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host === "::1") return true;
  const octets = host.split(".");
  return (
    octets.length === 4 &&
    octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255) &&
    Number(octets[0]) === 127
  );
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Catalog seeding is disabled in production.");
  }

  const databaseUrl = resolveDatabaseUrl();
  const host = new URL(databaseUrl).hostname;
  if (!isLoopbackHost(host) && process.env.ALLOW_REMOTE_SEED !== "YES") {
    throw new Error(
      "Refusing a remote database target. Set ALLOW_REMOTE_SEED=YES only for an explicitly disposable non-production database.",
    );
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const database = drizzle({ client: pool, schema });
    const result = await seedMissingCatalog(database);
    console.log(
      `[seed] added ${result.categoriesAdded} categories and ${result.productsAdded} products; existing rows were preserved.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    "[seed] failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
