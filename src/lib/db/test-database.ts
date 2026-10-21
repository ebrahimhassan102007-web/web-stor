/**
 * Safety policy for **destructive** PostgreSQL test runs.
 *
 * The integration suite truncates `order_items`, `orders`, `cart_items`,
 * `carts`, `products` and `categories`. That is only ever acceptable against a
 * database that is explicitly disposable, so `TEST_DATABASE_URL` must satisfy
 * all of the following before a single connection is opened:
 *
 *  1. `NODE_ENV` is not `production`.
 *  2. The URL is a PostgreSQL URL with an explicit host.
 *  3. The database name ends with the strict suffix `_test`
 *     (`webstor` / `test` / `webstor_backup_test2` are all rejected).
 *  4. The **effective** host — the one node-postgres will actually connect to —
 *     is loopback/local. Remote hosts are rejected **by default** because a
 *     shared/staging database may contain data that matters.
 *  5. Remote hosts are only accepted when the operator sets
 *     `ALLOW_REMOTE_TEST_DATABASE=YES`. That opt-in is a deliberate,
 *     documented risk acceptance: the target *will be truncated*, so it must
 *     be a throwaway instance that nobody else uses.
 *
 * ## Why the effective host matters
 *
 * `pg` parses the connection string with `pg-connection-string`, whose rules
 * differ from `URL`:
 *
 *  - a `?host=` query parameter **overrides** the URI authority host
 *    (`postgres://me@localhost:5432/webstor_test?host=db.example.com` really
 *    connects to `db.example.com`);
 *  - repeated `host` parameters are applied in order, so the **last** one wins
 *    (`?host=localhost&host=db.example.com` connects to `db.example.com`);
 *  - a host containing `/` is a unix socket path, not a host name;
 *  - when no host is given at all, `PGHOST` (or the driver default
 *    `localhost`) is used instead.
 *
 * Classifying `URL.hostname` alone therefore let a remote target look local.
 * This module resolves the host the way the driver does and **rejects anything
 * ambiguous or conflicting** rather than guessing, e.g.:
 *
 *  - authority host and `?host=` disagree,
 *  - `host` is repeated,
 *  - `host` contains a comma-separated list,
 *  - any other host-like parameter is present (`hostaddr`, `host[]`, `HOST`…),
 *  - the authority host is percent-encoded (unix-socket-in-authority form),
 *  - no explicit host is present (the driver would fall back to `PGHOST`).
 *
 * Error messages never contain credentials or the full connection URL — only a
 * credential-free `host:port/database` label.
 *
 * The module is dependency-free (no `pg` import) so it can never open a
 * connection, and the rules are cross-checked against the installed
 * `pg-connection-string` parser in `tests/test-database-safety.test.ts`.
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
  /** Effective host PostgreSQL will use (normalised, brackets removed). */
  readonly host: string;
  readonly port: string;
  readonly databaseName: string;
  /** Where the effective host came from. */
  readonly hostSource: "authority" | "query" | "unix-socket";
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
    | "ambiguous"
    | "unsafe-name"
    | "remote";
  readonly reason: string;
};

export type TestDatabaseResolution = TestDatabaseTarget | TestDatabaseRejection;

/** Resolved host of a connection URL, mirroring `pg-connection-string@2`. */
export type ConnectionHostResolution =
  | {
      readonly ok: true;
      readonly host: string;
      readonly source: "authority" | "query" | "unix-socket";
    }
  | { readonly ok: false; readonly reason: string };

const LOOPBACK_NAMES = new Set(["localhost", "localhost.localdomain"]);

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

/**
 * Normalises a host the way the driver compares/uses it: trimmed, lowercased
 * and without a trailing dot (the fully-qualified form of the same name).
 */
function normalizeHost(host: string): string {
  return stripBrackets(host.trim().toLowerCase()).replace(/\.$/, "");
}

/**
 * True only for addresses that are this machine: `localhost`, `127.0.0.0/8`,
 * IPv6 loopback, IPv4-mapped loopback, or an empty hostname (unix socket).
 */
export function isLoopbackHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (host === "") return true; // driver default / unix socket
  if (LOOPBACK_NAMES.has(host)) return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (host === "::1") return true;
  if (host === "0:0:0:0:0:0:0:1") return true;
  if (host === "::ffff:127.0.0.1") return true;
  return false;
}

/** `pg` treats any host starting with `/` as a local unix socket path. */
export function isUnixSocketHost(host: string): boolean {
  return host.startsWith("/");
}

