import type { Metadata } from "next";
import Link from "next/link";
import { getFeaturedProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === "ar" ? "العروض" : "Offers", description: locale === "ar" ? "المنتجات المختارة من E‑Vora." : "Featured picks from E‑Vora." };
}
export default async function OffersPage() {
  const [{ locale }, products] = await Promise.all([getI18n(), getFeaturedProducts(12)]);
  const ar = locale === "ar";
  return <div className="store-page-enter mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-12">
    <section className="relative isolate overflow-hidden rounded-[2rem] border border-edge bg-gradient-to-br from-[#25152a] via-[#171827] to-[#101018] p-7 text-white sm:p-10">
      <div aria-hidden className="absolute -end-12 -top-16 h-64 w-64 rounded-full bg-rose-500/25 blur-3xl" />
      <p className="text-xs font-bold tracking-[.2em] text-rose-200">E‑VORA / {ar ? "اختيارات مميزة" : "FEATURED PICKS"}</p>
      <h1 className="relative mt-4 text-3xl font-black sm:text-5xl">{ar ? "العروض والاختيارات" : "Offers & featured picks"}</h1>
      <p className="relative mt-3 max-w-2xl text-sm leading-7 text-white/70">{ar ? "منتجات الذكاء الاصطناعي وشحن الألعاب والمنتجات الرقمية المختارة. الأسعار المعروضة تجريبية وليست خصومات فعلية." : "Explore selected AI subscriptions, game top-ups and digital products. Displayed prices are demo values, not live discounts."}</p>
      <Link href="/products" className="relative mt-6 inline-flex min-h-11 items-center rounded-xl bg-rose-500 px-5 py-3 text-sm font-bold text-white hover:bg-rose-400">{ar ? "كل المنتجات" : "Browse all products"} →</Link>
    </section>
    <div className="my-6 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm leading-7 text-muted">{ar ? "تنبيه: لا توجد أكواد خصم أو أسعار مخفضة مفعّلة في المعاينة. لن يتم خصم أموال أو تنفيذ أي عملية شراء." : "Preview notice: no coupon codes or live discounts are active. No payment will be taken and no purchase will be fulfilled."}</div>
    <div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-xs font-bold tracking-[.18em] text-primary">{ar ? "مختارة ليك" : "CURATED FOR YOU"}</p><h2 className="mt-2 text-2xl font-extrabold">{ar ? "منتجات مميزة" : "Featured products"}</h2></div><span className="badge-neutral">{products.length} {ar ? "منتج" : "items"}</span></div>
    {products.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{products.map((product, index) => <ProductCard key={product.id} product={product} locale={locale} animationIndex={index} />)}</div> : <div className="glass-card p-10 text-center text-sm text-muted">{ar ? "لا توجد منتجات مميزة حالياً." : "No featured products are available yet."}</div>}
  </div>;
}
