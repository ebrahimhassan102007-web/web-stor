import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { verifySameOrigin } from "@/lib/security/csrf";
import { clearAccountSession } from "@/lib/security/account-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return jsonError("REQUEST_REJECTED", 403);
  try {
    await clearAccountSession();
    return jsonOk({ signedOut: true });
  } catch {
    console.error("[auth:logout] request could not be completed");
    return jsonError("AUTH_UNAVAILABLE", 503);
  }
}
