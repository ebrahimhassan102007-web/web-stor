import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { AccountNav } from "@/components/account-nav";
import { db, orders, orderItems } from "@/lib/db";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === "ar" ? "مشترياتي السابقة" : "Previous purchases", robots: { index: false, follow: false } };
}
export default async function OrdersPage() {
  const [{ locale }, user] = await Promise.all([getI18n(), getCurrentAccountUser()]);
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
  }).from(orders).leftJoin(orderItems, eq(orderItems.orderId, orders.id)).where(eq(orders.email, user.email)).orderBy(desc(orders.createdAt)).limit(100);
  const grouped = new Map<string, { orderNumber: string; status: string; createdAt: Date; totalCents: number; items: { name: string; quantity: number; unitPriceCents: number }[] }>();
  for (const row of rows) {
    let order = grouped.get(row.orderId);
    if (!order) {
      order = { orderNumber: row.orderNumber, status: row.status, createdAt: row.createdAt, totalCents: row.totalCents, items: [] };
      grouped.set(row.orderId, order);
    }
    if (row.productName) order.items.push({ name: ar && row.productNameAr ? row.productNameAr : row.productName, quantity: row.quantity ?? 0, unitPriceCents: row.unitPriceCents ?? 0 });
  }
  const purchases = [...grouped.values()];
  const dateFormat = new Intl.DateTimeFormat(ar ? "ar-EG" : "en-US", { dateStyle: "medium", timeStyle: "short" });
  const statusLabel = (status: string) => {
    if (status === "confirmed") return ar ? "مؤكد" : "Confirmed";
    if (status === "cancelled") return ar ? "ملغي" : "Cancelled";
    if (status === "fulfilled") return ar ? "مكتمل" : "Fulfilled";
    return status;
  };
  return <div className="account-page-enter mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
    <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">E‑VORA / PURCHASE HISTORY</p>
    <h1 className="mt-2 text-3xl font-extrabold">{ar ? "مشترياتي السابقة" : "Previous purchases"}</h1>
    <p className="mt-2 text-sm text-muted">{ar ? "كل طلباتك المسجلة بنفس البريد الإلكتروني هتظهر هنا." : "Orders placed with this email address appear here."}</p>
    <div className="mt-7"><AccountNav locale={locale} active="/account/orders" /></div>
    {purchases.length ? <div className="mt-5 space-y-4">{purchases.map((order) => <section key={order.orderNumber} className="glass-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-edge pb-4">
        <div><p className="text-xs text-muted">{ar ? "رقم الطلب" : "Order number"}</p><h2 className="mt-1 font-bold tabular-nums">{order.orderNumber}</h2><p className="mt-1 text-xs text-muted">{dateFormat.format(order.createdAt)}</p></div>
        <div className="text-end"><span className="badge-neutral">{statusLabel(order.status)}</span><p className="mt-2 text-lg font-extrabold tabular-nums">{formatCents(order.totalCents, locale)}</p></div>
      </div>
      <ul className="mt-4 space-y-3">{order.items.map((item,index) => <li key={order.orderNumber+"-"+index} className="flex flex-wrap justify-between gap-2 text-sm"><span>{item.name} <span className="text-muted">× {item.quantity}</span></span><span className="font-semibold tabular-nums">{formatCents(item.unitPriceCents * item.quantity, locale)}</span></li>)}</ul>
      <p className="mt-4 rounded-xl bg-amber-500/[.07] px-3 py-2 text-xs leading-6 text-muted">{ar ? "سجلات المعاينة لا تمثل مدفوعات حقيقية أو تسليم منتجات." : "Preview order records do not represent real payments or product delivery."}</p>
    </section>)}</div> : <section className="glass-card mt-5 px-5 py-14 text-center sm:py-20">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-3xl">🧾</span>
      <h2 className="mt-5 text-xl font-bold">{ar ? "لسه مفيش مشتريات" : "No purchases yet"}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted">{ar ? "لما يتسجل طلب باستخدام بريدك الإلكتروني، هيظهر هنا بتفاصيل المنتجات والتاريخ والإجمالي." : "When an order is recorded with your email, its products, date and total will appear here."}</p>
      <Link href="/products" className="btn-primary mt-6 inline-flex px-5 py-3 text-sm">{ar ? "تصفح المنتجات" : "Browse products"} →</Link>
    </section>}
  </div>;
}
