import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { guardMutatingRequest } from "@/lib/security/request-guard";
import {
  getCurrentAccountUser,
  listAccountSessions,
  revokeAllAccountSessions,
  revokeOtherAccountSessions,
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

/** DELETE /api/auth/sessions — revoke all other devices, retaining this session. */
export async function DELETE(request: NextRequest) {
  const guard = await guardMutatingRequest(request);
  if (guard) return guard;
  try {
    const user = await getCurrentAccountUser();
    if (!user) return jsonError("UNAUTHENTICATED", 401);
    const revoked = await revokeOtherAccountSessions(user.id);
    await recordSecurityEvent("sessions_revoked_others", user.id);
    return jsonOk({ revoked });
  } catch { return jsonError("AUTH_UNAVAILABLE", 503); }
}

/** POST /api/auth/sessions — sign out of ALL devices (S-09). */
export async function POST(request: NextRequest) {
  const guard = await guardMutatingRequest(request);
  if (guard) return guard;
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
