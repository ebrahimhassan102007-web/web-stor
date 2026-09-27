import { getSessionUser } from "@/lib/security/auth";
import { jsonOk, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me — minimal identity for the UI.
 * Never returns ids, hashes or any internal fields beyond what the
 * header/account UI needs.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    return jsonOk({
      user: user ? { name: user.name, email: user.email, role: user.role } : null,
    });
  } catch (err) {
    return handleUnexpected("auth:me", err);
  }
}
