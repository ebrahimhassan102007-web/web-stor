import { desc, eq } from "drizzle-orm";
import { db, orders } from "@/lib/db";
import { getSessionUser } from "@/lib/security/auth";
import { jsonOk, jsonError, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/orders — the authenticated user's OWN orders only. */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return jsonError("يجب تسجيل الدخول.", 401);

    const rows = await db
      .select({
        orderNumber: orders.orderNumber,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        totalCents: orders.totalCents,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt))
      .limit(100);

    return jsonOk({ orders: rows });
  } catch (err) {
    return handleUnexpected("orders:list", err);
  }
}
