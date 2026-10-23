import Link from "next/link";
import { getCategoriesWithCounts, getFeaturedProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { formatCents } from "@/lib/money";
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
      <section className="relative mt-5 overflow-hidden rounded-[2rem] border border-edge bg-card/40 sm:mt-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -end-24 -top-28 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-32 -start-24 h-80 w-80 rounded-full bg-success/10 blur-3xl" />
          <div className="hero-grid absolute inset-0 opacity-50" />
        </div>
        <div className="relative grid items-center gap-8 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[1.04fr_.96fr] lg:gap-10 lg:px-12">
          <div className="min-w-0 py-2">
            <span className="badge-green mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              {t.hero.badge}
            </span>
            <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.12] tracking-tight sm:text-5xl xl:text-6xl">
              {t.hero.titleTop}
              <span className="mt-1 block text-primary">{t.hero.titleAccent}</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">{t.hero.sub}</p>
            <form action="/products" method="get" role="search"
              className="mt-7 flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-edge bg-raised/90 p-1.5 text-start shadow-xl shadow-black/10 transition-colors focus-within:border-primary/50">
              <label htmlFor="home-product-search" className="sr-only">{t.filters.searchAria}</label>
              <svg aria-hidden="true" className="ms-3 h-5 w-5 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-4-4" />
              </svg>
              <input id="home-product-search" type="search" name="q" autoComplete="off"
                placeholder={t.filters.searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent px-1 py-3 text-sm text-foreground outline-none placeholder:text-muted" />
              <button type="submit" className="btn-primary min-h-11 shrink-0 px-4 sm:px-6">
                {t.filters.search}
                <svg aria-hidden="true" className="h-4 w-4 rtl:-scale-x-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </button>
            </form>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Link href="/products" className="btn-primary min-h-12 w-full px-7 py-3 text-base sm:w-auto">
                {t.hero.ctaBrowse}<span aria-hidden className="rtl:-scale-x-100">→</span>
              </Link>
              <Link href="/products?category=game-topups" className="btn-ghost min-h-12 w-full px-7 py-3 text-base sm:w-auto">
                {t.hero.ctaTopups}
              </Link>
            </div>
            {categories.length > 0 && (
              <nav aria-label={t.home.catTitle + " " + t.home.catAccent} className="mt-7 flex flex-wrap items-center gap-2">
                {categories.slice(0, 4).map((category) => (
                  <Link key={category.id} href={"/products?category=" + encodeURIComponent(category.slug)}
                    className="inline-flex items-center gap-2 rounded-full border border-edge bg-card/70 px-3.5 py-2 text-xs font-medium text-muted transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground">
                    <span aria-hidden="true">{category.icon}</span>{locName(category, locale)}
                  </Link>
                ))}
              </nav>
            )}
          </div>
          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div aria-hidden className="absolute -inset-3 rounded-[2rem] bg-primary/5 blur-2xl" />
            <div className="relative overflow-hidden rounded-3xl border border-edge/90 bg-raised/80 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl sm:p-5">
              <div className="flex items-center justify-between gap-3 border-b border-edge pb-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dim text-lg font-black text-white shadow-lg shadow-primary/20">E</span>
                  <div className="min-w-0">
                    <p className="font-bold tracking-tight">E-Vora</p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{t.home.previewSub}</p>
                  </div>
                </div>
                <span className="badge-neutral max-w-28 shrink-0 truncate text-[10px] sm:max-w-40">{t.hero.badge}</span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{t.home.previewTitle}</p>
                  <h2 className="mt-1 text-2xl font-extrabold tracking-tight"><span className="text-primary">{t.home.previewAccent}</span></h2>
                </div>
                <Link href="/products" className="shrink-0 text-sm font-semibold text-primary transition-colors hover:text-foreground">
                  {t.home.viewAll} <span aria-hidden className="inline-block rtl:-scale-x-100">→</span>
                </Link>
              </div>
              <div className="mt-4 space-y-3">
                {featured.slice(0, 3).map((product) => (
                  <Link key={product.id} href={`/products/${product.slug}`}
                    className="group flex items-center gap-3 rounded-2xl border border-edge/80 bg-card/70 p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card">
                    <span className="product-art flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl">
                      <span aria-hidden className="product-art-mark">{product.icon}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-1 text-sm font-semibold transition-colors group-hover:text-primary">{locName(product, locale)}</span>
                      <span className="mt-1 block text-xs text-muted">{product.featured ? t.product.featured : t.card.inStock}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums">{formatCents(product.priceCents, locale)}</span>
                  </Link>
                ))}
                {featured.length === 0 && categories.slice(0, 3).map((category) => (
                  <Link key={category.id} href={"/products?category=" + encodeURIComponent(category.slug)}
                    className="flex items-center gap-3 rounded-2xl border border-edge/80 bg-card/70 p-3 transition-colors hover:border-primary/40">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-hover text-2xl">{category.icon}</span>
                    <span className="min-w-0 flex-1 text-sm font-semibold">{locName(category, locale)}</span>
                    <span aria-hidden className="text-primary rtl:-scale-x-100">→</span>
                  </Link>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-edge pt-4">
                {t.home.bannerChips.slice(0, 3).map((chip) => <span key={chip} className="badge-neutral text-[10px]">{chip}</span>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section aria-label="E-Vora" className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2 lg:grid-cols-4">
        {t.badges.map((b) => (
          <div key={b.title} className="glass-card card-glow-green group p-5 transition-transform duration-300 hover:-translate-y-1 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-edge bg-raised/80 text-xl" aria-hidden>
                {b.icon}
              </span>
              <h2 className="pt-1 font-semibold leading-snug">{b.title}</h2>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">{b.text}</p>
          </div>
        ))}
      </section>

      {/* Featured products */}
      <section id="featured-products" className="mt-16 scroll-mt-24 sm:mt-20">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t.home.featuredTitle}{" "}
              <span className="text-primary">{t.home.featuredAccent}</span>
            </h2>
            <p className="mt-1 text-sm text-muted">{t.home.featuredSub}</p>
          </div>
          <Link
            href="/products"
            className="btn-ghost inline-flex min-h-10 items-center gap-2 self-start px-4 py-2 sm:self-auto"
          >
            {t.home.viewAll}
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
      <section className="mt-16 sm:mt-20">
        <h2 className="mb-6 text-2xl font-bold tracking-tight sm:mb-8 sm:text-3xl">
          {t.home.catTitle}{" "}
          <span className="text-success">{t.home.catAccent}</span>
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/products?category=${encodeURIComponent(c.slug)}`}
              className="glass-card card-glow-red group flex min-h-56 h-full flex-col p-5 transition-transform duration-300 hover:-translate-y-1 sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-edge bg-raised/80 text-2xl" aria-hidden>
                  {c.icon}
                </span>
                <span aria-hidden className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-edge text-muted transition-colors group-hover:border-primary/40 group-hover:text-primary rtl:-scale-x-100">→</span>
              </div>
              <h3 className="mt-4 font-semibold transition-colors group-hover:text-primary">
                {locName(c, locale)}
              </h3>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                {locDesc(c, locale)}
              </p>
              <p className="mt-auto pt-4 text-xs font-semibold text-muted">
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
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
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
