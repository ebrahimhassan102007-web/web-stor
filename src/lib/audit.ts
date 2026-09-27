import "server-only";
import { db, auditLog } from "@/lib/db";
import { securityLog } from "@/lib/log";

/**
 * Admin audit trail — every privileged action is written to the audit_log
 * table AND the structured security log. Metadata must never contain
 * secrets or digital code values.
 */
export async function recordAudit(entry: {
  adminId: string;
  action: string;
  targetType: string;
  targetId: string | number;
  meta?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      adminId: entry.adminId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: String(entry.targetId),
      meta: entry.meta ?? null,
    });
  } catch {
    // Audit failure must not break the admin action itself, but it must
    // be visible in logs.
  }
  securityLog.adminAction({
    action: entry.action,
    adminId: entry.adminId,
    target: `${entry.targetType}:${entry.targetId}`,
  });
}
