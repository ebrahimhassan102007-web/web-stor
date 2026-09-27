import type { NextRequest } from "next/server";
import { db, users } from "@/lib/db";
import { hashPassword } from "@/lib/security/password";
import { createSession } from "@/lib/security/auth";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { registerSchema } from "@/lib/validation";
import { jsonOk, jsonError, rateLimitedResponse, readJsonBody, handleUnexpected } from "@/lib/http";
import { securityLog } from "@/lib/log";

export const dynamic = "force-dynamic";

/** POST /api/auth/register */
export async function POST(req: NextRequest) {
  try {
    if (!verifySameOrigin(req)) return jsonError("Request rejected.", 403);
    if (!rateLimit(`register:${clientKey(req)}`, 5, 60_000)) {
      securityLog.rateLimited({ endpoint: "register", ip: clientKey(req) });
      return rateLimitedResponse();
    }

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("Invalid request body.", 400);

    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        "Please review the highlighted fields.",
        400,
        parsed.error.flatten().fieldErrors,
      );
    }
    const { name, email, password } = parsed.data;

    const passwordHash = await hashPassword(password);

    // Role is hard-coded server-side — a client can never register an admin.
    const inserted = await db
      .insert(users)
      .values({ name, email, passwordHash, role: "customer" })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    if (inserted.length === 0) {
      // Duplicate email. Enumeration is limited by strict rate limiting.
      securityLog.authFailure({ kind: "register-duplicate", email });
      return jsonError("This email address cannot be used.", 409);
    }

    await createSession(inserted[0].id);
    securityLog.authSuccess({ kind: "register", userId: inserted[0].id });

    return jsonOk({ name, email, role: "customer" }, { status: 201 });
  } catch (err) {
    return handleUnexpected("auth:register", err);
  }
}
