import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { readAuthJson } from "@/lib/security/auth-http";
import { guardMutatingRequest } from "@/lib/security/request-guard";
import { passwordResetSchema } from "@/lib/security/auth-validation";
import { enforceAuthRateLimit, isAuthSecretConfigured } from "@/lib/security/auth-rate-limit";
import { hashPassword } from "@/lib/security/auth-core";
import { consumePasswordReset, isConsumablePasswordReset } from "@/lib/security/password-reset";
import { recordSecurityEvent } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const guard = await guardMutatingRequest(request);
  if (guard) return guard;
  if (!isAuthSecretConfigured()) return jsonError("AUTH_NOT_CONFIGURED", 503);
  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = passwordResetSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);
  try {
    if (!(await enforceAuthRateLimit(request, "password-reset-consume", undefined, { windowMs: 15 * 60_000, ipLimit: 20 }))) return jsonError("RATE_LIMITED", 429);
    // Reject unknown/expired/consumed tokens BEFORE running scrypt, so an
    // unauthenticated flood of random tokens cannot burn CPU per request.
    if (!(await isConsumablePasswordReset(parsed.data.token))) return jsonError("RESET_TOKEN_INVALID", 400);
    const nextHash = await hashPassword(parsed.data.password);
    const userId = await consumePasswordReset(parsed.data.token, nextHash);
    if (!userId) return jsonError("RESET_TOKEN_INVALID", 400);
    await recordSecurityEvent("password_reset_completed", userId);
    return jsonOk({ passwordReset: true });
  } catch { return jsonError("AUTH_UNAVAILABLE", 503); }
}
