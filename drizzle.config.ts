import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

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
 * Matches the runtime engine selection in `src/lib/db/index.ts`:
 *  - Remote DATABASE_URL (Neon, ...) → drizzle-kit talks to that PostgreSQL.
 *  - Otherwise → the embedded PGlite database in `./.pglite/`
 *    (the one `npm run dev` creates and uses automatically).
 *
 * Typical workflow after editing the schema:
 *   npm run db:generate   → writes a new migration into ./drizzle
 *   (applied automatically on the next server boot)
 */
export default isRemoteDatabaseUrl(databaseUrl)
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
