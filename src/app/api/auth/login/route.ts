import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { verifyPassword } from "@/lib/security/password";
import { createSession } from "@/lib/security/auth";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { loginSchema } from "@/lib/validation";
import { jsonOk, jsonError, rateLimitedResponse, readJsonBody, handleUnexpected } from "@/lib/http";
import { securityLog } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 *
 * - Rate limited per IP AND per target account (brute-force protection).
 * - Uniform "invalid credentials" response — no user enumeration.
 * - A fresh session token is minted on every successful login
 *   (session fixation is impossible).
 */
export async function POST(req: NextRequest) {
  try {
    if (!verifySameOrigin(req)) return jsonError("Request rejected.", 403);
    if (!rateLimit(`login:ip:${clientKey(req)}`, 10, 60_000)) {
      securityLog.rateLimited({ endpoint: "login", ip: clientKey(req) });
      return rateLimitedResponse();
    }

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("Invalid request body.", 400);

    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) return jsonError("Invalid email or password.", 401);
    const { email, password } = parsed.data;

    if (!rateLimit(`login:acct:${email}`, 5, 60_000)) {
      securityLog.rateLimited({ endpoint: "login", account: email });
      return rateLimitedResponse();
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Always run a hash verification so response timing does not reveal
    // whether the account exists.
    const ok = await verifyPassword(
      password,
      user?.passwordHash ??
        "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
    );

    if (!user || user.disabled || !ok) {
      securityLog.authFailure({ kind: "login", email, ip: clientKey(req) });
      return jsonError("بيانات الدخول غير صحيحة.", 401);
    }

    await createSession(user.id);
    securityLog.authSuccess({ kind: "login", userId: user.id });

    return jsonOk({ name: user.name, email: user.email, role: user.role });
  } catch (err) {
    return handleUnexpected("auth:login", err);
  }
}
