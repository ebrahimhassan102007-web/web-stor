import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { verifySameOrigin } from "@/lib/security/csrf";
import { emailVerificationSchema } from "@/lib/security/auth-validation";
import { readAuthJson } from "@/lib/security/auth-http";
import { enforceAuthRateLimit, isAuthSecretConfigured } from "@/lib/security/auth-rate-limit";
import { consumeEmailVerification } from "@/lib/security/email-verification";
import { createAccountSession } from "@/lib/security/account-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return jsonError("REQUEST_REJECTED", 403);
  if (!isAuthSecretConfigured()) return jsonError("AUTH_NOT_CONFIGURED", 503);

  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = emailVerificationSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);
  const { email, code } = parsed.data;

  try {
    if (
      !(await enforceAuthRateLimit(request, "verify-email", email, {
        windowMs: 10 * 60 * 1000,
        ipLimit: 40,
        emailLimit: 10,
      }))
    ) {
      return jsonError("RATE_LIMITED", 429);
    }

    const result = await consumeEmailVerification(email, code);
    if (result.status === "expired") return jsonError("CODE_EXPIRED", 400);
    if (result.status === "locked") return jsonError("CODE_LOCKED", 429);
    if (result.status !== "verified") return jsonError("CODE_INVALID", 400);

    await createAccountSession(result.userId);
    return jsonOk({ authenticated: true });
  } catch {
    console.error("[auth:verify] request could not be completed");
    return jsonError("AUTH_UNAVAILABLE", 503);
  }
}
