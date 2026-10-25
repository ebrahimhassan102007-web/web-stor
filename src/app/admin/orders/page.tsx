import type { Metadata } from "next";
import Link from "next/link";
import { AdminSearchForm, EmptyState, formatAdminDate, money, OrderStatusBadge, PageHeader } from "@/components/admin/ui";
import { getAdminOrders } from "@/lib/admin-data";
import { getI18n } from "@/lib/i18n/server";
import { requireAdminUser } from "@/lib/security/admin-session";

export const metadata: Metadata = { title: "Orders" };
type PageProps = { searchParams: Promise<{ q?: string; status?: string }> };

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  await requireAdminUser();
  const [{ locale }, params] = await Promise.all([getI18n(), searchParams]);
  const ar = locale === "ar";
  const query = params.q?.trim().slice(0, 96) ?? "";
  const status = params.status ?? "";
  const orders = await getAdminOrders({ query, status });

  return (
    <div className="admin-page-stack">
      <PageHeader
        eyebrow={ar ? "إدارة المتجر / الطلبات" : "STORE MANAGEMENT / ORDERS"}
        title={ar ? "الطلبات" : "Orders"}
        description={ar ? "ابحث في سجلات الطلبات وتابع حالتها وقيمتها." : "Search order records and review their current status and value."}
        action={<Link href="/admin/analytics" className="admin-button-quiet">{ar ? "ملخص التحليلات" : "Analytics overview"}<span aria-hidden="true">↗</span></Link>}
      />

      <div className="admin-data-note" role="note"><span aria-hidden="true">ⓘ</span><p>{ar ? "هذه سجلات طلبات للعرض. لا يمكن تعديل الحالات أو ردّ المدفوعات من لوحة الإدارة الحالية." : "These are order records for review. Status changes and payment refunds are not enabled in this admin workspace."}</p></div>

      <section className="admin-panel admin-enter">
        <div className="admin-table-toolbar">
          <div><p className="admin-section-kicker">{ar ? "قائمة الطلبات" : "ORDER QUEUE"}</p><h2>{ar ? "كل الطلبات المسجلة" : "All recorded orders"}</h2><p className="mt-1 text-xs text-muted">{ar ? "أحدث 100 نتيجة كحد أقصى" : "Up to 100 latest results"}</p></div>
          <span className="admin-result-count">{orders.length.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} {ar ? "طلب" : "records"}</span>
        </div>
        <AdminSearchForm
          locale={locale}
          query={query}
          status={status}
          showStatus
          action="/admin/orders"
          placeholder={ar ? "ابحث برقم الطلب أو اسم العميل أو البريد..." : "Search order number, customer or email…"}
        />
        {orders.length ? <div className="admin-table-scroll admin-orders-table-wrap"><table className="admin-table admin-orders-table">
          <thead><tr><th>{ar ? "رقم الطلب" : "Order"}</th><th>{ar ? "العميل" : "Customer"}</th><th>{ar ? "التاريخ" : "Date"}</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "القيمة المسجلة" : "Recorded value"}</th></tr></thead>
          <tbody>{orders.map((order) => <tr key={order.id}>
            <td><Link href={`/admin/orders/${order.id}`} className="admin-order-number">#{order.orderNumber}</Link><span className="admin-table-subline">ID · {order.id.slice(0, 8)}</span></td>
            <td><span className="block max-w-52 truncate font-semibold">{order.customerName}</span><span className="admin-table-subline max-w-52 truncate">{order.email}</span></td>
            <td className="whitespace-nowrap">{formatAdminDate(order.createdAt, locale, true)}</td>
            <td><OrderStatusBadge status={order.status} locale={locale} /></td>
            <td className="font-bold tabular-nums" dir="ltr">{money(order.totalCents, locale)}</td>
          </tr>)}</tbody>
        </table></div> : <EmptyState
          icon="▤"
          title={query || status ? (ar ? "مش لاقيين نتائج" : "No matching orders") : (ar ? "لسه مفيش طلبات" : "No orders recorded yet")}
          description={query || status ? (ar ? "جرّب كلمات بحث أو حالة مختلفة، أو امسح الفلاتر." : "Try a different search term or status, or clear the filters.") : (ar ? "لما يتسجل أول طلب هيظهر هنا بالتفاصيل." : "The first recorded order will appear here with its details.")}
          action={(query || status) ? <Link href="/admin/orders" className="admin-button-quiet mt-3">{ar ? "عرض كل الطلبات" : "Show all orders"}</Link> : undefined}
        />}
        <div className="admin-table-footer"><span>{ar ? "عرض للقراءة فقط" : "Read-only view"}</span><span>{ar ? "البيانات الحساسة لا تظهر إلا لمسؤول المتجر" : "Visible only to the store administrator"}</span></div>
      </section>
    </div>
  );
}
