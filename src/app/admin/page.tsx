import type { Metadata } from "next";
import Link from "next/link";
import { MetricCard, OrderStatusBadge, PageHeader, ReportRangeSwitcher, money, formatAdminDate, EmptyState } from "@/components/admin/ui";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { getAdminOverviewData, parseReportRange } from "@/lib/admin-data";
import { getI18n } from "@/lib/i18n/server";
import { requireAdminUser } from "@/lib/security/admin-session";

export const metadata: Metadata = { title: "Store overview" };

type PageProps = { searchParams: Promise<{ range?: string }> };

function percentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? { value: null, fresh: true } : { value: null, fresh: false };
  return { value: ((current - previous) / previous) * 100, fresh: false };
}

export default async function AdminPage({ searchParams }: PageProps) {
  await requireAdminUser();
  const [{ locale }, params] = await Promise.all([getI18n(), searchParams]);
  const ar = locale === "ar";
  const range = parseReportRange(params.range);
  const data = await getAdminOverviewData(range);
  const orderDelta = percentChange(data.current.orderCount, data.previous.orderCount);
  const salesDelta = percentChange(data.current.salesCents, data.previous.salesCents);
  const maxUnits = Math.max(1, ...data.topProducts.map((product) => product.units));
  const productName = (product: { name: string; nameAr: string }) => ar && product.nameAr ? product.nameAr : product.name;
  const periodDescription = ar ? "مقارنة بالفترة السابقة بنفس الطول" : "compared with the previous period";

  return (
    <div className="admin-page-stack">
      <PageHeader
        eyebrow={ar ? "مساحة المتجر / الرئيسية" : "STORE WORKSPACE / OVERVIEW"}
        title={ar ? "كل شيء في مكانه." : "Your store, at a glance."}
        description={ar ? "نظرة واضحة على الطلبات والكتالوج والعملاء — من غير زحمة." : "A calm, clear read on orders, catalogue, and customers."}
        action={<ReportRangeSwitcher current={range} locale={locale} basePath="/admin" />}
      />

      <section className="admin-welcome-card admin-enter" aria-label={ar ? "ملخص مساحة الإدارة" : "Workspace summary"}>
        <div className="admin-welcome-orb" aria-hidden="true" />
        <div className="admin-welcome-content">
          <span className="admin-live-label"><span className="admin-live-dot" />{ar ? "نظرة على بيانات متجرك" : "Your store workspace"}</span>
          <h2>{ar ? "أفكار أجمل. قرارات أوضح." : "Better ideas. Clearer decisions."}</h2>
          <p>{ar ? "تابع الطلبات المسجلة، راقب الكتالوج، واستخدم مساحة الإبداع لتجهيز محتوى أجمل لجمهورك." : "Review recorded orders, keep an eye on the catalogue, and use Creative Studio to shape content your audience will love."}</p>
          <Link href="/admin/creative" className="admin-welcome-cta">{ar ? "اكتشف مساحة الإبداع" : "Explore Creative Studio"}<span aria-hidden="true">↗</span></Link>
        </div>
        <div className="admin-welcome-art" aria-hidden="true">
          <div className="admin-art-ring admin-art-ring-one" />
          <div className="admin-art-ring admin-art-ring-two" />
          <div className="admin-art-spark">✦</div>
          <div className="admin-art-orbit">E</div>
        </div>
      </section>

      <div className="admin-data-note" role="note">
        <span aria-hidden="true">ⓘ</span>
        <p>{ar ? "قيمة الطلبات المسجلة للتقارير فقط؛ هذه النسخة لا تعالج مدفوعات حقيقية ولا تنفّذ تسليمًا رقميًا." : "Order values are for reporting only. This version does not process real payments or deliver digital goods."}</p>
      </div>

      <section className="admin-metrics-grid" aria-label={ar ? "مؤشرات المتجر" : "Store metrics"}>
        <MetricCard
          label={ar ? "قيمة الطلبات المسجلة" : "Recorded order value"}
          value={money(data.current.salesCents, locale)}
          detail={ar ? periodDescription : periodDescription}
          delta={salesDelta}
          icon={<span>↗</span>}
          accent="gold"
          index={0}
        />
        <MetricCard
          label={ar ? "الطلبات غير الملغاة" : "Orders excluding cancelled"}
          value={data.current.orderCount.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")}
          detail={periodDescription}
          delta={orderDelta}
          icon={<span>▤</span>}
          accent="blue"
          index={1}
        />
        <MetricCard
          label={ar ? "حسابات العملاء" : "Customer accounts"}
          value={data.customerTotal.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")}
          detail={ar ? "إجمالي الحسابات المسجلة" : "Registered accounts"}
          icon={<span>◉</span>}
          accent="green"
          index={2}
        />
        <MetricCard
          label={ar ? "منتجات تحتاج مراجعة المخزون" : "Catalogue stock alerts"}
          value={(data.productTotals.lowStock + data.productTotals.outOfStock).toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")}
          detail={ar ? `${data.productTotals.outOfStock} نفد · ${data.productTotals.lowStock} منخفض` : `${data.productTotals.outOfStock} out · ${data.productTotals.lowStock} low`}
          icon={<span>◈</span>}
          accent={data.productTotals.lowStock + data.productTotals.outOfStock ? "red" : "green"}
          index={3}
        />
      </section>

      <section className="admin-overview-grid">
        <article className="admin-panel admin-chart-panel admin-enter" style={{ animationDelay: "260ms" }}>
          <div className="admin-panel-heading">
            <div>
              <p className="admin-section-kicker">{ar ? "نظرة زمنية" : "TREND OVER TIME"}</p>
              <h2>{ar ? "قيمة الطلبات يومًا بيوم" : "Order value over time"}</h2>
            </div>
            <span className="admin-period-chip">{range === "7d" ? (ar ? "٧ أيام" : "7 days") : range === "90d" ? (ar ? "٩٠ يوم" : "90 days") : (ar ? "٣٠ يوم" : "30 days")}</span>
          </div>
          <div className="admin-chart-summary">
            <strong dir="ltr">{money(data.current.salesCents, locale)}</strong>
            <span>{ar ? "متوسط الطلب" : "Average order"}: <b dir="ltr">{money(data.current.averageOrderCents, locale)}</b></span>
          </div>
          <RevenueChart points={data.salesSeries} locale={locale} label={ar ? "رسم بياني لقيمة الطلبات اليومية" : "Daily recorded order value chart"} />
        </article>

        <article className="admin-panel admin-top-products-panel admin-enter" style={{ animationDelay: "320ms" }}>
          <div className="admin-panel-heading">
            <div><p className="admin-section-kicker">{ar ? "الأكثر طلبًا" : "CUSTOMER FAVOURITES"}</p><h2>{ar ? "المنتجات الأبرز" : "Top products"}</h2></div>
            <Link href="/admin/analytics" className="admin-panel-link">{ar ? "التفاصيل" : "Details"}<span aria-hidden="true">↗</span></Link>
          </div>
          {data.topProducts.length ? <div className="admin-ranked-list">{data.topProducts.map((product, index) => <div key={`${product.id}-${product.name}`} className="admin-ranked-item">
            <span className={`admin-rank-number ${index === 0 ? "is-first" : ""}`}>{String(index + 1).padStart(2, "0")}</span>
            <span className="admin-product-emoji">{product.icon || "✦"}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-bold">{productName(product)}</p><span className="shrink-0 text-xs font-semibold text-muted">{product.units.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} {ar ? "وحدة" : "units"}</span></div>
              <div className="admin-mini-progress"><span style={{ width: `${Math.max(4, (product.units / maxUnits) * 100)}%` }} /></div>
            </div>
          </div>)}</div> : <EmptyState icon="◈" title={ar ? "لسه مفيش ترتيب" : "No ranking yet"} description={ar ? "هتظهر المنتجات هنا بعد تسجيل طلبات." : "Products will appear here after order records exist."} />}
        </article>
      </section>

      <section className="admin-bottom-grid">
        <article className="admin-panel admin-enter" style={{ animationDelay: "360ms" }}>
          <div className="admin-panel-heading">
            <div><p className="admin-section-kicker">{ar ? "آخر النشاط" : "RECENT ACTIVITY"}</p><h2>{ar ? "أحدث الطلبات" : "Recent orders"}</h2></div>
            <Link href="/admin/orders" className="admin-panel-link">{ar ? "كل الطلبات" : "All orders"}<span aria-hidden="true">↗</span></Link>
          </div>
          {data.recentOrders.length ? <div className="admin-table-scroll"><table className="admin-table">
            <thead><tr><th>{ar ? "الطلب" : "Order"}</th><th>{ar ? "العميل" : "Customer"}</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "القيمة" : "Value"}</th></tr></thead>
            <tbody>{data.recentOrders.map((order) => <tr key={order.id}>
              <td><Link href={`/admin/orders/${order.id}`} className="admin-order-number">#{order.orderNumber}</Link><span className="admin-table-subline">{formatAdminDate(order.createdAt, locale, true)}</span></td>
              <td><span className="block max-w-36 truncate font-medium">{order.customerName}</span><span className="admin-table-subline max-w-36 truncate">{order.email}</span></td>
              <td><OrderStatusBadge status={order.status} locale={locale} /></td>
              <td className="font-semibold tabular-nums" dir="ltr">{money(order.totalCents, locale)}</td>
            </tr>)}</tbody>
          </table></div> : <EmptyState icon="▤" title={ar ? "لا توجد طلبات مسجلة" : "No recorded orders yet"} description={ar ? "ستظهر سجلات الطلبات هنا عند توفرها." : "Recorded order activity will appear here when available."} />}
        </article>

        <article className="admin-panel admin-stock-panel admin-enter" style={{ animationDelay: "420ms" }}>
          <div className="admin-panel-heading">
            <div><p className="admin-section-kicker">{ar ? "متابعة الكتالوج" : "CATALOGUE WATCH"}</p><h2>{ar ? "تنبيه المخزون" : "Stock watch"}</h2></div>
            <Link href="/admin/products?stock=low" className="admin-panel-link">{ar ? "الكتالوج" : "Catalogue"}<span aria-hidden="true">↗</span></Link>
          </div>
          {data.lowStock.length ? <div className="admin-stock-list">{data.lowStock.map((product) => <div key={product.id} className="admin-stock-row">
            <span className="admin-product-emoji">{product.icon || "✦"}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{productName(product)}</p><p className="mt-1 text-xs text-muted">{money(product.priceCents, locale)}</p></div>
            <span className={`admin-stock-count ${product.stock <= 0 ? "is-empty" : "is-low"}`}>{product.stock.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")}<small>{ar ? "وحدة" : "units"}</small></span>
          </div>)}</div> : <EmptyState icon="✓" title={ar ? "المخزون يبدو جيدًا" : "Looking good"} description={ar ? "لا توجد منتجات بكمية مسجلة منخفضة." : "No products are currently marked as low stock."} />}
        </article>
      </section>

      <p className="admin-page-footnote">{ar ? "تم تحديث البيانات عند تحميل الصفحة. سجل الطلب لا يساوي عملية دفع ناجحة." : "Data is refreshed when the page loads. An order record is not proof of a successful payment."}</p>
    </div>
  );
}
