/**
 * Safety policy for **destructive** PostgreSQL test runs.
 *
 * The integration suite truncates `order_items`, `orders`, `cart_items`,
 * `carts`, `products` and `categories`. That is only ever acceptable against a
 * database that is explicitly disposable, so `TEST_DATABASE_URL` must satisfy
 * all of the following before a single connection is opened:
 *
 *  1. `NODE_ENV` is not `production`.
 *  2. The URL is a PostgreSQL URL.
 *  3. The database name ends with the strict suffix `_test`
 *     (`webstor` / `test` / `webstor_backup_test2` are all rejected).
 *  4. The host is loopback/local (an empty host means a local unix socket).
 *     Remote hosts are rejected **by default** because a shared/staging
 *     database may contain data that matters.
 *  5. Remote hosts are only accepted when the operator sets
 *     `ALLOW_REMOTE_TEST_DATABASE=YES`. That opt-in is a deliberate,
 *     documented risk acceptance: the target *will be truncated*, so it must
 *     be a throwaway instance that nobody else uses.
 *
 * Error messages never contain credentials or the full connection URL — only a
 * credential-free `host:port/database` label.
 *
 * The module is dependency-free so the rules themselves are unit tested.
 */

/** Strict, documented suffix required for any database that tests truncate. */
export const TEST_DATABASE_NAME_SUFFIX = "_test";

/** Explicit opt-in that allows destructive tests against a remote host. */
export const REMOTE_TEST_DATABASE_OPT_IN = "ALLOW_REMOTE_TEST_DATABASE";
export const REMOTE_TEST_DATABASE_OPT_IN_VALUE = "YES";

export type TestDatabaseEnv = {
  readonly TEST_DATABASE_URL?: string | undefined;
  readonly NODE_ENV?: string | undefined;
  readonly ALLOW_REMOTE_TEST_DATABASE?: string | undefined;
};

export type TestDatabaseTarget = {
  readonly allowed: true;
  readonly connectionString: string;
  readonly host: string;
  readonly port: string;
  readonly databaseName: string;
  /** True when an explicit opt-in was required and supplied. */
  readonly remote: boolean;
  /** Credential-free description, e.g. `127.0.0.1:5432/webstor_test`. */
  readonly label: string;
};

export type TestDatabaseRejection = {
  readonly allowed: false;
  readonly kind:
    | "missing"
    | "production"
    | "invalid"
    | "unsafe-name"
    | "remote";
  readonly reason: string;
};

export type TestDatabaseResolution = TestDatabaseTarget | TestDatabaseRejection;

const LOOPBACK_NAMES = new Set(["localhost", "localhost.localdomain"]);

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

/**
 * True only for addresses that are this machine: `localhost`, `127.0.0.0/8`,
 * IPv6 loopback, IPv4-mapped loopback, or an empty hostname (unix socket).
 */
export function isLoopbackHost(hostname: string): boolean {
  // A trailing dot is the fully-qualified form of the same name.
  const host = stripBrackets(hostname.trim().toLowerCase()).replace(/\.$/, "");
  if (host === "") return true; // postgres:///db?host=/var/run/postgresql
  if (LOOPBACK_NAMES.has(host)) return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (host === "::1") return true;
  if (host === "0:0:0:0:0:0:0:1") return true;
  if (host === "::ffff:127.0.0.1") return true;
  return false;
}

/** The database name must end with the strict `_test` suffix. */
export function hasTestDatabaseSuffix(databaseName: string): boolean {
  return databaseName.toLowerCase().endsWith(TEST_DATABASE_NAME_SUFFIX) &&
    databaseName.length > TEST_DATABASE_NAME_SUFFIX.length;
}

function reject(
  kind: TestDatabaseRejection["kind"],
  reason: string,
): TestDatabaseRejection {
  return { allowed: false, kind, reason };
}

/**
 * Decides whether the configured `TEST_DATABASE_URL` may be truncated.
 * Never throws; use {@link assertTestDatabaseTarget} for the throwing form.
 */
export function resolveTestDatabaseTarget(
  env: TestDatabaseEnv = process.env,
): TestDatabaseResolution {
  if (env.NODE_ENV === "production") {
    return reject(
      "production",
      "Destructive database tests are refused when NODE_ENV=production.",
    );
  }

  const raw = env.TEST_DATABASE_URL?.trim();
  if (!raw) {
    return reject(
      "missing",
      "TEST_DATABASE_URL is not set — destructive database tests were skipped.",
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return reject("invalid", "TEST_DATABASE_URL is not a valid connection URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return reject(
      "invalid",
      "TEST_DATABASE_URL must use the postgres:// or postgresql:// scheme.",
    );
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName) {
    return reject("invalid", "TEST_DATABASE_URL must include a database name.");
  }
  if (!hasTestDatabaseSuffix(databaseName)) {
    return reject(
      "unsafe-name",
      `Refusing to truncate "${databaseName}": the database name must end with "${TEST_DATABASE_NAME_SUFFIX}".`,
    );
  }

  const host = stripBrackets(url.hostname);
  const port = url.port || "5432";
  const label = `${host === "" ? "unix-socket" : host}:${port}/${databaseName}`;
  const remote = !isLoopbackHost(host);

  if (remote) {
    if (env.ALLOW_REMOTE_TEST_DATABASE !== REMOTE_TEST_DATABASE_OPT_IN_VALUE) {
      return reject(
        "remote",
        `Refusing to truncate a non-loopback database (${label}). ` +
          `Set ${REMOTE_TEST_DATABASE_OPT_IN}=${REMOTE_TEST_DATABASE_OPT_IN_VALUE} only for a disposable, test-only instance that nobody else uses.`,
      );
    }
  }

  return {
    allowed: true,
    connectionString: raw,
    host,
    port,
    databaseName,
    remote,
    label,
  };
}

/**
 * Throwing form used by the integration suite: an unsafe target fails the run
 * loudly instead of silently skipping or hammering a shared database.
 */
export function assertTestDatabaseTarget(
  env: TestDatabaseEnv = process.env,
): TestDatabaseTarget {
  const resolution = resolveTestDatabaseTarget(env);
  if (!resolution.allowed) {
    const error = new Error(resolution.reason);
    error.name = "UnsafeTestDatabaseError";
    throw error;
  }
  return resolution;
}
