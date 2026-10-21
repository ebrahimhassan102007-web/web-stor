import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { resolveDatabaseUrl } from "./config";
import * as schema from "./schema";

/**
 * Single, lazily-created connection pool.
 *
 * All queries in this application go through Drizzle ORM, which always uses
 * parameterized statements — user input is never interpolated into SQL.
 */
const globalForDb = globalThis as unknown as {
  __webstorPool?: Pool;
  __webstorDb?: NodePgDatabase<typeof schema>;
};

function createPool(): Pool {
  // Validated once at startup: a missing or unsupported DATABASE_URL throws
  // here, so the app can never fall back to a local/embedded database.
  return new Pool({ connectionString: resolveDatabaseUrl(), max: 10 });
}

export const db: NodePgDatabase<typeof schema> =
  globalForDb.__webstorDb ??
  drizzle({ client: (globalForDb.__webstorPool ??= createPool()), schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__webstorDb = db;
}

export * from "./schema";
