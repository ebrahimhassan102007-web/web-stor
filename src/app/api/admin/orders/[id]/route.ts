import type { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, orders, orderItems } from "@/lib/db";
import { guardAdmin } from "@/lib/security/admin-guard";
import { adminOrderActionSchema, uuidSchema } from "@/lib/validation";
import { fulfillOrder, releaseOrderReservations } from "@/lib/fulfillment";
import { recordAudit } from "@/lib/audit";
import { jsonOk, jsonError, readJsonBody, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/orders/:id — order detail (no code values). */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const idParsed = uuidSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("بيانات غير صالحة.", 400);

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, idParsed.data))
      .limit(1);
    if (!order) return jsonError("الطلب غير موجود.", 404);

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
 * PATCH /api/admin/orders/:id — guarded, audited order actions.
 *
 * Allowed:
 *  - mark_processing:    PAID → PROCESSING
 *  - mark_fulfilled:     PAID/PROCESSING → FULFILLED (manual services)
 *  - retry_fulfillment:  FAILED → re-run the fulfillment pipeline
 *  - cancel:             PENDING_PAYMENT → CANCELLED (+ release reservations)
 * Arbitrary transitions (e.g. rewriting FULFILLED orders) are rejected.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const idParsed = uuidSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("بيانات غير صالحة.", 400);

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("طلب غير صالح.", 400);

    const parsed = adminOrderActionSchema.safeParse(raw);
    if (!parsed.success) return jsonError("إجراء غير صالح.", 400);

    const [order] = await db
      .select({
        id: orders.id,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        fulfillmentStatus: orders.fulfillmentStatus,
      })
      .from(orders)
      .where(eq(orders.id, idParsed.data))
      .limit(1);
    if (!order) return jsonError("الطلب غير موجود.", 404);

    const action = parsed.data.action;

    if (action === "cancel") {
      const cancelled = await db
        .update(orders)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(and(eq(orders.id, order.id), eq(orders.status, "PENDING_PAYMENT")))
        .returning({ id: orders.id });
      if (cancelled.length === 0) {
        return jsonError("لا يمكن إلغاء هذا الطلب في حالته الحالية.", 409);
      }
      await releaseOrderReservations(order.id);
    } else if (action === "mark_processing") {
      const updated = await db
        .update(orders)
        .set({ status: "PROCESSING", updatedAt: new Date() })
        .where(and(eq(orders.id, order.id), eq(orders.status, "PAID")))
        .returning({ id: orders.id });
      if (updated.length === 0) return jsonError("انتقال حالة غير مسموح.", 409);
    } else if (action === "mark_fulfilled") {
      const updated = await db
        .update(orders)
        .set({
          status: "FULFILLED",
          fulfillmentStatus: "FULFILLED",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orders.id, order.id),
            eq(orders.paymentStatus, "PAID"),
            // only manual-progress states — never resurrect cancelled/refunded
            sqlIn(orders.status, ["PAID", "PROCESSING"]),
          ),
        )
        .returning({ id: orders.id });
      if (updated.length === 0) return jsonError("انتقال حالة غير مسموح.", 409);
    } else if (action === "retry_fulfillment") {
      if (order.paymentStatus !== "PAID" || order.fulfillmentStatus !== "FAILED") {
        return jsonError("لا يمكن إعادة المحاولة لهذا الطلب.", 409);
      }
      await db
        .update(orders)
        .set({ fulfillmentStatus: "PENDING", status: "PAID", updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      await fulfillOrder(order.id);
    }

    await recordAudit({
      adminId: guard.user.id,
      action: `order.${action}`,
      targetType: "order",
      targetId: order.id,
      meta: { previousStatus: order.status },
    });
    return jsonOk({ id: order.id, action });
  } catch (err) {
    return handleUnexpected("admin:orders:action", err);
  }
}

import { inArray } from "drizzle-orm";
function sqlIn(column: typeof orders.status, values: string[]) {
  return inArray(column, values);
}
