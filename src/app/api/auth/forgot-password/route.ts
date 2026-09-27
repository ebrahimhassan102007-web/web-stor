import type { NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, users, passwordResetTokens } from "@/lib/db";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { forgotPasswordSchema } from "@/lib/validation";
import { jsonOk, jsonError, rateLimitedResponse, readJsonBody, handleUnexpected } from "@/lib/http";
import { logEvent, securityLog } from "@/lib/log";

export const dynamic = "force-dynamic";

const RESET_TTL_MS = 1000 * 60 * 30; // 30 minutes

/**
 * POST /api/auth/forgot-password
 *
 * Always answers with the same generic success message whether or not the
 * account exists (no enumeration). Creates a single-use, hashed, expiring
 * reset token.
 *
 * NOTE: delivering the token requires an email provider (SMTP / SES / etc.),
 * which is not configured in this environment. In non-production the reset
 * URL is printed to the server log for testing; in production, wire
 * `deliverResetEmail` to a real provider. See SECURITY.md.
 */
export async function POST(req: NextRequest) {
  try {
    if (!verifySameOrigin(req)) return jsonError("Request rejected.", 403);
    if (!rateLimit(`forgot:${clientKey(req)}`, 5, 60_000)) {
      securityLog.rateLimited({ endpoint: "forgot-password", ip: clientKey(req) });
      return rateLimitedResponse();
    }

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("Invalid request body.", 400);

    const parsed = forgotPasswordSchema.safeParse(raw);
    if (!parsed.success) return jsonError("Invalid input.", 400);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    if (user) {
      const token = randomBytes(32).toString("hex");
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      });
      await deliverResetEmail(parsed.data.email, token);
      logEvent("info", "auth.reset-requested", { userId: user.id });
    }

    // Identical response either way.
    return jsonOk({
      message: "If that account exists, a reset link has been sent.",
    });
  } catch (err) {
    return handleUnexpected("auth:forgot", err);
  }
}

async function deliverResetEmail(email: string, token: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    // Development convenience ONLY — never enabled in production builds.
    console.log(`[dev-only] password reset for ${email}: /reset-password?token=${token}`);
    return;
  }
  // Production: integrate an email provider here. The token must only ever
  // be sent to the account's email address.
}
