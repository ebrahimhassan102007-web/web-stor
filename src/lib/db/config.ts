/**
 * Database connection configuration.
 *
 * This application has exactly one runtime database architecture: an external
 * PostgreSQL server reached through `DATABASE_URL` (node-postgres + Drizzle).
 * There is deliberately **no embedded, in-process or fallback database** — if
 * the configured URL is missing or unsupported, startup fails closed instead
 * of quietly opening a local/embedded store.
 *
 * The logic lives in a dependency-free module so it can be unit tested
 * without opening a database connection.
 */

type DatabaseConfigEnv = {
  /** Accepted so `process.env` can be passed directly. */
  readonly NODE_ENV?: string;
  readonly DATABASE_URL?: string;
};

/**
 * Resolves and validates `DATABASE_URL`.
 *
 * Missing, unparseable or non-PostgreSQL URLs are rejected in every
 * environment, so a misconfigured deployment fails at startup rather than
 * falling back to another database engine.
 */
export function resolveDatabaseUrl(
  env: DatabaseConfigEnv = process.env,
): string {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      "DATABASE_URL environment variable is not set — this app has no embedded or fallback database",
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(
      "DATABASE_URL must use the postgres:// or postgresql:// scheme",
    );
  }
  if (!url.hostname) {
    throw new Error("DATABASE_URL must include a database host");
  }

  return raw;
}
