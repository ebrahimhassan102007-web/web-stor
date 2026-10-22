import { defineConfig } from "drizzle-kit";
import { resolveDatabaseUrl } from "./src/lib/db/config";

// Schema generation does not need a database. Commands that do connect must
// explicitly select a PostgreSQL URL; there is no PGlite or other fallback.
const selectedUrl =
  process.env.DRIZZLE_KIT_DATABASE_URL ?? process.env.DATABASE_URL;
const databaseUrl = selectedUrl
  ? resolveDatabaseUrl({ DATABASE_URL: selectedUrl })
  : "";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
