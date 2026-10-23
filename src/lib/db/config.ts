/**
 * Runtime database configuration.
 *
 * E-Vora uses an external PostgreSQL database in every runtime environment.
 * There is deliberately no embedded or fallback database: a missing, malformed
 * or unsupported DATABASE_URL must stop the process instead of silently
 * selecting a different store.
 *
 * This module is dependency-free so it can also be used by startup checks and
 * command-line tooling without opening a socket.
 */
export type DatabaseConfigEnv = {
  readonly NODE_ENV?: string | undefined;
  readonly DATABASE_URL?: string | undefined;
};

/** Resolve and validate the only runtime database connection setting. */
export function resolveDatabaseUrl(
  env: DatabaseConfigEnv = process.env,
): string {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      "DATABASE_URL environment variable is not set — E-Vora has no embedded or fallback database",
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
  if (!url.pathname || url.pathname === "/") {
    throw new Error("DATABASE_URL must include a database name");
  }

  // Do not let a URL with credentials in its query string or an ambiguous
  // host override silently select a different server. node-postgres supports
  // many libpq options; the runtime contract intentionally accepts one plain
  // PostgreSQL URL with an authority host.
  if (url.searchParams.has("host") || url.searchParams.has("hostaddr")) {
    throw new Error(
      "DATABASE_URL must specify its host in the URL authority, not a host override",
    );
  }

  return raw;
}

/** Validate configuration without creating a pool or connecting to PostgreSQL. */
export function assertDatabaseConfigured(
  env: DatabaseConfigEnv = process.env,
): void {
  resolveDatabaseUrl(env);
}
