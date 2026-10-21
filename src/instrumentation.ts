/**
 * Server startup hook (Next.js instrumentation).
 *
 * `register()` runs once, before the first request is handled. We use it
 * to prepare the database — apply migrations and, on a fresh database,
 * seed the catalog — so a brand-new checkout works with a single
 * `npm run dev`, no manual database commands needed.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDbReady } = await import("./lib/db");
    await ensureDbReady();
  }
}
