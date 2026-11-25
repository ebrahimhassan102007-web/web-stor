import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/http";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { guardMutatingRequest } from "@/lib/security/request-guard";
import { readAuthJson } from "@/lib/security/auth-http";
import { normalizeSecurityInput, normalizeVerificationDigits } from "@/lib/security/digits";
import { enableTotp } from "@/lib/security/two-factor";
import { recordSecurityEvent } from "@/lib/security/audit-log";
import { enforceAuthRateLimit } from "@/lib/security/auth-rate-limit";

const schema = z.object({ code: z.string().transform(normalizeSecurityInput).transform(normalizeVerificationDigits).pipe(z.string().regex(/^\d{6}$/)) });
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const guard = await guardMutatingRequest(request);
  if (guard) return guard;
  const user = await getCurrentAccountUser();
  if (!user) return jsonError("AUTH_REQUIRED", 401);
  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);
  try {
    if (!(await enforceAuthRateLimit(request, "two-factor-enable", user.email, { windowMs: 15 * 60 * 1000, ipLimit: 10, emailLimit: 8 }))) return jsonError("RATE_LIMITED", 429);
    const recoveryCodes = await enableTotp(user.id, parsed.data.code);
    if (!recoveryCodes) return jsonError("TOTP_CODE_INVALID", 400);
    await recordSecurityEvent("totp_enabled", user.id);
    return jsonOk({ enabled: true, recoveryCodes });
  } catch {
    return jsonError("TWO_FACTOR_UNAVAILABLE", 503);
  }
}
