/**
 * Server startup validation only.
 *
 * Schema migrations are intentionally *not* run at application startup. Run
 * `npm run db:migrate` as a separate, reviewed deployment step, then seed only
 * when intentionally requested with `npm run db:seed`.
 *
 * Until DATABASE_URL is configured, public catalogue pages render a clearly
 * limited, read-only preview from the checked-in catalogue source. APIs that
 * persist carts, accounts, or orders still require PostgreSQL and fail closed.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // A build is not a deployment: `next build` (including Vercel's builder) may
  // load this hook while collecting page data, before runtime secrets exist.
  // The environment is validated at every server start instead.
  const { assertValidEnv, isBuildPhase } = await import("./lib/env");
  if (isBuildPhase()) return;
  // S-17: fail fast on invalid secrets/origin/partial provider config.
  assertValidEnv();
  if (process.env.DATABASE_URL?.trim()) {
    const { assertDatabaseConfigured } = await import("./lib/db/config");
    assertDatabaseConfigured();
  }
}
