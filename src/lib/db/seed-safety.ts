/**
 * Guards for catalog seeding.
 *
 * Seeding is additive only: it never deletes or rewrites existing rows, and it
 * never runs against a production database. These helpers are pure so they can
 * be unit tested without a database connection.
 */
export function assertNotProduction(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === "production") {
    throw new Error("Catalog seeding is disabled in production.");
  }
}
