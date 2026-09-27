import type { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, orders, orderItems } from "@/lib/db";
import { guardAdmin } from "@/lib/security/admin-guard";
import { adminOrderStatusSchema, uuidSchema } from "@/lib/validation";
import { jsonOk, jsonError, readJsonBody, handleUnexpected } from "@/lib/http";
import { securityLog } from "@/lib/log";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/orders/:id — full order detail (admin only). */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const idParsed = uuidSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("Invalid input.", 400);

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, idParsed.data))
      .limit(1);
    if (!order) return jsonError("Order not found.", 404);

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.id));

    return jsonOk({ order, items });
  } catch (err) {
    return handleUnexpected("admin:orders:get", err);
  }
}

/**
 * Allowed status transitions — completed/cancelled orders cannot be
 * arbitrarily rewritten.
 */
const TRANSITIONS: Record<string, string[]> = {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

/** PATCH /api/admin/orders/:id — guarded status transition. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const idParsed = uuidSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("Invalid input.", 400);

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("Invalid request body.", 400);

    const parsed = adminOrderStatusSchema.safeParse(raw);
    if (!parsed.success) return jsonError("Invalid status.", 400);

    const [order] = await db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(eq(orders.id, idParsed.data))
      .limit(1);
    if (!order) return jsonError("Order not found.", 404);

    if (!TRANSITIONS[order.status]?.includes(parsed.data.status)) {
      return jsonError(
        `Cannot change status from "${order.status}" to "${parsed.data.status}".`,
        409,
      );
    }

    await db
      .update(orders)
      .set({ status: parsed.data.status })
      .where(eq(orders.id, order.id));

    securityLog.adminAction({
      action: "order.status",
      adminId: guard.user.id,
      orderId: order.id,
      from: order.status,
      to: parsed.data.status,
    });
    return jsonOk({ id: order.id, status: parsed.data.status });
  } catch (err) {
    return handleUnexpected("admin:orders:update", err);
  }
}
