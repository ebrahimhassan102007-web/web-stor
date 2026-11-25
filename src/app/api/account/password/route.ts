import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getCurrentAccountUser, changePasswordAndRotateSession } from "@/lib/security/account-session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { passwordChangeSchema } from "@/lib/security/auth-validation";
import { readAuthJson } from "@/lib/security/auth-http";
import { enforceAuthRateLimit, isAuthSecretConfigured } from "@/lib/security/auth-rate-limit";
import { hashPassword, verifyPassword } from "@/lib/security/auth-core";
import { recordSecurityEvent } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return jsonError("REQUEST_REJECTED", 403);
  if (!isAuthSecretConfigured()) return jsonError("AUTH_NOT_CONFIGURED", 503);
  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = passwordChangeSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);
  try {
    const user = await getCurrentAccountUser();
    if (!user) return jsonError("AUTH_REQUIRED", 401);
    if (!(await enforceAuthRateLimit(request, "password-change", user.email, { windowMs: 15 * 60_000, ipLimit: 20, combinedLimit: 8, emailLimit: 8 }))) return jsonError("RATE_LIMITED", 429);
    const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
    if (!row?.passwordHash) return jsonError("PASSWORD_LOGIN_UNAVAILABLE", 409);
    if (!(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) return jsonError("CURRENT_PASSWORD_INVALID", 401);
    if (await verifyPassword(parsed.data.newPassword, row.passwordHash)) return jsonError("PASSWORD_REUSE", 400);
    const nextHash = await hashPassword(parsed.data.newPassword);
    if (!(await changePasswordAndRotateSession({ userId: user.id, expectedPasswordHash: row.passwordHash, nextPasswordHash: nextHash }))) return jsonError("AUTH_REQUIRED", 401);
    await recordSecurityEvent("password_changed", user.id);
    return jsonOk({ passwordChanged: true, otherSessionsRevoked: true });
  } catch { return jsonError("AUTH_UNAVAILABLE", 503); }
}
