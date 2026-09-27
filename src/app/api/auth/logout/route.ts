import type { NextRequest } from "next/server";
import { destroySession } from "@/lib/security/auth";
import { verifySameOrigin } from "@/lib/security/csrf";
import { jsonOk, jsonError, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — destroys the server-side session row + cookie. */
export async function POST(req: NextRequest) {
  try {
    if (!verifySameOrigin(req)) return jsonError("Request rejected.", 403);
    await destroySession();
    return jsonOk({ loggedOut: true });
  } catch (err) {
    return handleUnexpected("auth:logout", err);
  }
}
