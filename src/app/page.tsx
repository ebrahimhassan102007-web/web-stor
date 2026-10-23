import Link from "next/link";
import { getCategoriesWithCounts, getFeaturedProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { getI18n } from "@/lib/i18n/server";
import { fill, locDesc, locName } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [{ locale, t }, categories, featured] = await Promise.all([
    getI18n(),
    getCategoriesWithCounts(),
    getFeaturedProducts(8),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      {/* Hero */}
      <section className="relative py-16 sm:py-24 text-center">
        <div className="mx-auto max-w-3xl">
          <span className="badge-green mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            {t.hero.badge}
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl leading-[1.15]">
            {t.hero.titleTop}
            <span className="block text-primary">{t.hero.titleAccent}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base sm:text-lg text-muted leading-relaxed">
            {t.hero.sub}
          </p>

          {/* Homepage search: make product discovery available immediately. */}
          <form
            action="/products"
            method="get"
            role="search"
            className="mx-auto mt-8 flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-edge bg-raised/80 p-1.5 text-start shadow-lg shadow-black/5 transition-colors focus-within:border-primary/50"
          >
            <label htmlFor="home-product-search" className="sr-only">
              {t.filters.searchAria}
            </label>
            <svg
              aria-hidden="true"
              className="ms-3 h-5 w-5 shrink-0 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="m20 20-4-4" />
            </svg>
            <input
              id="home-product-search"
              type="search"
              name="q"
              autoComplete="off"
              placeholder={t.filters.searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent px-1 py-3 text-sm text-foreground outline-none placeholder:text-muted"
            />
            <button type="submit" className="btn-primary min-h-11 shrink-0 px-4 sm:px-6">
              {t.filters.search}
              <svg
                aria-hidden="true"
                className="h-4 w-4 rtl:-scale-x-100"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </button>
          </form>

          {/* Quick category links are drawn from the live catalogue. */}
          {categories.length > 0 && (
            <nav
              aria-label={t.home.catTitle + " " + t.home.catAccent}
              className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-center gap-2"
            >
              {categories.slice(0, 4).map((category) => (
                <Link
                  key={category.id}
                  href={"/products?category=" + encodeURIComponent(category.slug)}
                  className="inline-flex items-center gap-2 rounded-full border border-edge bg-card/70 px-3.5 py-2 text-xs font-medium text-muted transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground"
                >
                  <span aria-hidden="true">{category.icon}</span>
                  {locName(category, locale)}
                </Link>
              ))}
            </nav>
          )}

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/products" className="btn-primary w-full sm:w-auto px-8 py-3 text-base">
              {t.hero.ctaBrowse}
            </Link>
            <Link
              href="/products?category=game-topups"
              className="btn-ghost w-full sm:w-auto px-8 py-3 text-base"
            >
              {t.hero.ctaTopups}
            </Link>
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section aria-label="E-Vora" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {t.badges.map((b) => (
          <div key={b.title} className="glass-card card-glow-green p-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                {b.icon}
              </span>
              <h2 className="font-semibold">{b.title}</h2>
            </div>
            <p className="mt-2 text-sm text-muted leading-relaxed">{b.text}</p>
          </div>
        ))}
      </section>

      {/* Featured products */}
      <section className="mt-20">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t.home.featuredTitle}{" "}
              <span className="text-primary">{t.home.featuredAccent}</span>
            </h2>
            <p className="mt-1 text-sm text-muted">{t.home.featuredSub}</p>
          </div>
          <Link
            href="/products"
            className="hidden sm:block text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            {t.home.viewAll}{" "}
            <span aria-hidden className="inline-block rtl:-scale-x-100">→</span>
          </Link>
        </div>
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} locale={locale} />
          ))}
        </div>
      </section>

      {/* Category grid */}
      <section className="mt-20">
        <h2 className="mb-8 text-2xl sm:text-3xl font-bold tracking-tight">
          {t.home.catTitle}{" "}
          <span className="text-success">{t.home.catAccent}</span>
        </h2>
        <div className="grid gap-5 grid-cols-2 lg:grid-cols-4">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/products?category=${encodeURIComponent(c.slug)}`}
              className="glass-card card-glow-red group p-5 sm:p-6"
            >
              <span className="text-3xl" aria-hidden>
                {c.icon}
              </span>
              <h3 className="mt-3 font-semibold group-hover:text-primary transition-colors">
                {locName(c, locale)}
              </h3>
              <p className="mt-1 hidden sm:block text-sm text-muted leading-relaxed">
                {locDesc(c, locale)}
              </p>
              <p className="mt-3 text-xs font-medium text-muted">
                {c.productCount === 1
                  ? t.home.productsCountOne
                  : fill(t.home.productsCount, { count: c.productCount })}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Delivery banner */}
      <section className="mt-20">
        <div className="glass-card overflow-hidden">
          <div className="relative px-6 py-10 sm:px-12 sm:py-14 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_16rem_at_50%_-20%,rgba(34,197,94,0.1),transparent_70%)]"
            />
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t.home.bannerTitle}{" "}
              <span className="text-success">{t.home.bannerAccent}</span>
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-muted leading-relaxed">
              {t.home.bannerText}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
              {t.home.bannerChips.map((chip) => (
                <span key={chip} className="badge-neutral">
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
