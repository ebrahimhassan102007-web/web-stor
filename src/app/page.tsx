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
    getFeaturedProducts(4),
  ]);
  const ar = locale === "ar";

  const pillars = [
    {
      href: "/products?category=game-topups",
      icon: "⚡",
      title: ar ? "شحن ألعاب" : "Game top-ups",
      text: ar ? "اكتشف باقات الشحن المتاحة في الكتالوج." : "Explore top-up options in the catalogue.",
    },
    {
      href: "/products?category=gift-cards",
      icon: "🎁",
      title: ar ? "بطاقات رقمية" : "Digital gift cards",
      text: ar ? "بطاقات وهدايا رقمية في مكان واحد." : "Digital cards and gifts in one place.",
    },
    {
      href: "/products?category=subscriptions",
      icon: "✦",
      title: ar ? "اشتراكات وبرامج" : "Subscriptions & software",
      text: ar ? "تصفح الخدمات والاشتراكات الرقمية." : "Browse digital services and subscriptions.",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-5 sm:px-6 sm:pt-8">
      {/* ------------------------------------------------------------ */}
      {/* Hero — cinematic dawn panel                                  */}
      {/* ------------------------------------------------------------ */}
      <section className="hero-shell px-5 py-10 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
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

        <div className="relative z-10 grid items-center gap-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-14">
          <div className="min-w-0">
            <p className="rise-in eyebrow-pill" style={{ "--rise-delay": "40ms" } as React.CSSProperties}>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
              {t.hero.eyebrow}
            </p>

            <h1
              className="rise-in title-luxe mt-5 max-w-2xl text-[2rem] leading-[1.14] sm:text-5xl lg:text-[3.6rem]"
              style={{ "--rise-delay": "120ms" } as React.CSSProperties}
            >
              <span className="text-[#f6f1e7]">{t.hero.titleTop}</span>{" "}
              <span className="text-gradient-dawn">{t.hero.titleAccent}</span>
            </h1>

            <p
              className="rise-in mt-5 max-w-xl text-sm leading-7 text-[#c9c3b8] sm:text-base sm:leading-8"
              style={{ "--rise-delay": "200ms" } as React.CSSProperties}
            >
              {t.hero.sub}
            </p>

            <form
              action="/products"
              method="get"
              role="search"
              className="rise-in search-luxe mt-7 max-w-xl p-1.5"
              style={{ "--rise-delay": "280ms" } as React.CSSProperties}
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
              <button type="submit" className="btn-primary min-h-11 shrink-0 px-4 text-sm sm:px-5">
                {t.filters.search}
              </button>
            </form>

            <div
              className="rise-in mt-5 flex flex-wrap gap-3"
              style={{ "--rise-delay": "360ms" } as React.CSSProperties}
            >
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
              className="rise-in mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.72rem] font-semibold text-[#b9b2a6]"
              style={{ "--rise-delay": "430ms" } as React.CSSProperties}
            >
              {t.hero.highlights.map((item) => (
                <li key={item} className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#ecd9b4]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Glass E-Vora mark — brand anchor, not decoration-as-noise. */}
          <div className="rise-in order-first mx-auto lg:order-none lg:mx-0" style={{ "--rise-delay": "260ms" } as React.CSSProperties}>
            <div className="hero-mark float-soft mx-auto">
              <span className="hero-mark-letter" aria-hidden="true">E</span>
            </div>
            <p className="mt-4 text-center text-[0.68rem] font-bold text-[#cbbfa4]">
              <span className="tracking-luxe">E-VORA</span>
              <span className="mx-2 text-white/25">/</span>
              {t.hero.markNote}
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Pillars                                                      */}
      {/* ------------------------------------------------------------ */}
      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        {pillars.map((item, index) => (
          <Reveal key={item.title} delay={index * 70}>
            <Link
              href={item.href}
              className="glass-card lift group flex h-full min-h-24 items-center gap-4 p-4 sm:p-5"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-edge bg-gradient-to-br from-primary/15 to-transparent text-2xl transition-transform duration-300 group-hover:scale-[1.06]">
                {item.icon}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold transition-colors group-hover:text-champagne">{item.title}</h2>
                <p className="mt-1 text-xs leading-5 text-muted">{item.text}</p>
              </div>
              <span aria-hidden="true" className="shrink-0 text-muted transition-transform duration-300 group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5">
                {ar ? "‹" : "›"}
              </span>
            </Link>
          </Reveal>
        ))}
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Catalogue notice                                             */}
      {/* ------------------------------------------------------------ */}
      <Reveal delay={40}>
        <section className="surface mt-4 flex items-start gap-4 border-amber-500/25 bg-amber-500/[0.055] p-4 sm:items-center sm:px-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-lg">ⓘ</span>
          <div>
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
      {/* Categories                                                   */}
      {/* ------------------------------------------------------------ */}
      {categories.length > 0 && (
        <section className="mt-14">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">{ar ? "تسوق بطريقتك" : "FIND YOUR CATEGORY"}</p>
              <h2 className="title-luxe mt-2 text-2xl sm:text-3xl">
                {t.home.catTitle} <span className="text-champagne">{t.home.catAccent}</span>
              </h2>
            </div>
            <Link href="/products" className="btn-ghost hidden min-h-10 shrink-0 px-4 py-2 text-sm sm:inline-flex">
              {t.home.viewAll}
              <span aria-hidden="true" className="rtl:-scale-x-100">↗</span>
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.slice(0, 6).map((category, index) => (
              <Reveal key={category.id} delay={index * 55}>
                <Link
                  href={"/products?category=" + encodeURIComponent(category.slug)}
                  className="group flex h-full flex-col rounded-2xl border border-edge bg-card/60 p-4 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-champagne/40 hover:shadow-[0_22px_44px_-26px_rgba(0,0,0,0.8)] active:translate-y-0"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-edge bg-gradient-to-br from-primary/12 to-transparent text-2xl transition-transform duration-300 group-hover:scale-105">
                    {category.icon}
                  </span>
                  <span className="mt-3 block text-sm font-bold transition-colors group-hover:text-champagne">
                    {locName(category, locale)}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {category.productCount} {ar ? "منتج" : "items"}
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Featured                                                     */}
      {/* ------------------------------------------------------------ */}
      <section id="featured-products" className="mt-16 scroll-mt-24">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{ar ? "اختيارات E‑Vora" : "HANDPICKED FOR YOU"}</p>
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

        {featured.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
            {featured.map((product, index) => (
              <Reveal key={product.id} delay={index * 80} className="h-full">
                <ProductCard product={product} locale={locale} />
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="surface px-6 py-12 text-center text-sm text-muted">{t.products.emptyText}</div>
        )}
      </section>

      <div className="mt-10 text-center sm:hidden">
        <Link href="/products" className="btn-ghost min-h-11 px-5 py-3 text-sm">
          {t.home.viewAll} <span aria-hidden="true" className="rtl:-scale-x-100">→</span>
        </Link>
      </div>
    </div>
  );
}
