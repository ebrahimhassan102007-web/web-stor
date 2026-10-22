import { defineConfig } from "drizzle-kit";

const explicitDrizzleDatabaseUrl = process.env.DRIZZLE_KIT_DATABASE_URL;
const databaseUrl = explicitDrizzleDatabaseUrl || process.env.DATABASE_URL;
const explicitlyUseDatabaseUrl = Boolean(explicitDrizzleDatabaseUrl);

function isRemoteDatabaseUrl(raw?: string): boolean {
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname;
    return !["", "localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return false;
  }
}

/**
 * Matches the runtime engine selection in `src/lib/db/index.ts`, with one
 * explicit tooling-only override for disposable/local PostgreSQL test targets:
 *  - Remote DATABASE_URL (Neon, ...) → drizzle-kit talks to that PostgreSQL.
 *  - DRIZZLE_KIT_DATABASE_URL, when set, explicitly selects that PostgreSQL
 *    URL even if it is localhost (used by the isolated CI service).
 *  - Otherwise → embedded PGlite in `./.pglite/` (the zero-config dev DB).
 *
 * Typical workflow after editing the schema:
 *   npm run db:generate   → writes a new migration into ./drizzle
 *   (applied automatically on the next server boot)
 */
export default (explicitlyUseDatabaseUrl || isRemoteDatabaseUrl(databaseUrl))
  ? defineConfig({
      schema: "./src/lib/db/schema.ts",
      out: "./drizzle",
      dialect: "postgresql",
      dbCredentials: { url: databaseUrl! },
      strict: true,
      verbose: true,
    })
  : defineConfig({
      schema: "./src/lib/db/schema.ts",
      out: "./drizzle",
      dialect: "postgresql",
      driver: "pglite",
      // For the pglite driver, `url` is the local data directory.
      dbCredentials: { url: "./.pglite" },
      verbose: true,
    });
