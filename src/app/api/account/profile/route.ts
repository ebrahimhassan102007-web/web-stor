import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { verifySameOrigin } from "@/lib/security/csrf";
import { accountProfileSchema } from "@/lib/validation";
import { jsonError, jsonOk, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    if (!verifySameOrigin(request)) return jsonError("Request rejected.", 403);
    const user = await getCurrentAccountUser();
    if (!user) return jsonError("Please sign in to update your profile.", 401);
    let raw: unknown;
    try { raw = await request.json(); } catch { return jsonError("Invalid request body.", 400); }
    const parsed = accountProfileSchema.safeParse(raw);
    if (!parsed.success) return jsonError("Please review the highlighted fields.", 400, parsed.error.flatten().fieldErrors);
    const [updated] = await db.update(users)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning({
        id: users.id, email: users.email, name: users.name, phone: users.phone,
        addressLine1: users.addressLine1, addressLine2: users.addressLine2,
        city: users.city, postalCode: users.postalCode, country: users.country,
      });
    if (!updated) return jsonError("Could not update your profile.", 500);
    return jsonOk({ user: updated });
  } catch (error) {
    return handleUnexpected("account-profile", error);
  }
}
