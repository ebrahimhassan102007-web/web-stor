import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, formatAdminDate, MetricCard, PageHeader } from "@/components/admin/ui";
import { formatCents } from "@/lib/money";
import { getAdminCustomers, getCustomerTotal } from "@/lib/admin-data";
import { getI18n } from "@/lib/i18n/server";
import { requireAdminUser } from "@/lib/security/admin-session";

export const metadata: Metadata = { title: "Customers" };
type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function AdminCustomersPage({ searchParams }: PageProps) {
  await requireAdminUser();
  const [{ locale }, params] = await Promise.all([getI18n(), searchParams]);
  const ar = locale === "ar";
  const query = params.q?.trim().slice(0, 96) ?? "";
  const [customers, customerTotal] = await Promise.all([getAdminCustomers(query), getCustomerTotal()]);
  const customersWithOrders = customers.filter((customer) => customer.orderCount > 0).length;

  return (
    <div className="admin-page-stack">
      <PageHeader
        eyebrow={ar ? "إدارة المتجر / العملاء" : "STORE MANAGEMENT / CUSTOMERS"}
        title={ar ? "العملاء" : "Customers"}
        description={ar ? "نظرة منظمة على الحسابات المسجلة وتفاعلها مع الطلبات." : "A considered view of registered accounts and their recorded order activity."}
        action={<Link href="/contact" className="admin-button-quiet" target="_blank" rel="noreferrer">{ar ? "صفحة الدعم" : "Support page"}<span aria-hidden="true">↗</span></Link>}
      />

      <div className="admin-data-note" role="note"><span aria-hidden="true">ⓘ</span><p>{ar ? "بيانات العملاء خاصة ومقصورة على مسؤول المتجر. لا توجد أدوات تواصل جماعي أو تعديل حسابات في هذه اللوحة." : "Customer details are private and restricted to the store administrator. Bulk messaging and account editing are not enabled."}</p></div>

      <section className="admin-metrics-grid admin-metrics-grid-compact" aria-label={ar ? "ملخص العملاء" : "Customer summary"}>
        <MetricCard label={ar ? "إجمالي الحسابات" : "Registered accounts"} value={customerTotal.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} detail={ar ? "كل الحسابات المسجلة" : "All registered accounts"} icon={<span>◉</span>} accent="blue" index={0} />
        <MetricCard label={ar ? "لديهم طلبات" : "With order records"} value={customersWithOrders.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} detail={query ? (ar ? "ضمن النتائج الحالية" : "In the visible results") : (ar ? "ضمن أحدث 100 حساب" : "Within the latest 100 accounts")} icon={<span>▤</span>} accent="gold" index={1} />
        <MetricCard label={ar ? "نتائج العرض" : "Visible results"} value={customers.length.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} detail={ar ? "حد أقصى 100 حساب" : "Up to 100 accounts"} icon={<span>⌕</span>} accent="green" index={2} />
      </section>

      <section className="admin-panel admin-enter">
        <div className="admin-table-toolbar"><div><p className="admin-section-kicker">{ar ? "قاعدة العملاء" : "CUSTOMER DIRECTORY"}</p><h2>{ar ? "الحسابات" : "Customer accounts"}</h2></div><span className="admin-result-count">{customerTotal.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} {ar ? "حساب" : "accounts"}</span></div>
        <form action="/admin/customers" className="admin-filter-bar">
          <label className="admin-search-field"><span className="sr-only">{ar ? "بحث" : "Search"}</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[18px] w-[18px]"><circle cx="10.8" cy="10.8" r="6.8"/><path strokeLinecap="round" d="m16 16 4.5 4.5"/></svg><input name="q" type="search" defaultValue={query} placeholder={ar ? "ابحث بالاسم أو البريد الإلكتروني..." : "Search by name or email…"} autoComplete="off" /></label>
          <button className="admin-button-primary" type="submit">{ar ? "بحث" : "Search"}</button>
          {query && <Link className="admin-filter-clear" href="/admin/customers">{ar ? "مسح" : "Clear"}</Link>}
        </form>
        {customers.length ? <div className="admin-table-scroll"><table className="admin-table admin-customer-table">
          <thead><tr><th>{ar ? "العميل" : "Customer"}</th><th>{ar ? "تاريخ الانضمام" : "Joined"}</th><th>{ar ? "الطلبات المسجلة" : "Order records"}</th><th>{ar ? "قيمة الطلبات" : "Recorded order value"}</th><th>{ar ? "آخر طلب" : "Last order"}</th></tr></thead>
          <tbody>{customers.map((customer) => {
            const initials = customer.displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "E";
            return <tr key={customer.id}>
              <td><div className="flex min-w-48 items-center gap-3"><span className="admin-customer-avatar">{initials}</span><span className="min-w-0"><span className="block max-w-56 truncate font-semibold">{customer.displayName}</span><span className="admin-table-subline max-w-56 truncate">{customer.email}</span></span></div></td>
              <td className="whitespace-nowrap">{formatAdminDate(customer.createdAt, locale)}</td>
              <td><span className="font-semibold tabular-nums">{customer.orderCount.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")}</span></td>
              <td className="font-semibold tabular-nums" dir="ltr">{formatCents(customer.salesCents, locale)}</td>
              <td className="whitespace-nowrap text-muted">{customer.lastOrderAt ? formatAdminDate(customer.lastOrderAt, locale, true) : <span className="admin-table-subline">{ar ? "لا يوجد" : "No order"}</span>}</td>
            </tr>;
          })}</tbody>
        </table></div> : <EmptyState icon="◉" title={query ? (ar ? "لا توجد حسابات مطابقة" : "No matching accounts") : (ar ? "لا توجد حسابات بعد" : "No customer accounts yet")} description={query ? (ar ? "جرّب اسمًا أو بريدًا مختلفًا." : "Try another name or email address.") : (ar ? "ستظهر الحسابات المسجلة هنا عند توفرها." : "Registered customer accounts will appear here when available.")} action={query ? <Link href="/admin/customers" className="admin-button-quiet mt-3">{ar ? "عرض كل الحسابات" : "Show all accounts"}</Link> : undefined} />}
        <div className="admin-table-footer"><span>{ar ? "يتم إخفاء كلمات المرور وبيانات الجلسات" : "Passwords and session data are never shown"}</span><span>{ar ? "عرض للقراءة فقط" : "Read-only view"}</span></div>
      </section>
    </div>
  );
}
