import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { verifySameOrigin } from "@/lib/security/csrf";
import { clearAccountSession, getCurrentAccountUser } from "@/lib/security/account-session";
import { recordSecurityEvent } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return jsonError("REQUEST_REJECTED", 403);
  try {
    const user = await getCurrentAccountUser().catch(() => null);
    await clearAccountSession();
    await recordSecurityEvent("logout", user?.id ?? null);
    return jsonOk({ signedOut: true });
  } catch {
    console.error("[auth:logout] request could not be completed");
    return jsonError("AUTH_UNAVAILABLE", 503);
  }
}
