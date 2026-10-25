import type { Metadata } from "next";
import { EmptyState, MetricCard, PageHeader, ReportRangeSwitcher, money } from "@/components/admin/ui";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { getAdminAnalyticsData, parseReportRange } from "@/lib/admin-data";
import { getI18n } from "@/lib/i18n/server";
import { requireAdminUser } from "@/lib/security/admin-session";

export const metadata: Metadata = { title: "Analytics" };
type PageProps = { searchParams: Promise<{ range?: string }> };

function percentChange(current: number, previous: number) {
  if (previous === 0) return { value: null, fresh: current > 0 };
  return { value: ((current - previous) / previous) * 100, fresh: false };
}

export default async function AdminAnalyticsPage({ searchParams }: PageProps) {
  await requireAdminUser();
  const [{ locale }, params] = await Promise.all([getI18n(), searchParams]);
  const ar = locale === "ar";
  const range = parseReportRange(params.range);
  const data = await getAdminAnalyticsData(range);
  const maxUnits = Math.max(1, ...data.topProducts.map((product) => product.units));
  const statusTotal = data.statuses.reduce((total, item) => total + item.total, 0);
  const statusLabel = (status: string) => {
    if (ar) return ({ confirmed: "مؤكد", fulfilled: "مكتمل", cancelled: "ملغي", pending: "قيد الانتظار", processing: "قيد المعالجة" } as Record<string, string>)[status] ?? status;
    return ({ confirmed: "Confirmed", fulfilled: "Fulfilled", cancelled: "Cancelled", pending: "Pending", processing: "Processing" } as Record<string, string>)[status] ?? status;
  };
  const statusClass = (status: string) => ["confirmed", "fulfilled"].includes(status) ? "is-success" : status === "cancelled" ? "is-cancelled" : "is-pending";
  const productName = (product: { name: string; nameAr: string }) => ar && product.nameAr ? product.nameAr : product.name;

  return (
    <div className="admin-page-stack">
      <PageHeader
        eyebrow={ar ? "أداء المتجر / التحليلات" : "STORE PERFORMANCE / ANALYTICS"}
        title={ar ? "الأرقام تحكي الحكاية." : "See the story behind the numbers."}
        description={ar ? "اتجاه قيمة الطلبات، المنتجات الأكثر طلبًا، وتوزيع الحالات خلال الفترة." : "Track recorded order value, popular products, and order status over time."}
        action={<ReportRangeSwitcher current={range} locale={locale} basePath="/admin/analytics" />}
      />

      <div className="admin-data-note" role="note"><span aria-hidden="true">ⓘ</span><p>{ar ? "كل المؤشرات مبنية على سجلات قاعدة البيانات فقط، ولا تعني أن عملية دفع أو تسليم حقيقي قد تمت." : "Metrics reflect database records only and do not imply that a real payment or fulfilment occurred."}</p></div>

      <section className="admin-metrics-grid admin-metrics-grid-compact" aria-label={ar ? "مؤشرات التحليلات" : "Analytics metrics"}>
        <MetricCard label={ar ? "قيمة الطلبات" : "Recorded order value"} value={money(data.current.salesCents, locale)} detail={ar ? "غير الملغاة · قيمة سجل" : "Excluding cancelled · record value"} delta={percentChange(data.current.salesCents, data.previous.salesCents)} icon={<span>↗</span>} accent="gold" index={0} />
        <MetricCard label={ar ? "الطلبات غير الملغاة" : "Orders excluding cancelled"} value={data.current.orderCount.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} detail={ar ? "غير الملغاة" : "Excluding cancelled"} delta={percentChange(data.current.orderCount, data.previous.orderCount)} icon={<span>▤</span>} accent="blue" index={1} />
        <MetricCard label={ar ? "متوسط قيمة الطلب" : "Average order value"} value={money(data.current.averageOrderCents, locale)} detail={ar ? "خلال الفترة المحددة" : "For the selected period"} icon={<span>◈</span>} accent="green" index={2} />
        <MetricCard label={ar ? "طلبات ملغاة" : "Cancelled records"} value={data.current.cancelledCount.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} detail={ar ? "خلال الفترة المحددة" : "For the selected period"} icon={<span>⌁</span>} accent="red" index={3} />
      </section>

      <section className="admin-panel admin-chart-panel admin-enter">
        <div className="admin-panel-heading"><div><p className="admin-section-kicker">{ar ? "اتجاه الطلبات" : "ORDER VALUE TREND"}</p><h2>{ar ? "التغير اليومي" : "Daily movement"}</h2></div><span className="admin-period-chip">{range === "7d" ? (ar ? "٧ أيام" : "7 days") : range === "90d" ? (ar ? "٩٠ يوم" : "90 days") : (ar ? "٣٠ يوم" : "30 days")}</span></div>
        <div className="admin-chart-summary"><strong dir="ltr">{money(data.current.salesCents, locale)}</strong><span>{ar ? "متوسط قيمة الطلب" : "Average order value"}: <b dir="ltr">{money(data.current.averageOrderCents, locale)}</b></span></div>
        <RevenueChart points={data.salesSeries} locale={locale} label={ar ? "الرسم البياني لقيمة الطلبات" : "Recorded order value over time"} />
      </section>

      <section className="admin-analytics-grid">
        <article className="admin-panel admin-enter" style={{ animationDelay: "180ms" }}>
          <div className="admin-panel-heading"><div><p className="admin-section-kicker">{ar ? "محبوب الجمهور" : "AUDIENCE PICKS"}</p><h2>{ar ? "الأكثر طلبًا" : "Most ordered"}</h2></div></div>
          {data.topProducts.length ? <div className="admin-ranked-list admin-ranked-list-spacious">{data.topProducts.map((product, index) => <div key={`${product.id}-${product.name}`} className="admin-ranked-item">
            <span className={`admin-rank-number ${index === 0 ? "is-first" : ""}`}>{String(index + 1).padStart(2, "0")}</span>
            <span className="admin-product-emoji">{product.icon || "✦"}</span>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="truncate text-sm font-bold">{productName(product)}</p><span className="text-xs font-semibold text-muted">{product.units.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} {ar ? "وحدة" : "units"}</span></div><div className="admin-mini-progress"><span style={{ width: `${Math.max(4, (product.units / maxUnits) * 100)}%` }} /></div><p className="mt-1.5 text-xs text-muted">{ar ? "قيمة الطلبات المسجلة" : "Recorded order value"}: <b dir="ltr">{money(product.salesCents, locale)}</b></p></div>
          </div>)}</div> : <EmptyState icon="◈" title={ar ? "لا توجد بيانات بعد" : "Nothing to rank yet"} description={ar ? "هتظهر المنتجات بعد توفر سجلات طلبات." : "Product rankings will appear when order records exist."} />}
        </article>

        <article className="admin-panel admin-enter" style={{ animationDelay: "240ms" }}>
          <div className="admin-panel-heading"><div><p className="admin-section-kicker">{ar ? "الصورة التشغيلية" : "OPERATIONAL SNAPSHOT"}</p><h2>{ar ? "حالات الطلبات" : "Order statuses"}</h2></div><span className="admin-result-count">{statusTotal.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")}</span></div>
          {data.statuses.length ? <div className="admin-status-breakdown">{data.statuses.map((item) => {
            const percent = statusTotal ? Math.round((item.total / statusTotal) * 100) : 0;
            return <div className="admin-status-breakdown-row" key={item.status}>
              <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><i className={`admin-status-dot ${statusClass(item.status)}`} />{statusLabel(item.status)}</span><span className="font-semibold tabular-nums">{item.total.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} <small className="text-muted">({percent}%)</small></span></div>
              <div className="admin-status-track"><span className={statusClass(item.status)} style={{ width: `${percent}%` }} /></div>
            </div>;
          })}</div> : <EmptyState icon="◷" title={ar ? "لا توجد حالات لعرضها" : "No status data yet"} description={ar ? "توزيع الحالات سيظهر بعد تسجيل الطلبات." : "Status breakdown will appear when orders are recorded."} />}
          <p className="mt-5 rounded-xl bg-hover px-3 py-2.5 text-xs leading-6 text-muted">{ar ? "القيمة والنسب وصفية للسجلات الموجودة فقط." : "Values and percentages describe the records currently in the database."}</p>
        </article>
      </section>
    </div>
  );
}
