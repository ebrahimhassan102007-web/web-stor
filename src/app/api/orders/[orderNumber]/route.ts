import type { NextRequest } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { db, orders, orderItems, deliveries } from "@/lib/db";
import { getSessionUser } from "@/lib/security/auth";
import { decryptCode } from "@/lib/security/codes-crypto";
import { orderNumberSchema } from "@/lib/validation";
import { jsonOk, jsonError, handleUnexpected } from "@/lib/http";
import { securityLog } from "@/lib/log";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ orderNumber: string }> };

/**
 * GET /api/orders/:orderNumber — full order detail incl. digital deliveries.
 *
 * Authorization is mandatory: the caller must be the order OWNER (or an
 * admin). Unguessable order numbers are never relied on as authorization —
 * a valid number belonging to someone else returns 404.
 * Delivered codes are decrypted server-side only for the owner.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonError("يجب تسجيل الدخول.", 401);

    const parsed = orderNumberSchema.safeParse((await ctx.params).orderNumber);
    if (!parsed.success) return jsonError("الطلب غير موجود.", 404);

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, parsed.data))
      .limit(1);

    if (!order || (order.userId !== user.id && user.role !== "admin")) {
      if (order) {
        securityLog.authzDenied({
          endpoint: "orders:detail",
          userId: user.id,
        });
      }
      return jsonError("الطلب غير موجود.", 404);
    }

    const items = await db
      .select({
        id: orderItems.id,
        productNameAr: orderItems.productNameAr,
        productType: orderItems.productType,
        unitPriceCents: orderItems.unitPriceCents,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.id));

    const itemIds = items.map((i) => i.id);
    const deliveryRows =
      itemIds.length > 0
        ? await db
            .select()
            .from(deliveries)
            .where(inArray(deliveries.orderItemId, itemIds))
            .orderBy(asc(deliveries.id))
        : [];

    // Decrypt codes server-side, only for the verified owner/admin.
    const safeDeliveries = deliveryRows.map((d) => ({
      orderItemId: d.orderItemId,
      kind: d.kind,
      note: d.note,
      code: d.payloadEncrypted ? decryptCode(d.payloadEncrypted) : null,
      createdAt: d.createdAt,
    }));

    return jsonOk({
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        subtotalCents: order.subtotalCents,
        totalCents: order.totalCents,
        currency: order.currency,
        createdAt: order.createdAt,
      },
      items,
      deliveries: safeDeliveries,
    });
  } catch (err) {
    return handleUnexpected("orders:detail", err);
  }
}
