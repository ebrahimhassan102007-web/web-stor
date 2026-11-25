import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { AccountNav } from "@/components/account-nav";
import { db, fulfillmentVault, orders, orderItems } from "@/lib/db";
import { OrderDeliveryReveal } from "@/components/order-delivery-reveal";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === "ar" ? "مشترياتي السابقة" : "Previous purchases", robots: { index: false, follow: false } };
}
export default async function OrdersPage() {
  const [{ locale, t }, user] = await Promise.all([getI18n(), getCurrentAccountUser()]);
  if (!user) redirect("/login?next=%2Faccount%2Forders");
  const ar = locale === "ar";
  const rows = await db.select({
    orderId: orders.id,
    orderNumber: orders.orderNumber,
    status: orders.status,
    createdAt: orders.createdAt,
    totalCents: orders.totalCents,
    productName: orderItems.productName,
    productNameAr: orderItems.productNameAr,
    quantity: orderItems.quantity,
    unitPriceCents: orderItems.unitPriceCents,
    orderItemId: orderItems.id,
    fulfillmentTarget: orderItems.fulfillmentTarget,
  }).from(orders).leftJoin(orderItems, eq(orderItems.orderId, orders.id)).where(eq(orders.userId, user.id)).orderBy(desc(orders.createdAt)).limit(100);
  const grouped = new Map<string, { id: string; orderNumber: string; status: string; createdAt: Date; totalCents: number; items: { id: number; name: string; quantity: number; unitPriceCents: number; target: { type: string; value: string } | null; hasCode: boolean }[] }>();
  for (const row of rows) {
    let order = grouped.get(row.orderId);
    if (!order) {
      order = { id: row.orderId, orderNumber: row.orderNumber, status: row.status, createdAt: row.createdAt, totalCents: row.totalCents, items: [] };
      grouped.set(row.orderId, order);
    }
    if (row.productName && row.orderItemId !== null) order.items.push({
      id: row.orderItemId,
      name: ar && row.productNameAr ? row.productNameAr : row.productName,
      quantity: row.quantity ?? 0,
      unitPriceCents: row.unitPriceCents ?? 0,
      target: row.fulfillmentTarget,
      hasCode: false,
    });
  }
  const orderItemIds = [...grouped.values()].flatMap((order) => order.items.map((item) => item.id));
  const vaultMetadata = orderItemIds.length
    ? await db.select({ orderItemId: fulfillmentVault.orderItemId, revealedAt: fulfillmentVault.revealedAt }).from(fulfillmentVault).where(inArray(fulfillmentVault.orderItemId, orderItemIds))
    : [];
  const codedItems = new Set(vaultMetadata.filter((row) => row.revealedAt === null).map((row) => row.orderItemId).filter((id): id is number => id !== null));
  for (const order of grouped.values()) for (const item of order.items) item.hasCode = codedItems.has(item.id);
  const purchases = [...grouped.values()];
  const dateFormat = new Intl.DateTimeFormat(ar ? "ar-EG" : "en-US", { dateStyle: "medium", timeStyle: "short" });
  const statusLabel = (status: string) => {
    if (status === "confirmed") return ar ? "مؤكد" : "Confirmed";
    if (status === "cancelled") return ar ? "ملغي" : "Cancelled";
    if (status === "fulfilled") return ar ? "مكتمل" : "Fulfilled";
    return status;
  };
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
    <p className="eyebrow">E‑VORA / PURCHASE HISTORY</p>
    <h1 className="title-luxe mt-2 text-3xl">{ar ? "مشترياتي السابقة" : "Previous purchases"}</h1>
    <p className="mt-2 text-sm text-muted">{ar ? "طلباتك المرتبطة بحسابك هتظهر هنا." : "Orders linked to your account appear here."}</p>
    <div className="mt-7"><AccountNav locale={locale} active="/account/orders" /></div>
    {purchases.length ? <div className="mt-5 space-y-4">{purchases.map((order) => <section key={order.orderNumber} className="glass-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-edge pb-4">
        <div><p className="text-xs text-muted">{ar ? "رقم الطلب" : "Order number"}</p><h2 className="mt-1 font-bold tabular-nums">{order.orderNumber}</h2><p className="mt-1 text-xs text-muted">{dateFormat.format(order.createdAt)}</p></div>
        <div className="text-end"><span className="badge-neutral">{statusLabel(order.status)}</span><p className="mt-2 text-lg font-extrabold tabular-nums">{formatCents(order.totalCents, locale)}</p></div>
      </div>
      <ul className="mt-4 space-y-3">{order.items.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{item.name} <span className="text-muted">× {item.quantity}</span>{item.target && <span className="mt-1 block text-xs text-muted" dir={item.target.type === "activation-email" ? "ltr" : undefined}>{item.target.type === "player-id" ? t.success.playerIdLabel : item.target.type === "region" ? t.success.regionLabel : t.product.activationEmailLabel} <bdi>{item.target.value}</bdi></span>}</span><span className="font-semibold tabular-nums">{formatCents(item.unitPriceCents * item.quantity, locale)}</span></li>)}</ul>
      {order.items.some((item) => item.hasCode) && ["paid", "fulfilled", "completed"].includes(order.status) && <div className="mt-4 flex flex-wrap items-center gap-3"><span className="rounded-lg border border-edge px-3 py-2 font-mono text-sm tracking-widest" aria-label={t.success.yourCodes}>••••••••••</span><OrderDeliveryReveal orderId={order.id} /></div>}
      <p className="mt-4 rounded-xl bg-amber-500/[.07] px-3 py-2 text-xs leading-6 text-muted">{ar ? "سجلات المعاينة لا تمثل مدفوعات حقيقية أو تسليم منتجات." : "Preview order records do not represent real payments or product delivery."}</p>
    </section>)}</div> : <section className="glass-card mt-5 px-5 py-14 text-center sm:py-20">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-3xl">🧾</span>
      <h2 className="mt-5 text-xl font-bold">{ar ? "لسه مفيش مشتريات" : "No purchases yet"}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted">{ar ? "لما يتسجل طلب باستخدام بريدك الإلكتروني، هيظهر هنا بتفاصيل المنتجات والتاريخ والإجمالي." : "When an order is recorded with your email, its products, date and total will appear here."}</p>
      <Link href="/products" className="btn-primary mt-6 inline-flex px-5 py-3 text-sm">{ar ? "تصفح المنتجات" : "Browse products"} →</Link>
    </section>}
  </div>;
}
