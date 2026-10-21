import "server-only";
import fs from "node:fs";
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
  __evoraDb?: Database;
  __evoraPglite?: PGlite;
  __evoraDbReady?: Promise<void>;
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
  const client = (globalForDb.__evoraPglite ??= new PGlite(PGLITE_DIR));
  // Both drivers expose the identical Drizzle PostgreSQL query API that
  // this application uses, so the PGlite instance can be safely typed as
  // the node-postgres one.
  return drizzlePglite(client, { schema }) as unknown as Database;
}

/**
 * The real Drizzle instance lives behind a thin proxy so the embedded
 * database can self-heal at boot (see `ensureDbReady`): if the local
 * `.pglite/` files are ever damaged (hard kill mid-write, two dev
 * processes racing, ...), the broken folder is moved aside and a fresh
 * instance is swapped in — importers keep using `db` untouched.
 */
let liveDb: Database = globalForDb.__evoraDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__evoraDb = liveDb;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const value = Reflect.get(liveDb, prop, liveDb);
    return typeof value === "function" ? value.bind(liveDb) : value;
  },
  set(_target, prop, value) {
    return Reflect.set(liveDb, prop, value);
  },
});

/* ------------------------------------------------------------------ */
/* First-boot initialisation: migrations + catalog seed                */
/* ------------------------------------------------------------------ */

/** Seed only an empty non-production database; never replace an existing catalog. */
async function seedCatalogIfEmpty(): Promise<void> {
  const [anyCategory] = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .limit(1);
  if (anyCategory) {
    console.log("[db] existing catalog preserved; automatic seeding made no changes.");
    return;
  }
  if (process.env.NODE_ENV === "production") {
    console.warn("[db] automatic demo seeding is disabled in production.");
    return;
  }

  await db.transaction(async (tx) => {
    const insertedCategories = await tx
      .insert(schema.categories)
      .values(SEED_CATEGORIES.map((category) => ({ ...category })))
      .returning();
    const idBySlug = new Map(insertedCategories.map((category) => [category.slug, category.id]));
    await tx.insert(schema.products).values(
      SEED_PRODUCTS.map(({ category, ...product }) => ({
        ...product,
        featured: product.featured ?? false,
        categoryId: idBySlug.get(category)!,
      })),
    );
  });
  console.log(`[db] seeded ${SEED_CATEGORIES.length} categories and ${SEED_PRODUCTS.length} products.`);
}

/**
 * Waits for the embedded engine, recovering automatically if the local
 * `.pglite/` data files are damaged: the broken folder is preserved as
 * `.pglite.broken-<timestamp>` and a fresh database takes its place
 * (dev data is disposable; the catalog is reseeded right after).
 */
async function waitForEmbeddedDb(): Promise<void> {
  const client = globalForDb.__evoraPglite;
  if (!client) return;
  try {
    await client.waitReady;
  } catch (err) {
    if (!fs.existsSync(path.join(PGLITE_DIR, "PG_VERSION"))) {
      throw err; // nothing on disk to recover — a real startup failure
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error("Refusing to reset damaged embedded PGlite data in production.");
    }
    console.error(
      "[db] embedded database failed to start — its local files look damaged.",
      err instanceof Error ? err.message : err,
    );
    await client.close().catch(() => {});
    const brokenDir = `${PGLITE_DIR}.broken-${Date.now()}`;
    fs.renameSync(PGLITE_DIR, brokenDir);
    console.error(
      `[db] moved the damaged database to ${path.basename(brokenDir)}/ ` +
        "and created a fresh one (previous dev data was reset).",
    );
    const freshClient = new PGlite(PGLITE_DIR);
    globalForDb.__evoraPglite = freshClient;
    liveDb = drizzlePglite(freshClient, { schema }) as unknown as Database;
    globalForDb.__evoraDb = liveDb;
    await freshClient.waitReady;
  }
}

/**
 * Applies pending migrations and seeds the catalog when empty.
 * Memoized: safe to call repeatedly (subsequent calls are no-ops).
 * Called once at server startup from `src/instrumentation.ts`.
 */
export function ensureDbReady(): Promise<void> {
  globalForDb.__evoraDbReady ??= (async () => {
    const migrationsFolder = path.join(process.cwd(), "drizzle");
    if (useRemotePostgres) {
      await migrateNode(liveDb, { migrationsFolder });
    } else {
      await waitForEmbeddedDb();
      await migratePglite(liveDb as unknown as PgliteDatabase<typeof schema>, {
        migrationsFolder,
      });
    }
    await seedCatalogIfEmpty();
    console.log("[db] database ready.");
  })().catch((err) => {
    // Don't cache a failed initialisation — allow a later retry.
    globalForDb.__evoraDbReady = undefined;
    throw err;
  });
  return globalForDb.__evoraDbReady;
}

export * from "./schema";
