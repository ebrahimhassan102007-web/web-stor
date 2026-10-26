import "server-only";
import { db, securityAuditLog } from "@/lib/db";

/**
 * Security event audit trail (S-15). Records machine event names only —
 * never emails, tokens, passwords, or other secrets/PII. Failures to write
 * the audit row never break the user flow.
 */
export type SecurityEvent =
  | "login_success"
  | "login_failed"
  | "register"
  | "email_verified"
  | "google_linked"
  | "logout"
  | "sessions_revoked_all"
  | "admin_access"
  | "admin_denied";

export async function recordSecurityEvent(
  event: SecurityEvent,
  userId: string | null,
  detail = "",
): Promise<void> {
  try {
    await db.insert(securityAuditLog).values({
      event,
      userId,
      detail: detail.slice(0, 128),
    });
  } catch {
    // Audit is best-effort; the request itself must not fail because of it.
  }
}
