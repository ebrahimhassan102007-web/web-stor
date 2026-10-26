import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { verifySameOrigin } from "@/lib/security/csrf";
import { emailLoginSchema } from "@/lib/security/auth-validation";
import { readAuthJson } from "@/lib/security/auth-http";
import { enforceAuthRateLimit, isAuthSecretConfigured } from "@/lib/security/auth-rate-limit";
import { isEmailDeliveryConfigured } from "@/lib/security/email";
import { verifyPassword } from "@/lib/security/auth-core";
import { createAccountSession } from "@/lib/security/account-session";
import { recordSecurityEvent } from "@/lib/security/audit-log";
import { issueEmailVerification } from "@/lib/security/email-verification";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return jsonError("REQUEST_REJECTED", 403);
  if (!isAuthSecretConfigured()) return jsonError("AUTH_NOT_CONFIGURED", 503);

  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = emailLoginSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);
  const { email, password, locale } = parsed.data;

  try {
    if (
      !(await enforceAuthRateLimit(request, "login", email, {
        windowMs: 15 * 60 * 1000,
        ipLimit: 40,
        // S-04: the tight limit is per (IP+email); the email-only bucket is a
        // high ceiling against distributed stuffing so a single attacker
        // cannot lock the owner out. Google sign-in uses separate scopes
        // and is never blocked by password-login failures.
        combinedLimit: 10,
        emailLimit: 60,
      }))
    ) {
      return jsonError("RATE_LIMITED", 429);
    }

    const [user] = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Verify against a fixed dummy hash for unknown and Google-only accounts
    // to reduce timing-based account/password enumeration.
    const passwordMatches = await verifyPassword(password, user?.passwordHash);
    if (!user || !user.passwordHash || !passwordMatches) {
      await recordSecurityEvent("login_failed", null);
      return jsonError("INVALID_CREDENTIALS", 401);
    }

    if (!user.emailVerifiedAt) {
      if (!isEmailDeliveryConfigured()) {
        return jsonError("EMAIL_NOT_CONFIGURED", 503);
      }
      try {
        await issueEmailVerification(user.id, locale);
      } catch (error) {
        console.error(
          "[auth:login] verification email delivery failed",
          error instanceof Error ? error.name : "UnknownError",
        );
        return jsonError("EMAIL_DELIVERY_FAILED", 503);
      }
      return jsonOk({ verificationRequired: true }, { status: 202 });
    }

    await createAccountSession(user.id);
    await recordSecurityEvent("login_success", user.id);
    return jsonOk({ authenticated: true });
  } catch {
    console.error("[auth:login] request could not be completed");
    return jsonError("AUTH_UNAVAILABLE", 503);
  }
}
