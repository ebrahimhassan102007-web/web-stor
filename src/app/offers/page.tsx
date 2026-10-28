import type { Metadata } from "next";
import Link from "next/link";
import { getFeaturedProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === "ar" ? "العروض" : "Offers", description: locale === "ar" ? "المنتجات المختارة من E‑Vora." : "Featured picks from E‑Vora." };
}
export default async function OffersPage() {
  const [{ locale }, products] = await Promise.all([getI18n(), getFeaturedProducts(12)]);
  const ar = locale === "ar";
  return <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-12">
    <section className="relative isolate overflow-hidden rounded-[2rem] border border-[#ecd9b4]/20 bg-[linear-gradient(150deg,#1b1420_0%,#231826_52%,#0f0c14_100%)] p-7 text-white shadow-[0_40px_90px_-52px_rgba(0,0,0,0.95)] sm:p-10">
      <div aria-hidden className="absolute -end-12 -top-16 h-64 w-64 rounded-full bg-[#ecd9b4]/20 blur-3xl" />
      <div aria-hidden className="absolute -bottom-24 start-1/3 h-56 w-56 rounded-full bg-[#f0a8a0]/15 blur-3xl" />
      <p className="eyebrow">E‑VORA / {ar ? "اختيارات مميزة" : "FEATURED PICKS"}</p>
      <h1 className="title-luxe relative mt-4 text-3xl sm:text-5xl">{ar ? "العروض والاختيارات" : "Offers & featured picks"}</h1>
      <p className="relative mt-3 max-w-2xl text-sm leading-7 text-white/70">{ar ? "منتجات الذكاء الاصطناعي وشحن الألعاب والمنتجات الرقمية المختارة. الأسعار المعروضة تجريبية وليست خصومات فعلية." : "Explore selected AI subscriptions, game top-ups and digital products. Displayed prices are demo values, not live discounts."}</p>
      <Link href="/products" className="btn-primary relative mt-6 min-h-11 px-5 py-3 text-sm">{ar ? "كل المنتجات" : "Browse all products"} →</Link>
    </section>
    <div className="surface my-6 border-amber-500/25 bg-amber-500/[0.055] p-4 text-sm leading-7 text-muted">{ar ? "تنبيه: لا توجد أكواد خصم أو أسعار مخفضة مفعّلة في المعاينة. لن يتم خصم أموال أو تنفيذ أي عملية شراء." : "Preview notice: no coupon codes or live discounts are active. No payment will be taken and no purchase will be fulfilled."}</div>
    <div className="mb-5 flex items-end justify-between gap-4"><div><p className="eyebrow">{ar ? "مختارة ليك" : "CURATED FOR YOU"}</p><h2 className="title-luxe mt-2 text-2xl">{ar ? "منتجات مميزة" : "Featured products"}</h2></div><span className="badge-neutral">{products.length} {ar ? "منتج" : "items"}</span></div>
    {products.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{products.map((product, index) => <Reveal key={product.id} delay={Math.min(index, 8) * 55} className="h-full"><ProductCard product={product} locale={locale} /></Reveal>)}</div> : <div className="glass-card p-10 text-center text-sm text-muted">{ar ? "لا توجد منتجات مميزة حالياً." : "No featured products are available yet."}</div>}
  </div>;
}
