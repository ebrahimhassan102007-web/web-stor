/**
 * Server startup validation only.
 *
 * Schema migrations are intentionally *not* run at application startup. Run
 * `npm run db:migrate` as a separate, reviewed deployment step, then seed only
 * when intentionally requested with `npm run db:seed`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertDatabaseConfigured } = await import("./lib/db/config");
    assertDatabaseConfigured();
  }
}
