import { after, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { readAuthJson } from "@/lib/security/auth-http";
import { verifySameOrigin } from "@/lib/security/csrf";
import { passwordResetRequestSchema } from "@/lib/security/auth-validation";
import { enforceAuthRateLimit, isAuthSecretConfigured } from "@/lib/security/auth-rate-limit";
import { issuePasswordReset } from "@/lib/security/password-reset";
import { recordSecurityEvent } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return jsonError("REQUEST_REJECTED", 403);
  if (!isAuthSecretConfigured()) return jsonError("AUTH_NOT_CONFIGURED", 503);
  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = passwordResetRequestSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);
  try {
    if (!(await enforceAuthRateLimit(request, "password-reset", parsed.data.email, { windowMs: 15 * 60_000, ipLimit: 20, combinedLimit: 5, emailLimit: 5 }))) return jsonError("RATE_LIMITED", 429);
    const [user] = await db.select({ id: users.id, email: users.email, displayName: users.displayName, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (user?.emailVerifiedAt) {
      after(async () => {
        try { await issuePasswordReset(user.id, user.email, user.displayName, parsed.data.locale); await recordSecurityEvent("password_reset_issued", user.id); }
        catch { console.error("[auth:password-reset] delivery failed"); }
      });
    }
    return jsonOk({ accepted: true }, { status: 202 });
  } catch { return jsonError("AUTH_UNAVAILABLE", 503); }
}
