import Link from "next/link";
import { getCategoriesWithCounts, getFeaturedProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
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

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 sm:pt-9">
      <section className="relative isolate overflow-hidden rounded-[2rem] border border-edge bg-[#111827] px-6 py-10 text-white shadow-2xl sm:px-10 sm:py-14 lg:px-14 lg:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -end-20 -top-28 h-96 w-96 rounded-full bg-rose-500/25 blur-3xl" />
          <div className="absolute -bottom-40 start-1/4 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px)", backgroundSize: "42px 42px" }} />
        </div>
        <div className="relative max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-rose-100 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-rose-400" />
            E‑VORA <span className="text-white/50">/</span> {ar ? "متجرك الرقمي" : "YOUR DIGITAL STORE"}
          </div>
          <h1 className="mt-6 max-w-2xl text-4xl font-black leading-[1.12] tracking-tight sm:text-6xl">
            {t.hero.titleTop} <span className="text-rose-300">{t.hero.titleAccent}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-8 text-slate-300 sm:text-base">{t.hero.sub}</p>
          <form action="/products" method="get" role="search" className="mt-7 flex max-w-xl items-center gap-2 rounded-2xl border border-white/15 bg-white/10 p-2 backdrop-blur-xl focus-within:border-rose-300/60">
            <label htmlFor="home-product-search" className="sr-only">{t.filters.searchAria}</label>
            <svg aria-hidden="true" className="ms-3 h-5 w-5 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-4-4" />
            </svg>
            <input id="home-product-search" type="search" name="q" autoComplete="off" placeholder={t.filters.searchPlaceholder} className="min-w-0 flex-1 bg-transparent px-1 py-3 text-sm text-white outline-none placeholder:text-slate-400" />
            <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-rose-500 px-5 text-sm font-bold text-white transition hover:bg-rose-400">{t.filters.search}</button>
          </form>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/products" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-rose-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-rose-950/30 transition hover:-translate-y-0.5 hover:bg-rose-400">{t.hero.ctaBrowse}<span aria-hidden="true" className="rtl:-scale-x-100">→</span></Link>
            <Link href="/products?category=game-topups" className="inline-flex min-h-12 items-center rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">{t.hero.ctaTopups}</Link>
          </div>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute bottom-8 end-10 hidden rotate-[-8deg] rounded-3xl border border-white/15 bg-white/[0.07] p-5 shadow-2xl backdrop-blur sm:block lg:end-16 lg:bottom-12">
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-violet-600 text-5xl font-black shadow-inner">E</div>
          <p className="mt-3 text-center text-xs font-bold tracking-[0.2em] text-white/80">E‑VORA</p>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { icon: "⚡", title: ar ? "شحن ألعاب" : "Game top-ups", text: ar ? "اكتشف باقات الشحن المتاحة في الكتالوج." : "Explore top-up options in the catalogue." },
          { icon: "🎁", title: ar ? "بطاقات رقمية" : "Digital gift cards", text: ar ? "بطاقات وهدايا رقمية في مكان واحد." : "Digital cards and gifts in one place." },
          { icon: "✦", title: ar ? "اشتراكات وبرامج" : "Subscriptions & software", text: ar ? "تصفح الخدمات والاشتراكات الرقمية." : "Browse digital services and subscriptions." },
        ].map((item) => (
          <Link
            key={item.title}
            href={item.title === (ar ? "شحن ألعاب" : "Game top-ups")
              ? "/products?category=game-topups"
              : item.title === (ar ? "بطاقات رقمية" : "Digital gift cards")
                ? "/products?category=gift-cards"
                : "/products?category=subscriptions"}
            className="glass-card group flex min-h-24 items-center gap-4 rounded-2xl p-4 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:p-5"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-2xl transition-transform group-hover:scale-110">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold transition-colors group-hover:text-primary">{item.title}</h2>
              <p className="mt-1 text-xs leading-5 text-muted">{item.text}</p>
            </div>
            <span aria-hidden="true" className="shrink-0 text-muted transition-transform group-hover:translate-x-[-2px] rtl:group-hover:translate-x-[2px]">{ar ? "‹" : "›"}</span>
          </Link>
        ))}
      </section>

      <section className="mt-8 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 sm:flex sm:items-center sm:gap-4 sm:px-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-xl">ⓘ</span>
        <div className="mt-3 sm:mt-0">
          <p className="text-sm font-bold">{ar ? "نسخة استعراضية — المنتجات للمعاينة فقط" : "Store preview — products are for browsing only"}</p>
          <p className="mt-1 text-xs leading-6 text-muted">{ar ? "الأسعار والمنتجات المعروضة للتوضيح. لا تتم معالجة مدفوعات حقيقية ولا يتم حجز مخزون أو تسليم أكواد." : "Products and prices are shown for demonstration. No real payments, inventory reservations or digital deliveries are processed."}</p>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="mt-12">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{ar ? "تسوق بطريقتك" : "FIND YOUR CATEGORY"}</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{t.home.catTitle} <span className="text-primary">{t.home.catAccent}</span></h2></div>
            <Link href="/products" className="text-sm font-semibold text-primary hover:underline">{t.home.viewAll} ↗</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.slice(0, 6).map((category) => (
              <Link key={category.id} href={"/products?category=" + encodeURIComponent(category.slug)} className="group rounded-2xl border border-edge bg-card/70 p-4 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-2xl">{category.icon}</span>
                <span className="mt-3 block text-sm font-bold group-hover:text-primary">{locName(category, locale)}</span>
                <span className="mt-1 block text-xs text-muted">{category.productCount} {ar ? "منتج" : "items"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section id="featured-products" className="mt-14 scroll-mt-24">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{ar ? "اختيارات E‑Vora" : "HANDPICKED FOR YOU"}</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{t.home.featuredTitle} <span className="text-primary">{t.home.featuredAccent}</span></h2><p className="mt-2 text-sm text-muted">{t.home.featuredSub}</p></div>
          <Link href="/products" className="hidden min-h-10 shrink-0 items-center rounded-xl border border-edge px-4 py-2 text-sm font-semibold transition hover:border-primary/40 hover:text-primary sm:inline-flex">{t.home.viewAll} <span className="ms-2 rtl:-scale-x-100">→</span></Link>
        </div>
        {featured.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">{featured.map((product) => <ProductCard key={product.id} product={product} locale={locale} />)}</div>
        ) : (
          <div className="rounded-2xl border border-dashed border-edge px-6 py-12 text-center text-sm text-muted">{t.products.emptyText}</div>
        )}
      </section>
      <div className="mt-10 text-center sm:hidden"><Link href="/products" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-edge px-5 py-3 text-sm font-semibold">{t.home.viewAll} →</Link></div>
    </div>
  );
}
