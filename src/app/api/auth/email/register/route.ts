import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { verifySameOrigin } from "@/lib/security/csrf";
import { emailRegisterSchema } from "@/lib/security/auth-validation";
import { readAuthJson } from "@/lib/security/auth-http";
import { isAuthSecretConfigured, enforceAuthRateLimit } from "@/lib/security/auth-rate-limit";
import { isEmailDeliveryConfigured } from "@/lib/security/email";
import { hashPassword } from "@/lib/security/auth-core";
import { issueEmailVerification } from "@/lib/security/email-verification";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return jsonError("REQUEST_REJECTED", 403);
  if (!isAuthSecretConfigured()) return jsonError("AUTH_NOT_CONFIGURED", 503);

  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = emailRegisterSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);
  const { displayName, email, password, locale } = parsed.data;

  try {
    if (
      !(await enforceAuthRateLimit(request, "register", email, {
        windowMs: 60 * 60 * 1000,
        ipLimit: 12,
        emailLimit: 3,
      }))
    ) {
      return jsonError("RATE_LIMITED", 429);
    }

    if (!isEmailDeliveryConfigured()) {
      return jsonError("EMAIL_NOT_CONFIGURED", 503);
    }

    const passwordHash = await hashPassword(password);
    const [created] = await db
      .insert(users)
      .values({ displayName, email, passwordHash })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    if (created) {
      try {
        await issueEmailVerification(created.id, locale);
      } catch (error) {
        console.error(
          "[auth:register] verification email delivery failed",
          error instanceof Error ? error.name : "UnknownError",
        );
        return jsonError("EMAIL_DELIVERY_FAILED", 503);
      }
    } else {
      // Match the response for existing addresses to avoid account
      // enumeration. Verified users can continue through sign-in instead.
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!existing) return jsonError("AUTH_UNAVAILABLE", 503);
    }

    return jsonOk({ verificationRequired: true }, { status: 202 });
  } catch {
    console.error("[auth:register] request could not be completed");
    return jsonError("AUTH_UNAVAILABLE", 503);
  }
}
