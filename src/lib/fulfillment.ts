import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  orders,
  orderItems,
  deliveries,
  digitalCodes,
  products,
} from "@/lib/db";
import {
  getTopupProvider,
  getRechargeProvider,
} from "@/lib/providers/fulfillment-providers";
import { getNotificationProvider } from "@/lib/providers/notifications";
import { logEvent } from "@/lib/log";

/**
 * Order fulfillment — runs ONLY after payment has been verified server-side.
 *
 * Guarantees:
 *  - Idempotent: an atomic PENDING → PROCESSING transition gate means
 *    concurrent/replayed calls fulfil at most once.
 *  - A digital code can never be delivered twice: codes were RESERVED for a
 *    specific order item at checkout (row-locked), and only those rows flip
 *    to SOLD here.
 *  - Provider failures mark the order FAILED without inventing success and
 *    without double-charging (payment state is untouched).
 */
export async function fulfillOrder(orderId: string): Promise<void> {
  // Atomic gate — exactly one caller wins.
  const claimed = await db
    .update(orders)
    .set({ fulfillmentStatus: "PROCESSING", updatedAt: new Date() })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.fulfillmentStatus, "PENDING"),
        eq(orders.paymentStatus, "PAID"),
      ),
    )
    .returning({ id: orders.id, orderNumber: orders.orderNumber });

  if (claimed.length === 0) return; // already fulfilled / in progress / unpaid

  const items = await db
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      productType: orderItems.productType,
      quantity: orderItems.quantity,
      customerInputs: orderItems.customerInputs,
      productSlug: products.slug,
      deliveryNote: products.deliveryNote,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));

  try {
    for (const item of items) {
      const inputs = (item.customerInputs ?? {}) as Record<string, string>;

      switch (item.productType) {
        case "DIGITAL_CODE": {
          // Flip this item's RESERVED codes to SOLD and create deliveries —
          // one transaction, bound to the order item.
          await db.transaction(async (tx) => {
            const reserved = await tx
              .select({ id: digitalCodes.id, codeEncrypted: digitalCodes.codeEncrypted })
              .from(digitalCodes)
              .where(
                and(
                  eq(digitalCodes.orderItemId, item.id),
                  eq(digitalCodes.status, "RESERVED"),
                ),
              )
              .for("update");

            if (reserved.length < item.quantity) {
              throw new Error(`reservation-missing:${item.id}`);
            }

            await tx
              .update(digitalCodes)
              .set({ status: "SOLD", soldAt: new Date() })
              .where(inArray(digitalCodes.id, reserved.map((r) => r.id)));

            await tx.insert(deliveries).values(
              reserved.map((r) => ({
                orderItemId: item.id,
                kind: "code" as const,
                payloadEncrypted: r.codeEncrypted,
                note: item.deliveryNote,
              })),
            );
          });
          break;
        }

        case "GAME_TOPUP": {
          const result = await getTopupProvider().topup({
            productSlug: item.productSlug,
            playerId: inputs.player_id ?? "",
            quantity: item.quantity,
          });
          if (!result.ok) throw new Error(`provider-failed:${item.id}`);
          await db.insert(deliveries).values({
            orderItemId: item.id,
            kind: "topup",
            note: `تم تنفيذ الشحن. مرجع العملية: ${result.reference}`,
          });
          break;
        }

        case "MOBILE_RECHARGE": {
          const result = await getRechargeProvider().recharge({
            productSlug: item.productSlug,
            phone: inputs.phone ?? "",
            quantity: item.quantity,
          });
          if (!result.ok) throw new Error(`provider-failed:${item.id}`);
          await db.insert(deliveries).values({
            orderItemId: item.id,
            kind: "recharge",
            note: `تم تنفيذ الشحن. مرجع العملية: ${result.reference}`,
          });
          break;
        }

        case "SUBSCRIPTION":
        case "DIGITAL_SERVICE": {
          // Activated by the operations team; the customer sees the
          // product's delivery instructions immediately.
          await db.insert(deliveries).values({
            orderItemId: item.id,
            kind: "manual",
            note:
              item.deliveryNote ||
              "سيتم تفعيل الخدمة وإرسال التفاصيل إلى حسابك خلال وقت قصير.",
          });
          break;
        }

        default:
          throw new Error(`unknown-product-type:${item.productType}`);
      }
    }

    await db
      .update(orders)
      .set({ fulfillmentStatus: "FULFILLED", status: "FULFILLED", updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    logEvent("info", "fulfillment.completed", { orderId });
  } catch (err) {
    logEvent("error", "fulfillment.failed", {
      orderId,
      reason: err instanceof Error ? err.message : "unknown",
    });
    await db
      .update(orders)
      .set({ fulfillmentStatus: "FAILED", status: "FAILED", updatedAt: new Date() })
      .where(eq(orders.id, orderId));
  }
}

/**
 * Releases RESERVED codes and restores stock for a cancelled
 * PENDING_PAYMENT order. Called from the admin cancel action and the
 * mock-payment cancel path.
 */
export async function releaseOrderReservations(orderId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const items = await tx
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    for (const item of items) {
      await tx
        .update(digitalCodes)
        .set({ status: "AVAILABLE", orderItemId: null })
        .where(
          and(
            eq(digitalCodes.orderItemId, item.id),
            eq(digitalCodes.status, "RESERVED"),
          ),
        );
      // Restore reserved stock.
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${item.quantity}` })
        .where(eq(products.id, item.productId));
    }
  });
  logEvent("info", "fulfillment.released", { orderId });
}

/** Notifies the customer their order is confirmed (queued, never faked). */
export async function queueOrderNotification(
  type: "order_confirmed" | "order_fulfilled" | "fulfillment_failed",
  email: string,
  orderNumber: string,
): Promise<void> {
  await getNotificationProvider().notify({ type, email, orderNumber });
}
