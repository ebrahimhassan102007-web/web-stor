import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { readAuthJson } from "@/lib/security/auth-http";
import { verifyPassword } from "@/lib/security/auth-core";
import { setupTotp } from "@/lib/security/two-factor";
import { recordSecurityEvent } from "@/lib/security/audit-log";
import { enforceAuthRateLimit } from "@/lib/security/auth-rate-limit";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return jsonError("REQUEST_REJECTED", 403);
  const user = await getCurrentAccountUser();
  if (!user) return jsonError("AUTH_REQUIRED", 401);
  const body = await readAuthJson(request);
  if (!body.ok || typeof body.value !== "object" || body.value === null) return jsonError("INVALID_BODY", 400);
  const password = (body.value as { password?: unknown }).password;
  try {
    if (!(await enforceAuthRateLimit(request, "two-factor-setup", user.email, { windowMs: 15 * 60 * 1000, ipLimit: 8, emailLimit: 5 }))) return jsonError("RATE_LIMITED", 429);
    const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
    if (row?.passwordHash && (typeof password !== "string" || !(await verifyPassword(password, row.passwordHash)))) return jsonError("CONFIRMATION_REQUIRED", 401);
    const setup = await setupTotp(user.id, user.email);
    await recordSecurityEvent("totp_setup_started", user.id);
    return jsonOk(setup);
  } catch (error) {
    if (error instanceof Error && error.message === "TOTP_ALREADY_ENABLED") return jsonError("TOTP_ALREADY_ENABLED", 409);
    return jsonError("TWO_FACTOR_UNAVAILABLE", 503);
  }
}
