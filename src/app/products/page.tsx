import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getVisibleCategories, getFilteredProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { ProductFilters } from "@/components/product-filters";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "الخدمات",
  description:
    "تصفح خدمات خدمتك ستور — اشتراكات رقمية، شحن ألعاب، شحن رصيد، وبطاقات رقمية أصلية.",
};

type SearchParams = Promise<{
  q?: string | string[];
  category?: string | string[];
  sort?: string | string[];
  page?: string | string[];
}>;

export default async function ProductsPage(props: {
  searchParams: SearchParams;
}) {
  const searchParams = await props.searchParams;
  const [{ rows, total, totalPages, applied }, categories] = await Promise.all([
    getFilteredProducts(searchParams),
    getVisibleCategories(),
  ]);

  const activeCategory = categories.find((c) => c.slug === applied.category);

  const pageLink = (page: number) => {
    const params = new URLSearchParams();
    if (applied.q) params.set("q", applied.q);
    if (applied.category) params.set("category", applied.category);
    if (applied.sort !== "featured") params.set("sort", applied.sort);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return `/products${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          {activeCategory ? (
            <>
              {activeCategory.icon} {activeCategory.nameAr}
            </>
          ) : (
            <>
              كل <span className="text-primary">الخدمات</span>
            </>
          )}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {total} {total === 1 ? "خدمة" : "خدمة"}
          {applied.q && (
            <>
              {" "}
              تطابق <span className="text-foreground font-semibold">«{applied.q}»</span>
            </>
          )}
        </p>
      </div>

      <Suspense>
        <ProductFilters
          categories={categories.map((c) => ({
            slug: c.slug,
            nameAr: c.nameAr,
            icon: c.icon,
          }))}
          applied={applied}
        />
      </Suspense>

      {rows.length === 0 ? (
        <div className="glass-card mt-8 p-12 text-center">
          <p className="text-4xl" aria-hidden>🔍</p>
          <h2 className="mt-4 text-lg font-bold">لا توجد نتائج</h2>
          <p className="mt-1 text-sm text-muted">
            جرّب كلمة بحث مختلفة أو أزل عوامل التصفية.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map(({ product, categoryNameAr }) => (
              <ProductCard
                key={product.id}
                product={product}
                categoryNameAr={categoryNameAr}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <nav aria-label="التنقل بين الصفحات" className="mt-10 flex items-center justify-center gap-2">
              {applied.page > 1 && (
                <Link href={pageLink(applied.page - 1)} className="btn-ghost px-4 py-2 text-sm">
                  السابق
                </Link>
              )}
              <span className="badge-neutral px-4 py-2">
                صفحة {applied.page} من {totalPages}
              </span>
              {applied.page < totalPages && (
                <Link href={pageLink(applied.page + 1)} className="btn-ghost px-4 py-2 text-sm">
                  التالي
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
