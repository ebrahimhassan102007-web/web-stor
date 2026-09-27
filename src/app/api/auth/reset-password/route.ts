import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, users, passwordResetTokens } from "@/lib/db";
import { hashPassword } from "@/lib/security/password";
import { destroyAllSessions } from "@/lib/security/auth";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { resetPasswordSchema } from "@/lib/validation";
import { jsonOk, jsonError, rateLimitedResponse, readJsonBody, handleUnexpected } from "@/lib/http";
import { logEvent, securityLog } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/reset-password
 *
 * Consumes a single-use reset token (stored hashed, expiring), sets the new
 * password and revokes EVERY existing session of that user.
 */
export async function POST(req: NextRequest) {
  try {
    if (!verifySameOrigin(req)) return jsonError("Request rejected.", 403);
    if (!rateLimit(`reset:${clientKey(req)}`, 5, 60_000)) {
      securityLog.rateLimited({ endpoint: "reset-password", ip: clientKey(req) });
      return rateLimitedResponse();
    }

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("Invalid request body.", 400);

    const parsed = resetPasswordSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("Invalid or expired reset link.", 400);
    }

    const tokenHash = createHash("sha256")
      .update(parsed.data.token)
      .digest("hex");

    const result = await db.transaction(async (tx) => {
      // Atomically mark the token used (single-use, unexpired only).
      const [token] = await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, new Date()),
          ),
        )
        .returning({ userId: passwordResetTokens.userId });

      if (!token) return null;

      const passwordHash = await hashPassword(parsed.data.password);
      await tx
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, token.userId));

      return token.userId;
    });

    if (!result) {
      securityLog.authFailure({ kind: "reset-invalid-token", ip: clientKey(req) });
      return jsonError("Invalid or expired reset link.", 400);
    }

    // Kill every session that existed before the reset.
    await destroyAllSessions(result);
    logEvent("info", "auth.reset-completed", { userId: result });

    return jsonOk({ message: "Password updated. Please log in." });
  } catch (err) {
    return handleUnexpected("auth:reset", err);
  }
}
