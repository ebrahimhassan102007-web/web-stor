import "server-only";

/**
 * Structured JSON-lines security/event logging.
 *
 * Rules:
 *  - never log passwords, tokens, session ids, cookie values or secrets;
 *  - keep personal data to the minimum needed for incident investigation
 *    (an email for failed logins is deliberate and documented).
 */
type LogLevel = "info" | "warn" | "error";

export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const securityLog = {
  authFailure: (fields: Record<string, string | undefined>) =>
    logEvent("warn", "auth.failure", fields),
  authSuccess: (fields: Record<string, string | undefined>) =>
    logEvent("info", "auth.success", fields),
  authzDenied: (fields: Record<string, string | undefined>) =>
    logEvent("warn", "authz.denied", fields),
  rateLimited: (fields: Record<string, string | undefined>) =>
    logEvent("warn", "rate.limited", fields),
  adminAction: (fields: Record<string, string | number | undefined>) =>
    logEvent("info", "admin.action", fields),
  checkoutFailure: (fields: Record<string, string | undefined>) =>
    logEvent("warn", "checkout.failure", fields),
};
