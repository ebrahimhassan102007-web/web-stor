import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/http";
import { guardMutatingRequest } from "@/lib/security/request-guard";
import { readAuthJson } from "@/lib/security/auth-http";
import { normalizeSecurityInput, normalizeVerificationDigits } from "@/lib/security/digits";
import { enforceAuthRateLimit, isAuthSecretConfigured } from "@/lib/security/auth-rate-limit";
import { safeReturnPath } from "@/lib/security/auth-core";
import { verifyPendingTwoFactor } from "@/lib/security/two-factor";
import { recordSecurityEvent } from "@/lib/security/audit-log";

const schema = z.object({ code: z.string().transform(normalizeSecurityInput).transform(normalizeVerificationDigits).pipe(z.string().min(6).max(32)) });
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const guard = await guardMutatingRequest(request);
  if (guard) return guard;
  if (!isAuthSecretConfigured()) return jsonError("AUTH_NOT_CONFIGURED", 503);
  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);
  try {
    if (!(await enforceAuthRateLimit(request, "two-factor-verify", undefined, { windowMs: 10 * 60 * 1000, ipLimit: 12 }))) return jsonError("RATE_LIMITED", 429);
    const result = await verifyPendingTwoFactor(parsed.data.code);
    if (!result) return jsonError("TWO_FACTOR_INVALID", 401);
    await recordSecurityEvent("two_factor_login", result.userId, result.authMethod);
    return jsonOk({ authenticated: true, redirectTo: safeReturnPath(result.returnTo) });
  } catch {
    return jsonError("AUTH_UNAVAILABLE", 503);
  }
}
