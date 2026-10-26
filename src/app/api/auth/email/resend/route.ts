import type { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { verifySameOrigin } from "@/lib/security/csrf";
import { emailResendSchema } from "@/lib/security/auth-validation";
import { readAuthJson } from "@/lib/security/auth-http";
import { enforceAuthRateLimit, isAuthSecretConfigured } from "@/lib/security/auth-rate-limit";
import { isEmailDeliveryConfigured } from "@/lib/security/email";
import { issueEmailVerification } from "@/lib/security/email-verification";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return jsonError("REQUEST_REJECTED", 403);
  if (!isAuthSecretConfigured()) return jsonError("AUTH_NOT_CONFIGURED", 503);

  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = emailResendSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);
  const { email, locale } = parsed.data;

  try {
    if (
      !(await enforceAuthRateLimit(request, "resend-email", email, {
        windowMs: 60 * 60 * 1000,
        ipLimit: 20,
        emailLimit: 5,
      })) ||
      // S-10: hard daily cap so fresh codes cannot reset the budget.
      !(await enforceAuthRateLimit(request, "resend-email-day", email, {
        windowMs: 24 * 60 * 60 * 1000,
        ipLimit: 100,
        emailLimit: 10,
      }))
    ) {
      return jsonError("RATE_LIMITED", 429);
    }
    if (!isEmailDeliveryConfigured()) {
      return jsonError("EMAIL_NOT_CONFIGURED", 503);
    }

    const [pendingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.emailVerifiedAt)))
      .limit(1);

    if (pendingUser) {
      await issueEmailVerification(pendingUser.id, locale);
    }

    // Same response for unknown, verified and pending addresses prevents
    // email enumeration. The persistent 60-second DB cooldown applies only
    // when a verification is actually eligible to be resent.
    return jsonOk({ accepted: true }, { status: 202 });
  } catch (error) {
    console.error(
      "[auth:resend] request could not be completed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return jsonError("EMAIL_DELIVERY_FAILED", 503);
  }
}
