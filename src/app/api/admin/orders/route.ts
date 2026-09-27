import type { NextRequest } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db, orders, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { guardAdmin } from "@/lib/security/admin-guard";
import { adminListQuerySchema } from "@/lib/validation";
import { jsonOk, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

/** GET /api/admin/orders?page=n — paginated order list (admin only). */
export async function GET(req: NextRequest) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const parsed = adminListQuerySchema.safeParse({
      page: req.nextUrl.searchParams.get("page") ?? undefined,
    });
    const page = parsed.success ? parsed.data.page : 1;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          fulfillmentStatus: orders.fulfillmentStatus,
          customerName: users.name,
          customerEmail: users.email,
          totalCents: orders.totalCents,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .innerJoin(users, eq(orders.userId, users.id))
        .orderBy(desc(orders.createdAt))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE),
      db.select({ total: sql<number>`count(*)::int` }).from(orders),
    ]);

    return jsonOk({
      orders: rows,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    return handleUnexpected("admin:orders:list", err);
  }
}
