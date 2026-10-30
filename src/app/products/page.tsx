import type { Metadata } from "next";
import { Suspense } from "react";
import { getCategories, getFilteredProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { ProductFilters } from "@/components/product-filters";
import { Reveal } from "@/components/reveal";
import { getI18n } from "@/lib/i18n/server";
import { fill, locName } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t.meta.productsTitle,
    description: t.meta.productsDescription,
    openGraph: {
      title: `${t.meta.productsTitle} · E-Vora`,
      description: t.meta.productsDescription,
      siteName: "E-Vora",
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${t.meta.productsTitle} · E-Vora`,
      description: t.meta.productsDescription,
    },
  };
}

type SearchParams = Promise<{
  q?: string | string[];
  category?: string | string[];
  sort?: string | string[];
}>;

export default async function ProductsPage(props: {
  searchParams: SearchParams;
}) {
  const searchParams = await props.searchParams;
  const [{ locale, t }, { rows, applied }, categories] = await Promise.all([
    getI18n(),
    getFilteredProducts(searchParams),
    getCategories(),
  ]);

  const activeCategory = categories.find((c) => c.slug === applied.category);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="eyebrow mb-3">{t.nav.products} · E‑VORA</p>
        <h1 className="title-luxe text-3xl sm:text-4xl">
          {activeCategory ? (
            <>
              {activeCategory.icon} {locName(activeCategory, locale)}
            </>
          ) : (
            <>
              {t.products.allTitle}{" "}
              <span className="text-gradient-dawn">{t.products.allAccent}</span>
            </>
          )}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {rows.length === 1
            ? t.products.countOne
            : fill(t.products.count, { count: rows.length })}
          {applied.q && (
            <>
              {" "}
              {fill(t.products.matching, { q: applied.q })}
            </>
          )}
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/[0.055] px-4 py-3 text-sm leading-6 text-muted"><strong className="text-foreground">{locale === "ar" ? "كتالوج للمعاينة فقط" : "Demo catalogue only"}.</strong>{" "}{locale === "ar" ? "المنتجات والأسعار المعروضة للتوضيح؛ الشراء والدفع وتسليم الأكواد غير مفعّلين." : "Products and prices are illustrative. Purchasing, payment and code delivery are disabled."}</div>

      <Suspense>
        <ProductFilters
          categories={categories.map((c) => ({
            slug: c.slug,
            name: locName(c, locale),
            icon: c.icon,
          }))}
          applied={applied}
        />
      </Suspense>

      {rows.length === 0 ? (
        <div className="glass-card mt-8 p-12 text-center">
          <p className="text-4xl" aria-hidden>🔍</p>
          <h2 className="mt-4 text-lg font-semibold">{t.products.emptyTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.products.emptyText}</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map(({ product, categoryName, categoryNameAr }, index) => (
            <Reveal key={product.id} delay={Math.min(index, 8) * 55} className="h-full">
              <ProductCard
                product={product}
                locale={locale}
                categoryName={locName(
                  { name: categoryName, nameAr: categoryNameAr },
                  locale,
                )}
              />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
