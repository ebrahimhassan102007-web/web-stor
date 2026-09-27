import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import {
  db,
  carts,
  cartItems,
  products,
  orders,
  orderItems,
  digitalCodes,
} from "@/lib/db";
import type { ProductType } from "@/lib/db/schema";
import { getExistingCartId, clearCartCookie } from "@/lib/security/session";
import { getSessionUser } from "@/lib/security/auth";
import { verifySameOrigin } from "@/lib/security/csrf";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";
import { checkoutSchema } from "@/lib/validation";
import { validateCustomerInputs } from "@/lib/product-fields";
import { getPaymentProvider } from "@/lib/providers/payments";
import { jsonOk, jsonError, rateLimitedResponse, readJsonBody, handleUnexpected } from "@/lib/http";
import { securityLog } from "@/lib/log";

export const dynamic = "force-dynamic";

function newOrderNumber(): string {
  // KS-XXXXXXXXXX — unguessable (~49 bits), no ambiguous characters.
  const alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = randomBytes(10);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `KS-${s}`;
}

/**
 * POST /api/checkout
 *
 * Creates a PENDING_PAYMENT order from the session cart in ONE transaction:
 *  - requires an authenticated account (digital delivery is account-bound),
 *  - prices/totals come exclusively from the database — the client cannot
 *    supply a price, discount, total or currency,
 *  - per-type customer inputs (player id / phone) are re-validated,
 *  - stock is decremented with a `stock >= qty` guard + DB CHECK constraint,
 *  - digital codes are RESERVED for the order items via row locking
 *    (`FOR UPDATE SKIP LOCKED`) so two concurrent checkouts can never
 *    reserve the same code,
 *  - a client-minted idempotency key (unique index) makes replayed
 *    submissions return the original order,
 *  - the response contains the payment redirect URL from the payment
 *    provider. Payment success is established ONLY by the verified
 *    webhook/confirm endpoint — never by the browser.
 */
