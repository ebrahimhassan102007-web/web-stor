import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, MetricCard, PageHeader } from "@/components/admin/ui";
import { formatCents } from "@/lib/money";
import { getAdminProducts, getProductCatalogTotals } from "@/lib/admin-data";
import { getI18n } from "@/lib/i18n/server";
import { requireAdminUser } from "@/lib/security/admin-session";

export const metadata: Metadata = { title: "Product catalogue" };
type PageProps = { searchParams: Promise<{ q?: string; stock?: string }> };

export default async function AdminProductsPage({ searchParams }: PageProps) {
  await requireAdminUser();
  const [{ locale }, params] = await Promise.all([getI18n(), searchParams]);
  const ar = locale === "ar";
  const query = params.q?.trim().slice(0, 96) ?? "";
  const stock = params.stock === "low" || params.stock === "out" ? params.stock : "";
  const [products, totals] = await Promise.all([
    getAdminProducts({ query, stock }),
    getProductCatalogTotals(),
  ]);
  const productName = (item: { name: string; nameAr: string }) => ar && item.nameAr ? item.nameAr : item.name;
  const categoryName = (item: { category: string | null; categoryAr: string | null }) => ar && item.categoryAr ? item.categoryAr : item.category || (ar ? "بدون فئة" : "Uncategorised");

  return (
    <div className="admin-page-stack">
      <PageHeader
        eyebrow={ar ? "إدارة المتجر / الكتالوج" : "STORE MANAGEMENT / CATALOGUE"}
        title={ar ? "المنتجات" : "Products"}
        description={ar ? "راجع أسماء المنتجات وأسعارها والفئات والكميات المسجلة." : "Review product listings, prices, categories, and recorded stock."}
        action={<Link href="/products" className="admin-button-quiet" target="_blank" rel="noreferrer">{ar ? "واجهة المتجر" : "Storefront"}<span aria-hidden="true">↗</span></Link>}
      />

      <div className="admin-data-note" role="note"><span aria-hidden="true">ⓘ</span><p>{ar ? "الكتالوج هنا للقراءة فقط. الكميات المسجلة معلوماتية، ولا يمكن تعديل المنتجات أو المخزون من هذه اللوحة." : "This catalogue is read-only. Stock quantities are informational; product and inventory edits are not enabled here."}</p></div>

      <section className="admin-metrics-grid admin-metrics-grid-compact" aria-label={ar ? "ملخص الكتالوج" : "Catalogue summary"}>
        <MetricCard label={ar ? "كل المنتجات" : "Total products"} value={totals.total.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} detail={ar ? "في الكتالوج الحالي" : "In the current catalogue"} icon={<span>▦</span>} accent="blue" index={0} />
        <MetricCard label={ar ? "وحدات مسجلة" : "Recorded units"} value={totals.stockUnits.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} detail={ar ? "قيمة معلوماتية فقط" : "Informational only"} icon={<span>◈</span>} accent="gold" index={1} />
        <MetricCard label={ar ? "كمية منخفضة" : "Low stock"} value={totals.lowStock.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} detail={ar ? "من 1 إلى 10 وحدات" : "1 to 10 listed units"} icon={<span>⌁</span>} accent="red" index={2} />
        <MetricCard label={ar ? "نفد المخزون" : "Out of stock"} value={totals.outOfStock.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} detail={ar ? "صفر وحدة مسجلة" : "Zero listed units"} icon={<span>—</span>} accent="green" index={3} />
      </section>

      <section className="admin-panel admin-enter">
        <div className="admin-table-toolbar">
          <div><p className="admin-section-kicker">{ar ? "إدارة المنتجات" : "PRODUCT MANAGEMENT"}</p><h2>{ar ? "كتالوج المتجر" : "Store catalogue"}</h2></div>
          <span className="admin-result-count">{products.length.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} {ar ? "نتيجة" : "results"}</span>
        </div>
        <form action="/admin/products" className="admin-filter-bar">
          <label className="admin-search-field"><span className="sr-only">{ar ? "بحث" : "Search"}</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[18px] w-[18px]"><circle cx="10.8" cy="10.8" r="6.8"/><path strokeLinecap="round" d="m16 16 4.5 4.5"/></svg><input name="q" type="search" defaultValue={query} placeholder={ar ? "ابحث بالاسم أو الفئة..." : "Search product or category…"} autoComplete="off" /></label>
          <label className="admin-select-field"><span className="sr-only">{ar ? "حالة المخزون" : "Stock status"}</span><select name="stock" defaultValue={stock}><option value="">{ar ? "كل المنتجات" : "All products"}</option><option value="low">{ar ? "مخزون منخفض" : "Low stock"}</option><option value="out">{ar ? "نفد المخزون" : "Out of stock"}</option></select></label>
          <button className="admin-button-primary" type="submit">{ar ? "تطبيق" : "Apply"}</button>
          {(query || stock) && <Link className="admin-filter-clear" href="/admin/products">{ar ? "مسح" : "Clear"}</Link>}
        </form>
        {products.length ? <div className="admin-table-scroll"><table className="admin-table admin-product-table">
          <thead><tr><th>{ar ? "المنتج" : "Product"}</th><th>{ar ? "الفئة" : "Category"}</th><th>{ar ? "السعر" : "Price"}</th><th>{ar ? "المخزون المسجل" : "Recorded stock"}</th><th>{ar ? "التقييم" : "Rating"}</th><th>{ar ? "الحالة" : "Visibility"}</th></tr></thead>
          <tbody>{products.map((product) => <tr key={product.id}>
            <td><div className="flex min-w-48 items-center gap-3"><span className="admin-product-emoji">{product.icon || "✦"}</span><span className="min-w-0"><Link href={`/products/${product.slug}`} target="_blank" rel="noreferrer" className="admin-table-product-link block max-w-56 truncate font-semibold">{productName(product)}</Link><span className="admin-table-subline">/{product.slug}</span></span></div></td>
            <td><span className="admin-category-chip">{categoryName(product)}</span></td>
            <td className="font-bold tabular-nums" dir="ltr">{formatCents(product.priceCents, locale)}</td>
            <td><span className={`admin-stock-count ${product.stock <= 0 ? "is-empty" : product.stock <= 10 ? "is-low" : "is-good"}`}>{product.stock.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")}<small>{ar ? "وحدة" : "units"}</small></span></td>
            <td><span className="text-amber-500">★</span> <span className="font-semibold tabular-nums">{Number(product.rating).toFixed(1)}</span></td>
            <td>{product.featured ? <span className="admin-status admin-status-featured">{ar ? "مميز" : "Featured"}</span> : <span className="admin-status admin-status-neutral">{ar ? "نشط" : "Listed"}</span>}</td>
          </tr>)}</tbody>
        </table></div> : <EmptyState icon="▦" title={query || stock ? (ar ? "لا توجد منتجات مطابقة" : "No matching products") : (ar ? "الكتالوج فارغ" : "Catalogue is empty")} description={query || stock ? (ar ? "جرّب بحثًا أو فلترًا مختلفًا." : "Try another search or stock filter.") : (ar ? "ستظهر المنتجات الموجودة في قاعدة البيانات هنا." : "Products in the connected database will appear here.")} action={(query || stock) ? <Link href="/admin/products" className="admin-button-quiet mt-3">{ar ? "عرض الكتالوج كاملًا" : "Show full catalogue"}</Link> : undefined} />}
        <div className="admin-table-footer"><span>{ar ? "عرض للقراءة فقط" : "Read-only view"}</span><span>{ar ? "يتم عرض حتى 100 منتج" : "Showing up to 100 products"}</span></div>
      </section>
    </div>
  );
}
