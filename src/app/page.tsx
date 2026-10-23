import Link from "next/link";
import { redirect } from "next/navigation";
import { getCategoriesWithCounts, getFeaturedProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { locName } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentAccountUser();
  if (!user) redirect("/login?next=%2F");

  const [{ locale, t }, categories, featured] = await Promise.all([
    getI18n(),
    getCategoriesWithCounts(),
    getFeaturedProducts(4),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-7 sm:px-6 sm:pt-10">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-edge bg-card/60 px-5 py-8 sm:px-9 sm:py-11 lg:px-12">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -end-28 -top-32 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-32 -start-20 h-64 w-64 rounded-full bg-success/5 blur-3xl" />
        </div>
        <div className="relative max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">E‑VORA <span className="text-muted">/ DIGITAL STORE</span></p>
          <h1 className="mt-4 max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {t.hero.titleTop}{" "}
            <span className="text-primary">{t.hero.titleAccent}</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted sm:text-base">{t.hero.sub}</p>

          <form action="/products" method="get" role="search" className="mt-6 flex max-w-2xl items-center gap-2 rounded-xl border border-edge bg-base/90 p-1.5 focus-within:border-primary/50">
            <label htmlFor="home-product-search" className="sr-only">{t.filters.searchAria}</label>
            <svg aria-hidden="true" className="ms-3 h-5 w-5 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-4-4" />
            </svg>
            <input id="home-product-search" type="search" name="q" autoComplete="off" placeholder={t.filters.searchPlaceholder} className="min-w-0 flex-1 bg-transparent px-1 py-3 text-sm outline-none placeholder:text-muted" />
            <button type="submit" className="btn-primary min-h-11 shrink-0 px-4 sm:px-6">{t.filters.search}</button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/products" className="btn-primary min-h-10 px-4 py-2 text-sm">{t.hero.ctaBrowse}<span aria-hidden="true" className="rtl:-scale-x-100">→</span></Link>
            <Link href="/products?category=game-topups" className="btn-ghost min-h-10 px-4 py-2 text-sm">{t.hero.ctaTopups}</Link>
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <nav aria-label={t.home.catTitle + " " + t.home.catAccent} className="mt-7 flex flex-wrap items-center gap-2">
          {categories.slice(0, 6).map((category) => (
            <Link
              key={category.id}
              href={"/products?category=" + encodeURIComponent(category.slug)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-edge bg-card/60 px-3.5 py-2 text-sm text-muted transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <span aria-hidden="true">{category.icon}</span>
              <span>{locName(category, locale)}</span>
            </Link>
          ))}
        </nav>
      )}

      <section id="featured-products" className="mt-12 scroll-mt-24 sm:mt-14">
        <div className="mb-5 flex items-end justify-between gap-4 sm:mb-7">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t.home.featuredTitle} <span className="text-primary">{t.home.featuredAccent}</span>
            </h2>
            <p className="mt-2 text-sm text-muted">{t.home.featuredSub}</p>
          </div>
          <Link href="/products" className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-edge px-3.5 py-2 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary sm:px-4">
            {t.home.viewAll}<span aria-hidden="true" className="rtl:-scale-x-100">→</span>
          </Link>
        </div>

        {featured.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
            {featured.map((product) => <ProductCard key={product.id} product={product} locale={locale} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-edge px-6 py-12 text-center text-sm text-muted">
            {t.products.emptyText}
          </div>
        )}
      </section>
    </div>
  );
}
