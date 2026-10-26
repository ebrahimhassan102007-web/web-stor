import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { verifySameOrigin } from "@/lib/security/csrf";
import {
  getCurrentAccountUser,
  listAccountSessions,
  revokeAllAccountSessions,
} from "@/lib/security/account-session";
import { recordSecurityEvent } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";

/** GET /api/auth/sessions — list the signed-in user's live sessions (S-09). */
export async function GET() {
  try {
    const user = await getCurrentAccountUser();
    if (!user) return jsonError("UNAUTHENTICATED", 401);
    const sessions = await listAccountSessions(user.id);
    return jsonOk({
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        lastUsedAt: s.lastUsedAt.toISOString(),
        userAgent: s.userAgent,
        current: s.current,
      })),
    });
  } catch {
    return jsonError("AUTH_UNAVAILABLE", 503);
  }
}

/** POST /api/auth/sessions — sign out of ALL devices (S-09). */
export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return jsonError("REQUEST_REJECTED", 403);
  try {
    const user = await getCurrentAccountUser();
    if (!user) return jsonError("UNAUTHENTICATED", 401);
    await revokeAllAccountSessions(user.id);
    await recordSecurityEvent("sessions_revoked_all", user.id);
    return jsonOk({ signedOutEverywhere: true });
  } catch {
    return jsonError("AUTH_UNAVAILABLE", 503);
  }
}
