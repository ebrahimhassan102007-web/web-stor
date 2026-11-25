import { jsonError, jsonOk } from "@/lib/http";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { scheduleEphemeralHygiene } from "@/lib/db/hygiene-schedule";

export const dynamic = "force-dynamic";

export async function GET() {
  // S-25: bounded ephemeral cleanup runs after the response, at most hourly.
  scheduleEphemeralHygiene();
  try {
    const user = await getCurrentAccountUser();
    return jsonOk({
      authenticated: Boolean(user),
      user: user
        ? {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            emailVerified: Boolean(user.emailVerifiedAt),
          }
        : null,
    });
  } catch {
    console.error("[auth:session] could not be loaded");
    return jsonError("AUTH_UNAVAILABLE", 503);
  }
}
