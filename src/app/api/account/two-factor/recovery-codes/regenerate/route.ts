import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, users } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { readAuthJson } from "@/lib/security/auth-http";
import { verifyPassword } from "@/lib/security/auth-core";
import { normalizeSecurityInput, normalizeVerificationDigits } from "@/lib/security/digits";
import { regenerateRecoveryCodes } from "@/lib/security/two-factor";
import { recordSecurityEvent } from "@/lib/security/audit-log";
import { enforceAuthRateLimit } from "@/lib/security/auth-rate-limit";

const schema = z.object({ code: z.string().transform(normalizeSecurityInput).transform(normalizeVerificationDigits).pipe(z.string().min(6).max(32)).optional(), password: z.string().max(128).optional() });
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return jsonError("REQUEST_REJECTED", 403);
  const user = await getCurrentAccountUser();
  if (!user) return jsonError("AUTH_REQUIRED", 401);
  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);
  try {
    if (!(await enforceAuthRateLimit(request, "two-factor-recovery-regenerate", user.email, { windowMs: 15 * 60 * 1000, ipLimit: 8, emailLimit: 5 }))) return jsonError("RATE_LIMITED", 429);
    const [record] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
    const passwordConfirmed = Boolean(record?.passwordHash && typeof parsed.data.password === "string" && await verifyPassword(parsed.data.password, record.passwordHash));
    if (parsed.data.password !== undefined && !passwordConfirmed) return jsonError("CONFIRMATION_REQUIRED", 401);
    if (!passwordConfirmed && !parsed.data.code) return jsonError("CONFIRMATION_REQUIRED", 401);
    const recoveryCodes = await regenerateRecoveryCodes(user.id, parsed.data.code, passwordConfirmed);
    if (!recoveryCodes) return jsonError("TWO_FACTOR_CONFIRMATION_INVALID", 401);
    await recordSecurityEvent("totp_recovery_regenerated", user.id);
    return jsonOk({ recoveryCodes });
  } catch { return jsonError("TWO_FACTOR_UNAVAILABLE", 503); }
}
