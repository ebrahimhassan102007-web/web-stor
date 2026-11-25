/**
 * Log-safe error fingerprinting (S-15).
 *
 * Driver errors from Drizzle/pg embed the rendered SQL and its bound
 * parameters, which routinely contain customer emails, cart ids and order
 * references. Persisting the raw object therefore leaks personal data into log
 * storage. Only the error class name and a short driver/`Error` code are safe
 * and are all that triage actually needs.
 *
 * This module is deliberately dependency-free so it can be unit tested without
 * the server-only runtime.
 */
export type LogSafeError = { name: string; code?: string };

export function safeErrorForLog(err: unknown): LogSafeError {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return {
      name: err.name,
      ...(typeof code === "string" && /^[A-Za-z0-9._-]{1,32}$/.test(code)
        ? { code }
        : {}),
    };
  }
  return { name: typeof err };
}
