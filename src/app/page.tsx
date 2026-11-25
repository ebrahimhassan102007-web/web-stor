import Link from "next/link";
import { getCategoriesWithCounts, getFeaturedProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { getI18n } from "@/lib/i18n/server";
import { locName } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [{ locale, t }, categories, featured] = await Promise.all([
    getI18n(),
    getCategoriesWithCounts(),
    getFeaturedProducts(8),
  ]);
  const ar = locale === "ar";

  // Bento quick actions: three doors out of the hero, each a real destination.
  const quickActions = [
    {
      href: "/offers",
      icon: "🏷️",
      title: t.bento.dealsTitle,
      text: t.bento.dealsText,
      cta: t.bento.dealsCta,
      tone: "border-primary/25 bg-primary/[0.06]",
    },
    {
      href: "/policies/delivery-refunds",
      icon: "🔐",
      title: t.bento.vaultTitle,
      text: t.bento.vaultText,
      cta: t.bento.vaultCta,
      tone: "border-champagne/25 bg-champagne/[0.06]",
    },
    {
      href: "/seller",
      icon: "◈",
      title: t.bento.merchantTitle,
      text: t.bento.merchantText,
      cta: t.bento.merchantCta,
      tone: "border-edge bg-card/60",
    },
  ] as const;

  const trust = [
    { icon: "🔐", title: t.trust.vaultTitle, text: t.trust.vaultText },
    { icon: "⚖️", title: t.trust.escrowTitle, text: t.trust.escrowText },
    { icon: "⚡", title: t.trust.walletTitle, text: t.trust.walletText },
  ] as const;

  const trending = featured.slice(0, 4);
  const more = featured.slice(4, 8);

  return (
    <div className="shell pb-24 pt-4 sm:pt-7">
      {/* ------------------------------------------------------------ */}
      {/* Bento hero — flagship spotlight + three quick actions        */}
      {/* ------------------------------------------------------------ */}
      <section aria-labelledby="hero-title" className="grid gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-4">
        <div className="hero-shell px-5 py-9 sm:px-9 sm:py-12 lg:px-11 lg:py-12">
          <div aria-hidden="true" className="hero-aurora" />
          <div aria-hidden="true" className="hero-grid absolute inset-0 z-0 opacity-[0.10]" />
          <div aria-hidden="true" className="hero-ornaments">
            <span
              className="hero-ornament-ring"
              style={{ insetInlineEnd: "-6rem", insetBlockStart: "-8rem", width: "26rem", height: "26rem" }}
            />
            <span
              className="hero-ornament-ring"
              style={{ insetInlineEnd: "4rem", insetBlockEnd: "-12rem", width: "20rem", height: "20rem", opacity: 0.6 }}
            />
            <span
              className="absolute inset-x-0 top-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(236,217,180,0.45), transparent)" }}
            />
          </div>

          <div className="relative z-10">
            <p className="rise-in eyebrow-pill" style={{ "--rise-delay": "40ms" } as React.CSSProperties}>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
              {t.hero.eyebrow}
            </p>

            <h1
              id="hero-title"
              className="rise-in title-luxe mt-5 max-w-2xl text-[2rem] leading-[1.14] sm:text-5xl lg:text-[3.35rem]"
              style={{ "--rise-delay": "110ms" } as React.CSSProperties}
            >
              <span className="text-[#f6f1e7]">{t.hero.titleTop}</span>{" "}
              <span className="text-gradient-dawn">{t.hero.titleAccent}</span>
            </h1>

            <p
              className="rise-in mt-4 max-w-xl text-sm leading-7 text-[#c9c3b8] sm:text-base sm:leading-8"
              style={{ "--rise-delay": "180ms" } as React.CSSProperties}
            >
              {t.hero.sub}
            </p>

            <form
              action="/products"
              method="get"
              role="search"
              className="rise-in search-luxe mt-6 max-w-xl p-1.5"
              style={{ "--rise-delay": "250ms" } as React.CSSProperties}
            >
              <label htmlFor="home-product-search" className="sr-only">{t.filters.searchAria}</label>
              <svg aria-hidden="true" className="ms-3 h-5 w-5 shrink-0 text-[#d9cfae]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-4-4" />
              </svg>
              <input
                id="home-product-search"
                type="search"
                name="q"
                autoComplete="off"
                placeholder={t.filters.searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-sm text-[#f6f1e7] outline-none placeholder:text-[#a49d90] sm:py-3"
              />
              <button type="submit" className="btn-primary min-h-11 shrink-0 px-3.5 text-sm sm:px-5">
                {t.filters.search}
              </button>
            </form>

            <div className="rise-in mt-4 flex flex-wrap gap-2.5" style={{ "--rise-delay": "320ms" } as React.CSSProperties}>
              <Link href="/products" className="btn-primary min-h-12 px-5 py-3 text-sm">
                {t.hero.ctaBrowse}
                <span aria-hidden="true" className="rtl:-scale-x-100">→</span>
              </Link>
              <Link
                href="/products?category=game-topups"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/18 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-[#f6f1e7] backdrop-blur transition hover:border-[#ecd9b4]/60 hover:bg-white/[0.11] active:scale-[0.985]"
              >
                {t.hero.ctaTopups}
              </Link>
            </div>

            <ul
              className="rise-in mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.72rem] font-semibold text-[#b9b2a6]"
              style={{ "--rise-delay": "390ms" } as React.CSSProperties}
            >
              {t.hero.highlights.map((item) => (
                <li key={item} className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#ecd9b4]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-3 lg:grid-cols-1 lg:gap-4">
          {quickActions.map((action, index) => (
            <Link
              key={action.href}
              href={action.href}
              className={`enter-up tactile sheen-edge flex flex-col justify-between gap-3 rounded-[1.15rem] border p-4 sm:p-5 ${action.tone}`}
              style={{ "--i": index } as React.CSSProperties}
            >
              <span className="flex items-start gap-3">
                <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-edge bg-card/70 text-lg">
                  {action.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{action.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted">{action.text}</span>
                </span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-champagne">
                {action.cta}
                <span aria-hidden="true" className="rtl:-scale-x-100">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Trust architecture bar                                       */}
      {/* ------------------------------------------------------------ */}
      <section aria-label={t.trust.label} className="stagger mt-4 grid gap-3 sm:grid-cols-3">
        {trust.map((item, index) => (
          <div key={item.title} className="surface flex items-start gap-3 p-4" style={{ "--i": index } as React.CSSProperties}>
            <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-edge bg-raised/50 text-lg">
              {item.icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{item.text}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Category pills — links, wrapped (never a horizontal scroller) */}
      {/* ------------------------------------------------------------ */}
      {categories.length > 0 && (
        <section className="mt-9" aria-label={t.bento.filtersLabel}>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">{t.bento.filtersLabel}</p>
              <h2 className="title-luxe mt-2 text-xl sm:text-2xl">
                {t.home.catTitle} <span className="text-champagne">{t.home.catAccent}</span>
              </h2>
            </div>
            <Link href="/products" className="btn-ghost hidden min-h-10 shrink-0 px-4 py-2 text-sm sm:inline-flex">
              {t.home.viewAll}
              <span aria-hidden="true" className="rtl:-scale-x-100">↗</span>
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/products"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-champagne/35 bg-champagne/10 px-4 text-sm font-semibold text-champagne transition-colors duration-200 hover:bg-champagne/15"
            >
              <span aria-hidden="true">▦</span>
              {t.bento.allFilter}
            </Link>
            {categories.slice(0, 8).map((category) => (
              <Link
                key={category.id}
                href={"/products?category=" + encodeURIComponent(category.slug)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-edge bg-card/60 px-4 text-sm font-semibold text-foreground/90 transition-all duration-200 hover:-translate-y-0.5 hover:border-champagne/40 hover:text-champagne active:translate-y-0 active:scale-[0.99]"
              >
                <span aria-hidden="true">{category.icon}</span>
                {locName(category, locale)}
                <span className="text-xs font-medium text-muted">{category.productCount}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Compliance notice                                            */}
      {/* ------------------------------------------------------------ */}
      <Reveal delay={40}>
        <section className="surface mt-6 flex items-start gap-4 border-amber-500/25 bg-amber-500/[0.055] p-4 sm:items-center sm:px-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-lg">ⓘ</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{ar ? "نسخة استعراضية — المنتجات للمعاينة فقط" : "Store preview — products are for browsing only"}</p>
            <p className="mt-1 text-xs leading-6 text-muted">
              {ar
                ? "الأسعار والمنتجات المعروضة للتوضيح. لا تتم معالجة مدفوعات حقيقية ولا يتم حجز مخزون أو تسليم أكواد."
                : "Products and prices are shown for demonstration. No real payments, inventory reservations or digital deliveries are processed."}
            </p>
          </div>
        </section>
      </Reveal>

      {/* ------------------------------------------------------------ */}
      {/* Trending row                                                 */}
      {/* ------------------------------------------------------------ */}
      <section id="featured-products" className="mt-12 scroll-mt-32">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{ar ? "الأكثر رواجاً" : "TRENDING NOW"}</p>
            <h2 className="title-luxe mt-2 text-2xl sm:text-3xl">
              {t.home.featuredTitle} <span className="text-champagne">{t.home.featuredAccent}</span>
            </h2>
            <p className="mt-2 text-sm text-muted">{t.home.featuredSub}</p>
          </div>
          <Link href="/products" className="btn-ghost hidden min-h-10 shrink-0 items-center px-4 py-2 text-sm sm:inline-flex">
            {t.home.viewAll}
            <span aria-hidden="true" className="ms-1 rtl:-scale-x-100">→</span>
          </Link>
        </div>

        {trending.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-5">
            {trending.map((product, index) => (
              <Reveal key={product.id} delay={index * 70} className="h-full">
                <ProductCard product={product} locale={locale} />
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="surface px-6 py-12 text-center text-sm text-muted">{t.products.emptyText}</div>
        )}
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Second merchandising row                                     */}
      {/* ------------------------------------------------------------ */}
      {more.length > 0 && (
        <section className="mt-12">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">{ar ? "مختارات إضافية" : "MORE TO EXPLORE"}</p>
              <h2 className="title-luxe mt-2 text-2xl sm:text-3xl">{t.bento.more}</h2>
            </div>
            <Link href="/offers" className="btn-ghost hidden min-h-10 shrink-0 items-center px-4 py-2 text-sm sm:inline-flex">
              {t.bento.dealsCta}
              <span aria-hidden="true" className="ms-1 rtl:-scale-x-100">→</span>
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-5">
            {more.map((product, index) => (
              <Reveal key={product.id} delay={index * 70} className="h-full">
                <ProductCard product={product} locale={locale} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 text-center sm:hidden">
        <Link href="/products" className="btn-ghost min-h-11 px-5 py-3 text-sm">
          {t.home.viewAll} <span aria-hidden="true" className="rtl:-scale-x-100">→</span>
        </Link>
      </div>
    </div>
  );
}