/**
 * Resolves the host node-postgres will actually use, or explains why the URL
 * is too ambiguous to classify safely.
 *
 * Mirrors `pg-connection-string@2.14` (`parse()`): query parameters overwrite
 * authority parts, later duplicates overwrite earlier ones, and a missing host
 * falls back to `PGHOST`/`localhost`. Anything this deployment cannot prove to
 * be a single unambiguous host is rejected.
 */
export function resolveEffectiveConnectionHost(
  url: URL,
): ConnectionHostResolution {
  const hostLikeKeys = [...url.searchParams.keys()].filter((key) =>
    /^host/i.test(key),
  );
  const hostValues = url.searchParams.getAll("host");

  // `hostaddr`, `host[]`, `HOST`, `hostname`, … are not part of the supported
  // pg-connection-string contract here; refuse instead of guessing whether
  // they influence the target.
  const unsupportedKeys = hostLikeKeys.filter((key) => key !== "host");
  if (unsupportedKeys.length > 0) {
    return {
      ok: false,
      reason: `Unsupported host parameter(s) ${unsupportedKeys
        .map((key) => `"${key}"`)
        .join(", ")}: only a single "host" parameter can be validated.`,
    };
  }

  if (hostValues.length > 1) {
    return {
      ok: false,
      reason:
        'The URL repeats the "host" parameter; PostgreSQL applies the last one, so the effective target is ambiguous.',
    };
  }

  const authorityRaw = url.hostname;
  // e.g. postgres://%2Fvar%2Frun%2Fpostgresql/webstor_test — pg-connection-string
  // folds this encoded form into the database name, which cannot be validated.
  if (authorityRaw.includes("%")) {
    return {
      ok: false,
      reason:
        "The URL encodes its host instead of using a plain host name; refusing to guess the effective target.",
    };
  }

  const authorityHost = normalizeHost(authorityRaw);

  if (hostValues.length === 1) {
    const queryValue = hostValues[0] ?? "";
    if (queryValue.includes(",")) {
      return {
        ok: false,
        reason:
          'The "host" parameter contains a comma-separated list of targets, which cannot be validated.',
      };
    }

    const queryHost = normalizeHost(queryValue);

    // An empty ?host= falls back to the authority in pg-connection-string.
    if (queryHost !== "") {
      if (authorityHost !== "" && authorityHost !== queryHost) {
        return {
          ok: false,
          reason:
            'The URL authority and its "host" parameter name different servers; refusing to guess which one PostgreSQL will use.',
        };
      }
      return {
        ok: true,
        host: queryHost,
        source: isUnixSocketHost(queryHost) ? "unix-socket" : "query",
      };
    }
  }

  if (authorityHost === "") {
    return {
      ok: false,
      reason:
        "The URL does not specify a host; PostgreSQL would fall back to PGHOST or localhost, so the effective target cannot be validated.",
    };
  }

  return {
    ok: true,
    host: authorityHost,
    source: isUnixSocketHost(authorityHost) ? "unix-socket" : "authority",
  };
}

/** The database name must end with the strict `_test` suffix. */
export function hasTestDatabaseSuffix(databaseName: string): boolean {
  return (
    databaseName.toLowerCase().endsWith(TEST_DATABASE_NAME_SUFFIX) &&
    databaseName.length > TEST_DATABASE_NAME_SUFFIX.length
  );
}

function reject(
  kind: TestDatabaseRejection["kind"],
  reason: string,
): TestDatabaseRejection {
  return { allowed: false, kind, reason };
}

/**
 * Decides whether the configured `TEST_DATABASE_URL` may be truncated.
 * Pure and synchronous: it never opens a connection. Use
 * {@link assertTestDatabaseTarget} for the throwing form.
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

  const hostResolution = resolveEffectiveConnectionHost(url);
  if (!hostResolution.ok) {
    return reject("ambiguous", hostResolution.reason);
  }

  const host = hostResolution.host;
  const port = url.port || "5432";
  const label = `${host}:${port}/${databaseName}`;
  const remote =
    !isUnixSocketHost(host) && !isLoopbackHost(host);

  if (remote && env.ALLOW_REMOTE_TEST_DATABASE !== REMOTE_TEST_DATABASE_OPT_IN_VALUE) {
    return reject(
      "remote",
      `Refusing to truncate a non-loopback database (${label}). ` +
        `Set ${REMOTE_TEST_DATABASE_OPT_IN}=${REMOTE_TEST_DATABASE_OPT_IN_VALUE} only for a disposable, test-only instance that nobody else uses.`,
    );
  }

  return {
    allowed: true,
    connectionString: raw,
    host,
    port,
    databaseName,
    hostSource: hostResolution.source,
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
