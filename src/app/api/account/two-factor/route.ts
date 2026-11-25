import { jsonError, jsonOk } from "@/lib/http";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { isTwoFactorEnabled } from "@/lib/security/two-factor";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await getCurrentAccountUser();
    if (!user) return jsonError("AUTH_REQUIRED", 401);
    return jsonOk({ enabled: await isTwoFactorEnabled(user.id), passwordLoginEnabled: user.passwordLoginEnabled });
  } catch { return jsonError("TWO_FACTOR_UNAVAILABLE", 503); }
}
