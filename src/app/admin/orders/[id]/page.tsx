import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatusBadge, formatAdminDate } from "@/components/admin/ui";
import { getAdminOrderDetails } from "@/lib/admin-data";
import { getI18n } from "@/lib/i18n/server";
import { requireAdminUser } from "@/lib/security/admin-session";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Order details" };
type PageProps = { params: Promise<{ id: string }> };

export default async function AdminOrderDetailPage({ params }: PageProps) {
  await requireAdminUser();
  const [{ locale }, { id }] = await Promise.all([getI18n(), params]);
  const ar = locale === "ar";
  const order = await getAdminOrderDetails(id);
  if (!order) notFound();
  const productName = (item: { productName: string; productNameAr: string }) => ar && item.productNameAr ? item.productNameAr : item.productName;

  return (
    <div className="admin-page-stack">
      <div className="admin-back-row"><Link href="/admin/orders" className="admin-back-link"><span aria-hidden="true">{ar ? "→" : "←"}</span>{ar ? "العودة للطلبات" : "Back to orders"}</Link></div>
      <header className="admin-order-detail-header">
        <div><p className="admin-eyebrow">{ar ? "سجل الطلب / التفاصيل" : "ORDER RECORD / DETAILS"}</p><h1 className="admin-page-title" dir="ltr">#{order.orderNumber}</h1><p className="admin-page-description">{formatAdminDate(order.createdAt, locale, true)}</p></div>
        <OrderStatusBadge status={order.status} locale={locale} />
      </header>

      <div className="admin-data-note" role="note"><span aria-hidden="true">ⓘ</span><p>{ar ? "دي تفاصيل السجل المخزّن فقط. حالة الطلب لا تؤكد تحصيل المدفوعات أو تسليم المنتجات." : "This page shows the stored record only. Its status does not confirm payment collection or product delivery."}</p></div>

      <section className="admin-order-detail-grid">
        <article className="admin-panel admin-order-items-panel admin-enter">
          <div className="admin-panel-heading"><div><p className="admin-section-kicker">{ar ? "ملخص الطلب" : "ORDER SUMMARY"}</p><h2>{ar ? "المنتجات" : "Items"}</h2></div><span className="admin-result-count">{order.items.length.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} {ar ? "منتج" : "items"}</span></div>
          {order.items.length ? <div className="admin-detail-items">{order.items.map((item) => <div key={item.id} className="admin-detail-item"><div className="min-w-0">{item.productSlug ? <Link href={`/products/${item.productSlug}`} className="admin-detail-product-name" target="_blank" rel="noreferrer">{productName(item)}<span aria-hidden="true">↗</span></Link> : <span className="font-semibold">{productName(item)}</span>}<p className="admin-table-subline">{formatCents(item.unitPriceCents, locale)} × {item.quantity.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")}</p></div><strong className="shrink-0 font-bold tabular-nums" dir="ltr">{formatCents(item.unitPriceCents * item.quantity, locale)}</strong></div>)}</div> : <p className="py-6 text-center text-sm text-muted">{ar ? "لا توجد بنود مرتبطة بالسجل." : "No line items are attached to this record."}</p>}
          <div className="admin-order-totals"><div><span>{ar ? "المجموع الفرعي" : "Subtotal"}</span><b dir="ltr">{formatCents(order.subtotalCents, locale)}</b></div><div><span>{ar ? "التوصيل" : "Delivery"}</span><b dir="ltr">{formatCents(order.shippingCents, locale)}</b></div><div className="is-total"><span>{ar ? "إجمالي السجل" : "Recorded total"}</span><b dir="ltr">{formatCents(order.totalCents, locale)}</b></div></div>
        </article>

        <aside className="admin-panel admin-customer-detail admin-enter" style={{ animationDelay: "90ms" }}>
          <div className="admin-panel-heading"><div><p className="admin-section-kicker">{ar ? "ملف العميل" : "CUSTOMER PROFILE"}</p><h2>{ar ? "العميل" : "Customer"}</h2></div><span className="admin-customer-avatar">{order.customerName.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "E"}</span></div>
          <dl className="admin-detail-definition"><div><dt>{ar ? "الاسم" : "Name"}</dt><dd>{order.customerName}</dd></div><div><dt>{ar ? "البريد الإلكتروني" : "Email"}</dt><dd className="break-all">{order.email}</dd></div><div><dt>{ar ? "مرجع الطلب" : "Order reference"}</dt><dd dir="ltr">{order.orderNumber}</dd></div><div><dt>{ar ? "تاريخ التسجيل" : "Recorded at"}</dt><dd>{formatAdminDate(order.createdAt, locale, true)}</dd></div></dl>
          <Link href={`/admin/customers?q=${encodeURIComponent(order.email)}`} className="admin-button-quiet mt-4 w-full">{ar ? "عرض حساب العميل" : "View customer account"}<span aria-hidden="true">↗</span></Link>
        </aside>
      </section>
    </div>
  );
}
