import "server-only";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  drizzle as drizzleNode,
  type NodePgDatabase,
} from "drizzle-orm/node-postgres";
import { migrate as migrateNode } from "drizzle-orm/node-postgres/migrator";
import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import * as schema from "./schema";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "./seed-data";

/**
 * Database connection.
 *
 * Which engine is used is decided by DATABASE_URL:
 *
 *  - A REMOTE PostgreSQL URL (Neon, Supabase, ...) → the classic
 *    node-postgres pooled connection. This is the production path.
 *
 *  - No DATABASE_URL, or one pointing at localhost → an EMBEDDED
 *    PostgreSQL (PGlite, WebAssembly) running inside this Node process,
 *    persisting its files to `./.pglite/`. No external database server
 *    to install or start — `npm run dev` is all you need.
 *    (Delete the `.pglite/` folder to wipe the dev database.)
 *
 * All queries go through Drizzle ORM, which always uses parameterized
 * statements — user input is never interpolated into SQL.
 *
 * On first boot (see `src/instrumentation.ts`) migrations are applied
 * and, if the catalog is empty, it is seeded automatically.
 */

type Database = NodePgDatabase<typeof schema>;

const PGLITE_DIR = path.join(process.cwd(), ".pglite");

function isRemoteDatabaseUrl(raw?: string): boolean {
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname;
    return !["", "localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return false;
  }
}

const useRemotePostgres = isRemoteDatabaseUrl(process.env.DATABASE_URL);

const globalForDb = globalThis as unknown as {
  __webstorDb?: Database;
  __webstorPglite?: PGlite;
  __webstorDbReady?: Promise<void>;
};

function createDb(): Database {
  if (useRemotePostgres) {
    return drizzleNode({
      client: new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }),
      schema,
    });
  }

  console.log(
    "[db] using embedded PGlite database (./.pglite) — " +
      "set a remote DATABASE_URL to use an external PostgreSQL instead.",
  );
  const client = (globalForDb.__webstorPglite ??= new PGlite(PGLITE_DIR));
  // Both drivers expose the identical Drizzle PostgreSQL query API that
  // this application uses, so the PGlite instance can be safely typed as
  // the node-postgres one.
  return drizzlePglite(client, { schema }) as unknown as Database;
}

export const db: Database = globalForDb.__webstorDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__webstorDb = db;
}

/* ------------------------------------------------------------------ */
/* First-boot initialisation: migrations + catalog seed                */
/* ------------------------------------------------------------------ */

async function seedCatalogIfEmpty(): Promise<void> {
  const [existing] = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .limit(1);
  if (existing) return;

  console.log("[db] empty database detected — seeding catalog...");
  await db.transaction(async (tx) => {
    const insertedCategories = await tx
      .insert(schema.categories)
      .values(SEED_CATEGORIES.map((c) => ({ ...c })))
      .returning();

    const idBySlug = new Map(insertedCategories.map((c) => [c.slug, c.id]));

    await tx.insert(schema.products).values(
      SEED_PRODUCTS.map(({ category, ...p }) => ({
        ...p,
        featured: p.featured ?? false,
        categoryId: idBySlug.get(category)!,
      })),
    );
  });
  console.log(
    `[db] seeded ${SEED_CATEGORIES.length} categories, ${SEED_PRODUCTS.length} products.`,
  );
}

/**
 * Applies pending migrations and seeds the catalog when empty.
 * Memoized: safe to call repeatedly (subsequent calls are no-ops).
 * Called once at server startup from `src/instrumentation.ts`.
 */
export function ensureDbReady(): Promise<void> {
  globalForDb.__webstorDbReady ??= (async () => {
    const migrationsFolder = path.join(process.cwd(), "drizzle");
    if (useRemotePostgres) {
      await migrateNode(db, { migrationsFolder });
    } else {
      await globalForDb.__webstorPglite?.waitReady;
      await migratePglite(db as unknown as PgliteDatabase<typeof schema>, {
        migrationsFolder,
      });
    }
    await seedCatalogIfEmpty();
    console.log("[db] database ready.");
  })().catch((err) => {
    // Don't cache a failed initialisation — allow a later retry.
    globalForDb.__webstorDbReady = undefined;
    throw err;
  });
  return globalForDb.__webstorDbReady;
}

export * from "./schema";
