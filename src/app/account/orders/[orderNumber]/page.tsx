import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db, orders, orderItems, deliveries } from "@/lib/db";
import { getSessionUser } from "@/lib/security/auth";
import { decryptCode } from "@/lib/security/codes-crypto";
import { signPayload } from "@/lib/providers/payments";
import { orderNumberSchema } from "@/lib/validation";
import { formatCents } from "@/lib/money";
import {
  OrderStatusBadge,
  PAYMENT_STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
} from "@/components/order-status";
import { TYPE_LABELS } from "@/components/product-card";
import { CopyCode } from "@/components/copy-code";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "تفاصيل الطلب" };

type Params = Promise<{ orderNumber: string }>;

export default async function OrderDetailPage(props: { params: Params }) {
  const user = await getSessionUser();
  const { orderNumber: raw } = await props.params;

  const parsed = orderNumberSchema.safeParse(decodeURIComponent(raw));
  if (!parsed.success) notFound();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/account/orders/${parsed.data}`)}`);
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, parsed.data))
    .limit(1);

  // Ownership is mandatory — someone else's valid order number is a 404.
  if (!order || (order.userId !== user.id && user.role !== "admin")) {
    notFound();
  }

  const items = await db
    .select({
      id: orderItems.id,
      productNameAr: orderItems.productNameAr,
      productType: orderItems.productType,
      unitPriceCents: orderItems.unitPriceCents,
      quantity: orderItems.quantity,
      customerInputs: orderItems.customerInputs,
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

  const deliveriesByItem = new Map<number, { kind: string; note: string | null; code: string | null }[]>();
  for (const d of deliveryRows) {
    const list = deliveriesByItem.get(d.orderItemId) ?? [];
    list.push({
      kind: d.kind,
      note: d.note,
      // Decrypted server-side, only after the ownership check above.
      code: d.payloadEncrypted ? decryptCode(d.payloadEncrypted) : null,
    });
    deliveriesByItem.set(d.orderItemId, list);
  }

  const awaitingPayment =
    order.status === "PENDING_PAYMENT" && order.paymentStatus === "UNPAID";
  const payUrl = awaitingPayment
    ? `/pay/mock?order=${encodeURIComponent(order.orderNumber)}&sig=${encodeURIComponent(
        signPayload(`pay:${order.orderNumber}`),
      )}`
    : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <nav aria-label="مسار التنقل" className="mb-6 text-sm text-muted">
        <Link href="/account" className="hover:text-primary">حسابي</Link>
        <span aria-hidden className="mx-2">/</span>
        <span className="font-mono text-foreground ltr-inline">{order.orderNumber}</span>
      </nav>

      {order.status === "FULFILLED" && (
        <div className="mb-6 rounded-xl border border-success/30 bg-success/10 px-5 py-4 text-sm font-semibold text-success">
          ✓ تم إنشاء طلبك بنجاح وتسليمه بالكامل.
        </div>
      )}

      <div className="glass-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              الطلب <span className="font-mono ltr-inline">{order.orderNumber}</span>
            </h1>
            <p className="mt-1 text-sm text-muted">
              {new Intl.DateTimeFormat("ar-EG", {
                dateStyle: "long",
                timeStyle: "short",
              }).format(order.createdAt)}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
          <div className="rounded-xl border border-edge bg-raised/50 p-4">
            <dt className="text-xs text-muted">حالة الدفع</dt>
            <dd className="mt-1 font-bold">
              {PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
            </dd>
          </div>
          <div className="rounded-xl border border-edge bg-raised/50 p-4">
            <dt className="text-xs text-muted">حالة التسليم</dt>
            <dd className="mt-1 font-bold">
              {FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus] ?? order.fulfillmentStatus}
            </dd>
          </div>
          <div className="rounded-xl border border-edge bg-raised/50 p-4">
            <dt className="text-xs text-muted">الإجمالي</dt>
            <dd className="mt-1 font-extrabold tabular-nums">
              {formatCents(order.totalCents)}
            </dd>
          </div>
        </dl>

        {payUrl && (
          <div className="mt-6 rounded-xl border border-primary/30 bg-primary/10 p-5">
            <p className="text-sm font-semibold">هذا الطلب بانتظار الدفع.</p>
            <Link href={payUrl} className="btn-primary mt-3 px-8">
              إتمام الدفع الآن
            </Link>
          </div>
        )}

        {order.status === "FAILED" && (
          <p className="mt-6 rounded-xl border border-primary/30 bg-primary/10 p-5 text-sm">
            تعذر إتمام تنفيذ الطلب تلقائياً. تم إشعار فريقنا وسيتم التواصل معك —
            لن تفقد أموالك المدفوعة.
          </p>
        )}

        <h2 className="mt-8 text-lg font-extrabold">العناصر والتسليم</h2>
        <div className="mt-4 space-y-4">
          {items.map((item) => {
            const itemDeliveries = deliveriesByItem.get(item.id) ?? [];
            const inputs = (item.customerInputs ?? {}) as Record<string, string>;
            return (
              <div key={item.id} className="rounded-xl border border-edge bg-raised/50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{item.productNameAr}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {TYPE_LABELS[item.productType] ?? item.productType} · الكمية:{" "}
                      {item.quantity}
                    </p>
                    {Object.entries(inputs).map(([k, v]) => (
                      <p key={k} className="mt-0.5 text-xs text-muted">
                        <span className="ltr-inline text-foreground">{v}</span>
                      </p>
                    ))}
                  </div>
                  <span className="font-extrabold tabular-nums text-sm">
                    {formatCents(item.unitPriceCents * item.quantity)}
                  </span>
                </div>

                {itemDeliveries.length > 0 && (
                  <div className="mt-4 space-y-3 border-t border-edge pt-4">
                    {itemDeliveries.map((d, i) => (
                      <div key={i} className="space-y-2">
                        {d.code && <CopyCode code={d.code} />}
                        {d.note && (
                          <p className="text-xs text-muted leading-relaxed">{d.note}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link href="/products" className="btn-ghost px-8 text-sm">
          متابعة التسوق
        </Link>
      </div>
    </div>
  );
}
