import type { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, orders, paymentEvents } from "@/lib/db";
import { getPaymentProvider } from "@/lib/providers/payments";
import { getSessionUser } from "@/lib/security/auth";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { fulfillOrder, releaseOrderReservations, queueOrderNotification } from "@/lib/fulfillment";
import { orderNumberSchema } from "@/lib/validation";
import { jsonOk, jsonError, rateLimitedResponse, readJsonBody, handleUnexpected } from "@/lib/http";
import { logEvent, securityLog } from "@/lib/log";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  order: orderNumberSchema,
  sig: z.string().regex(/^[a-f0-9]{64}$/),
  action: z.enum(["confirm", "cancel"]),
});

/**
 * POST /api/payments/mock/confirm — DEVELOPMENT payment provider callback.
 *
 * Simulates the server-side leg of a hosted payment page. Security model
 * mirrors a real webhook:
 *  - HMAC signature over the order reference (issued only by the server at
 *    payment-session creation) is verified in constant time — the browser
 *    cannot forge a "paid" state for an arbitrary order,
 *  - the payer must also be the authenticated order owner,
 *  - a unique payment_events row makes replays / double-clicks a no-op,
 *  - the UNPAID → PAID transition is a guarded atomic update,
 *  - fulfillment runs only after the verified transition.
 *
 * The provider itself refuses to exist in production builds (see
 * getPaymentProvider) — a real Stripe webhook replaces this file's role.
 */
export async function POST(req: NextRequest) {
  try {
    if (!verifySameOrigin(req)) return jsonError("تم رفض الطلب.", 403);
    if (!rateLimit(`pay:${clientKey(req)}`, 20, 60_000)) {
      return rateLimitedResponse();
    }

    const user = await getSessionUser();
    if (!user) return jsonError("يجب تسجيل الدخول.", 401);

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("طلب غير صالح.", 400);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return jsonError("بيانات غير صالحة.", 400);
    const { order: orderNumber, sig, action } = parsed.data;

    const provider = getPaymentProvider();
    if (!provider.verifySignature(`pay:${orderNumber}`, sig)) {
      securityLog.authzDenied({ endpoint: "pay:mock", userId: user.id });
      return jsonError("توقيع غير صالح.", 403);
    }

    const [order] = await db
      .select({
        id: orders.id,
        userId: orders.userId,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
      })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);

    if (!order || order.userId !== user.id) {
      return jsonError("الطلب غير موجود.", 404);
    }

    if (action === "cancel") {
      const cancelled = await db
        .update(orders)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(and(eq(orders.id, order.id), eq(orders.status, "PENDING_PAYMENT")))
        .returning({ id: orders.id });
      if (cancelled.length > 0) {
        await releaseOrderReservations(order.id);
        logEvent("info", "payment.cancelled", { orderId: order.id });
      }
      return jsonOk({ status: "CANCELLED" });
    }

    // Idempotency ledger — replayed confirmations are a no-op.
    const eventId = `mock-paid-${order.id}`;
    const inserted = await db
      .insert(paymentEvents)
      .values({
        provider: provider.name,
        eventId,
        orderId: order.id,
        type: "payment.succeeded",
      })
      .onConflictDoNothing()
      .returning({ id: paymentEvents.id });

    if (inserted.length > 0) {
      // Guarded transition: only UNPAID + PENDING_PAYMENT can become PAID.
      const paid = await db
        .update(orders)
        .set({ status: "PAID", paymentStatus: "PAID", updatedAt: new Date() })
        .where(
          and(
            eq(orders.id, order.id),
            eq(orders.paymentStatus, "UNPAID"),
            eq(orders.status, "PENDING_PAYMENT"),
          ),
        )
        .returning({ id: orders.id });

      if (paid.length === 0) {
        return jsonError("لا يمكن تأكيد الدفع لهذا الطلب.", 409);
      }

      logEvent("info", "payment.confirmed", { orderId: order.id, provider: provider.name });
      await fulfillOrder(order.id);
      await queueOrderNotification("order_confirmed", user.email, orderNumber);
    }

    return jsonOk({ status: "PAID", orderNumber });
  } catch (err) {
    return handleUnexpected("payments:mock", err);
  }
}
