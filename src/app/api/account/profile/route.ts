import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { profileUpdateSchema } from "@/lib/security/auth-validation";
import { readAuthJson } from "@/lib/security/auth-http";
import { enforceAuthRateLimit, isAuthSecretConfigured } from "@/lib/security/auth-rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentAccountUser();
    if (!user) return jsonError("AUTH_REQUIRED", 401);
    return jsonOk({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: Boolean(user.emailVerifiedAt),
      googleLinked: user.googleLinked,
      createdAt: user.createdAt.toISOString(),
    });
  } catch {
    console.error("[account:profile] read failed");
    return jsonError("AUTH_UNAVAILABLE", 503);
  }
}

export async function PATCH(request: NextRequest) {
  if (!verifySameOrigin(request)) return jsonError("REQUEST_REJECTED", 403);
  if (!isAuthSecretConfigured()) return jsonError("AUTH_NOT_CONFIGURED", 503);

  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = profileUpdateSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);

  try {
    const user = await getCurrentAccountUser();
    if (!user) return jsonError("AUTH_REQUIRED", 401);

    if (
      !(await enforceAuthRateLimit(request, "profile-update", user.email, {
        windowMs: 10 * 60 * 1000,
        ipLimit: 40,
        emailLimit: 20,
      }))
    ) {
      return jsonError("RATE_LIMITED", 429);
    }

    const [updated] = await db
      .update(users)
      .set({ displayName: parsed.data.displayName, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning({ displayName: users.displayName });
    if (!updated) return jsonError("AUTH_REQUIRED", 401);

    return jsonOk({ displayName: updated.displayName });
  } catch {
    console.error("[account:profile] update failed");
    return jsonError("AUTH_UNAVAILABLE", 503);
  }
}