export async function POST(req: NextRequest) {
  let idemKey: string | undefined;
  try {
    if (!verifySameOrigin(req)) return jsonError("تم رفض الطلب.", 403);
    if (!rateLimit(`checkout:${clientKey(req)}`, 10, 60_000)) {
      securityLog.rateLimited({ endpoint: "checkout", ip: clientKey(req) });
      return rateLimitedResponse();
    }

    const user = await getSessionUser();
    if (!user) {
      return jsonError("يجب تسجيل الدخول لإتمام الشراء.", 401);
    }

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("طلب غير صالح.", 400);

    const parsed = checkoutSchema.safeParse(raw);
    if (!parsed.success) return jsonError("بيانات غير صالحة.", 400);
    idemKey = parsed.data.idempotencyKey;

    // Idempotency: same submission → same order.
    const [existing] = await db
      .select({
        orderNumber: orders.orderNumber,
        totalCents: orders.totalCents,
        userId: orders.userId,
      })
      .from(orders)
      .where(eq(orders.idempotencyKey, idemKey))
      .limit(1);
    if (existing) {
      if (existing.userId !== user.id) return jsonError("بيانات غير صالحة.", 409);
      const payment = await getPaymentProvider().createPayment({
        id: "",
        orderNumber: existing.orderNumber,
        totalCents: existing.totalCents,
      });
      return jsonOk({
        orderNumber: existing.orderNumber,
        totalCents: existing.totalCents,
        redirectUrl: payment.redirectUrl,
      });
    }

    const cartId = await getExistingCartId();
    if (!cartId) return jsonError("السلة فارغة.", 400);

    type CheckoutResult =
      | { error: string }
      | { order: { id: string; orderNumber: string; totalCents: number } };

    const result = await db.transaction(async (tx): Promise<CheckoutResult> => {
      // Authoritative product data, row-locked.
      const lines = await tx
        .select({
          productId: cartItems.productId,
          quantity: cartItems.quantity,
          customerInputs: cartItems.customerInputs,
          nameAr: products.nameAr,
          type: products.type,
          priceCents: products.priceCents,
          stock: products.stock,
          active: products.active,
        })
        .from(cartItems)
        .innerJoin(products, eq(cartItems.productId, products.id))
        .where(eq(cartItems.cartId, cartId))
        .for("update", { of: products });

      if (lines.length === 0) return { error: "السلة فارغة." };

      for (const line of lines) {
        if (!line.active) {
          return { error: `"${line.nameAr}" لم يعد متاحاً. يرجى حذفه من السلة.` };
        }
        if (line.quantity > line.stock) {
          return { error: `الكمية المطلوبة من "${line.nameAr}" غير متوفرة.` };
        }
        // Re-validate customer inputs against the CURRENT product type.
        const inputs = validateCustomerInputs(
          line.type as ProductType,
          line.customerInputs ?? {},
        );
        if (inputs === null) {
          return { error: `بيانات "${line.nameAr}" غير مكتملة. يرجى إعادة إضافته للسلة.` };
        }
      }

      const subtotalCents = lines.reduce(
        (s, l) => s + l.priceCents * l.quantity,
        0,
      );
      const totalCents = subtotalCents; // digital goods: no shipping

      // Guarded atomic stock decrement.
      for (const line of lines) {
        const updated = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${line.quantity}` })
          .where(
            and(
              eq(products.id, line.productId),
              gte(products.stock, line.quantity),
            ),
          )
          .returning({ id: products.id });
        if (updated.length === 0) {
          throw new Error(`stock-conflict:${line.productId}`);
        }
      }

      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber: newOrderNumber(),
          userId: user.id,
          idempotencyKey: idemKey!,
          status: "PENDING_PAYMENT",
          paymentStatus: "UNPAID",
          fulfillmentStatus: "PENDING",
          paymentProvider: getPaymentProvider().name,
          subtotalCents,
          discountCents: 0,
          totalCents,
          currency: "EGP",
        })
        .returning({ id: orders.id, orderNumber: orders.orderNumber });

      const insertedItems = await tx
        .insert(orderItems)
        .values(
          lines.map((l) => ({
            orderId: order.id,
            productId: l.productId,
            productNameAr: l.nameAr,
            productType: l.type,
            unitPriceCents: l.priceCents,
            quantity: l.quantity,
            customerInputs: l.customerInputs ?? {},
          })),
        )
        .returning({
          id: orderItems.id,
          productId: orderItems.productId,
          quantity: orderItems.quantity,
          productType: orderItems.productType,
        });

      // Reserve digital codes NOW (row-locked, skip-locked) so a code can
      // never be promised to two orders.
      for (const item of insertedItems) {
        if (item.productType !== "DIGITAL_CODE") continue;
        const picked = await tx.execute(sql`
          select id from ${digitalCodes}
          where ${digitalCodes.productId} = ${item.productId}
            and ${digitalCodes.status} = 'AVAILABLE'
          limit ${item.quantity}
          for update skip locked
        `);
        const ids = (picked.rows as { id: number }[]).map((r) => r.id);
        if (ids.length < item.quantity) {
          throw new Error(`code-shortage:${item.productId}`);
        }
        await tx
          .update(digitalCodes)
          .set({ status: "RESERVED", orderItemId: item.id })
          .where(inArray(digitalCodes.id, ids));
      }

      // Destroy the cart (cascade removes its items).
      await tx.delete(carts).where(eq(carts.id, cartId));

      return {
        order: { id: order.id, orderNumber: order.orderNumber, totalCents },
      };
    });

    if ("error" in result) {
      securityLog.checkoutFailure({ reason: result.error, ip: clientKey(req) });
      return jsonError(result.error, 409);
    }

    await clearCartCookie();

    const payment = await getPaymentProvider().createPayment(result.order);
    return jsonOk(
      {
        orderNumber: result.order.orderNumber,
        totalCents: result.order.totalCents,
        redirectUrl: payment.redirectUrl,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("stock-conflict:")) {
      securityLog.checkoutFailure({ reason: "stock-race", ip: clientKey(req) });
      return jsonError("نفدت كمية أحد المنتجات في سلتك. يرجى مراجعة السلة.", 409);
    }
    if (err instanceof Error && err.message.startsWith("code-shortage:")) {
      securityLog.checkoutFailure({ reason: "code-shortage", ip: clientKey(req) });
      return jsonError("نفدت الأكواد المتاحة لأحد المنتجات. يرجى المحاولة لاحقاً.", 409);
    }
    if (isUniqueViolation(err) && idemKey) {
      const [winner] = await db
        .select({ orderNumber: orders.orderNumber, totalCents: orders.totalCents })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);
      if (winner) return jsonOk(winner);
      return jsonError("تم إرسال هذا الطلب بالفعل.", 409);
    }
    return handleUnexpected("checkout", err);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}
