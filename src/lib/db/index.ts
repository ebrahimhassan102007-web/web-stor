import "server-only";
import {
  drizzle as drizzleNode,
  type NodePgDatabase,
} from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { resolveDatabaseUrl } from "./config";
import * as schema from "./schema";

/**
 * The application's sole database connection.
 *
 * All queries go through Drizzle ORM and node-postgres. No migrations, seed
 * writes, embedded database, or schema repair happen here. Database schema
 * changes are an explicit operator action (`npm run db:migrate`).
 */
type Database = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __evoraPool?: Pool;
  __evoraDb?: Database;
};

let liveDb: Database | undefined = globalForDb.__evoraDb;

function getDatabase(): Database {
  if (liveDb) return liveDb;

  // Resolving the URL is deliberately separate from connecting. The startup
  // hook performs the same validation, while this lazy path keeps build-time
  // module loading from opening a socket. Any actual query still fails closed
  // when configuration is missing or malformed.
  const pool = (globalForDb.__evoraPool ??= new Pool({
    connectionString: resolveDatabaseUrl(),
    max: 10,
  }));
  liveDb = drizzleNode({ client: pool, schema });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__evoraDb = liveDb;
  }
  return liveDb;
}

/**
 * A small lazy proxy preserves Drizzle's API while ensuring that merely
 * importing a route never opens a database connection.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const database = getDatabase();
    const value = Reflect.get(database, prop, database);
    return typeof value === "function" ? value.bind(database) : value;
  },
  set(_target, prop, value) {
    return Reflect.set(getDatabase(), prop, value);
  },
});

export * from "./schema";
