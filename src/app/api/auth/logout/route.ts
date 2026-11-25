import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { guardMutatingRequest } from "@/lib/security/request-guard";
import { clearAccountSession, getCurrentAccountUser } from "@/lib/security/account-session";
import { recordSecurityEvent } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await guardMutatingRequest(request);
  if (guard) return guard;
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
