import type { Metadata } from "next";
import Link from "next/link";
import { getFeaturedProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { getI18n } from "@/lib/i18n/server";
import { and, eq, gt, isNull, or, lte } from "drizzle-orm";
import { db, promoCodes } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === "ar" ? "العروض" : "Offers", description: locale === "ar" ? "المنتجات المختارة من E‑Vora." : "Featured picks from E‑Vora." };
}
export default async function OffersPage() {
  const [{ locale, t }, products] = await Promise.all([getI18n(), getFeaturedProducts(12)]);
  const ar = locale === "ar";
  const now = new Date();
  const activeOffers = await db.select({ code: promoCodes.code, description: promoCodes.description, descriptionAr: promoCodes.descriptionAr, discountType: promoCodes.discountType, discountValue: promoCodes.discountValue, expiresAt: promoCodes.expiresAt }).from(promoCodes).where(and(eq(promoCodes.isPublic, true), eq(promoCodes.isActive, true), lte(promoCodes.startsAt, now), or(isNull(promoCodes.expiresAt), gt(promoCodes.expiresAt, now)))).limit(24);
  return <div className="shell py-8 sm:py-12">
    <section className="dawn-panel p-7 text-white sm:p-10">
      <div aria-hidden className="absolute -end-12 -top-16 h-64 w-64 rounded-full bg-[#ecd9b4]/20 blur-3xl" />
      <div aria-hidden className="absolute -bottom-24 start-1/3 h-56 w-56 rounded-full bg-[#f0a8a0]/15 blur-3xl" />
      <p className="eyebrow">E‑VORA / {ar ? "اختيارات مميزة" : "FEATURED PICKS"}</p>
      <h1 className="title-luxe relative mt-4 text-3xl sm:text-5xl">{ar ? "العروض والاختيارات" : "Offers & featured picks"}</h1>
      <p className="relative mt-3 max-w-2xl text-sm leading-7 text-white/70">{ar ? "منتجات الذكاء الاصطناعي وشحن الألعاب والمنتجات الرقمية المختارة. الأسعار المعروضة تجريبية وليست خصومات فعلية." : "Explore selected AI subscriptions, game top-ups and digital products. Displayed prices are demo values, not live discounts."}</p>
      <Link href="/products" className="btn-primary relative mt-6 min-h-11 px-5 py-3 text-sm">{ar ? "كل المنتجات" : "Browse all products"} →</Link>
    </section>
    <section aria-label={t.trust.label} className="stagger mt-4 grid gap-3 sm:grid-cols-3">
      {[
        { icon: "🔐", title: t.trust.vaultTitle, text: t.trust.vaultText },
        { icon: "⚖️", title: t.trust.escrowTitle, text: t.trust.escrowText },
        { icon: "⚡", title: t.trust.walletTitle, text: t.trust.walletText },
      ].map((item, index) => (
        <div key={item.title} className="surface flex items-start gap-3 p-4" style={{ "--i": index } as React.CSSProperties}>
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-edge bg-raised/50 text-lg">{item.icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold">{item.title}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{item.text}</p>
          </div>
        </div>
      ))}
    </section>
    <section className="my-7">
      <h2 className="title-luxe text-2xl">{ar ? "أكواد الخصم النشطة" : "Active promo codes"}</h2>
      {activeOffers.length ? <div className="stagger mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{activeOffers.map((offer) => <article key={offer.code} className="glass-card p-5"><span className="badge-champagne">{offer.code}</span><p className="mt-3 font-semibold">{ar ? (offer.descriptionAr || offer.description) : offer.description}</p><p className="mt-1 text-sm text-muted">{offer.discountType === "percentage" ? `${(offer.discountValue / 100).toLocaleString(ar ? "ar-EG" : "en-US")}%` : `${(offer.discountValue / 100).toFixed(2)} USD`} {ar ? "خصم" : "off"}</p></article>)}</div> : <p className="surface mt-4 p-4 text-sm text-muted">{ar ? "لا توجد أكواد عامة نشطة حالياً." : "There are no public active promo codes right now."}</p>}
    </section>
    <div className="mb-5 flex items-end justify-between gap-4"><div><p className="eyebrow">{ar ? "مختارة ليك" : "CURATED FOR YOU"}</p><h2 className="title-luxe mt-2 text-2xl">{ar ? "منتجات مميزة" : "Featured products"}</h2></div><span className="badge-neutral">{products.length} {ar ? "منتج" : "items"}</span></div>
    {products.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{products.map((product, index) => <Reveal key={product.id} delay={Math.min(index, 8) * 55} className="h-full"><ProductCard product={product} locale={locale} /></Reveal>)}</div> : <div className="glass-card p-10 text-center text-sm text-muted">{ar ? "لا توجد منتجات مميزة حالياً." : "No featured products are available yet."}</div>}
  </div>;
}
