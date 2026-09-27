import type { NextRequest } from "next/server";
import { desc, eq, lte, sql, and } from "drizzle-orm";
import { db, orders, products, users, digitalCodes } from "@/lib/db";
import { guardAdmin } from "@/lib/security/admin-guard";
import { jsonOk, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/admin/stats — dashboard aggregates. */
export async function GET(req: NextRequest) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const [[orderStats], [customerCount], [productStats], lowStock, recentOrders] =
      await Promise.all([
        db
          .select({
            revenueCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.paymentStatus} = 'PAID'), 0)::int`,
            totalOrders: sql<number>`count(*)::int`,
            fulfilledOrders: sql<number>`count(*) filter (where ${orders.status} = 'FULFILLED')::int`,
            pendingOrders: sql<number>`count(*) filter (where ${orders.status} = 'PENDING_PAYMENT')::int`,
            failedOrders: sql<number>`count(*) filter (where ${orders.status} = 'FAILED')::int`,
          })
          .from(orders),
        db
          .select({ customers: sql<number>`count(*)::int` })
          .from(users)
          .where(eq(users.role, "customer")),
        db
          .select({
            totalProducts: sql<number>`count(*)::int`,
            activeProducts: sql<number>`count(*) filter (where ${products.active})::int`,
          })
          .from(products),
        db
          .select({
            id: products.id,
            nameAr: products.nameAr,
            stock: products.stock,
            type: products.type,
          })
          .from(products)
          .where(and(eq(products.active, true), lte(products.stock, 5)))
          .orderBy(products.stock)
          .limit(10),
        db
          .select({
            orderNumber: orders.orderNumber,
            status: orders.status,
            totalCents: orders.totalCents,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .orderBy(desc(orders.createdAt))
          .limit(8),
      ]);

    const [codeStats] = await db
      .select({
        availableCodes: sql<number>`count(*) filter (where ${digitalCodes.status} = 'AVAILABLE')::int`,
        soldCodes: sql<number>`count(*) filter (where ${digitalCodes.status} = 'SOLD')::int`,
      })
      .from(digitalCodes);

    return jsonOk({
      ...orderStats,
      ...customerCount,
      ...productStats,
      ...codeStats,
      lowStock,
      recentOrders,
    });
  } catch (err) {
    return handleUnexpected("admin:stats", err);
  }
}
