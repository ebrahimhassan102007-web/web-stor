import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProductBySlug,
  getRelatedProducts,
} from "@/lib/catalog";
import { formatCents, formatEgpFromUsdCents } from "@/lib/money";
import { AddToCart } from "@/components/add-to-cart";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { getI18n } from "@/lib/i18n/server";
import { fill, locDesc, locName } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata(props: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const [{ locale, t }, row] = await Promise.all([
    getI18n(),
    getProductBySlug(slug),
  ]);
  if (!row) return { title: t.meta.productNotFound };
  const title = locName(row.product, locale);
  const description = locDesc(row.product, locale).slice(0, 160);
  return {
    title,
    description,
    openGraph: {
      title: `${title} · E-Vora`,
      description,
      siteName: "E-Vora",
      type: "website",
    },
    twitter: { card: "summary", title: `${title} · E-Vora`, description },
  };
}

/**
 * Buy-box product page (Wave 6).
 *
 * Desktop keeps a sticky buy box beside the artwork — price, vault status,
 * delivery guidance and the single primary CTA stay in view while the
 * description and specification table scroll. Phones get the same block in
 * normal flow, immediately under the artwork, with full-width 44px+ controls.
 */
export default async function ProductDetailPage(props: { params: Params }) {
  const { slug } = await props.params;
  const [{ locale, t }, row] = await Promise.all([
    getI18n(),
    getProductBySlug(slug),
  ]);
  if (!row) notFound();

  const ar = locale === "ar";
  const { product, categoryName, categoryNameAr, categorySlug } = row;
  const categoryLabel = locName(
    { name: categoryName, nameAr: categoryNameAr },
    locale,
  );
  const related = await getRelatedProducts(product.categoryId, product.id, 4);
  const inStock = product.stock > 0;

  const deliveryGuide =
    product.inputType === "player-id"
      ? {
          title: ar ? "رقم اللاعب (Player UID)" : "Player UID required",
          text: ar
            ? "هتكتب رقم اللاعب في الخانة اللي تحت قبل الإضافة للسلة."
            : "Enter your player UID in the field below before adding to the cart.",
          icon: "🎮",
        }
      : product.inputType === "activation-email"
        ? {
            title: ar ? "بريد التفعيل" : "Activation email required",
            text: ar
              ? "الكود هيتبعت لبريد التفعيل اللي هتكتبه."
              : "The code is bound to the activation email you provide.",
            icon: "✉️",
          }
        : product.inputType === "region"
          ? {
              title: ar ? "المنطقة" : "Region required",
              text: ar
                ? "اختار المنطقة المناسبة لحسابك قبل الشراء."
                : "Pick the region that matches your account before purchase.",
              icon: "🌐",
            }
          : {
              title: ar ? "تسليم مباشر في الحساب" : "Delivered straight to your account",
              text: ar
                ? "مش محتاج بيانات إضافية — الكود بيظهر في طلباتك."
                : "No extra details needed — the code appears in your orders.",
              icon: "⚡",
            };

  const guarantees = [
    { icon: "🔐", text: t.trust.vaultTitle },
    { icon: "⚖️", text: t.trust.escrowTitle },
    { icon: "⚡", text: t.trust.walletTitle },
  ] as const;

  return (
    <div className="shell py-6 sm:py-9">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted sm:text-sm">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="hover:text-primary">{t.nav.home}</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/products" className="hover:text-primary">{t.nav.products}</Link></li>
          <li aria-hidden>/</li>
          <li>
            <Link
              href={`/products?category=${encodeURIComponent(categorySlug)}`}
              className="hover:text-primary"
            >
              {categoryLabel}
            </Link>
          </li>
        </ol>
      </nav>

      {/* Title block — full width so the page has one unambiguous h1. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="badge-neutral">{categoryLabel}</span>
        {inStock ? (
          <span className="badge-green">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {t.card.inStock}
          </span>
        ) : (
          <span className="badge-red">{t.card.outOfStock}</span>
        )}
        <span className={`${product.sellerId ? "badge-green" : "badge-champagne"}`}>
          {product.sellerId ? t.card.verifiedSeller : t.card.officialStore}
        </span>
        {product.featured && <span className="badge-champagne">{t.product.featured}</span>}
      </div>
      <h1 className="title-luxe mb-6 max-w-4xl text-2xl leading-tight sm:text-4xl">
        {locName(product, locale)}
      </h1>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-8">
        {/* Artwork */}
        <div className="glass-card sheen-edge group relative overflow-hidden p-3 sm:p-4">
          <div className="relative overflow-hidden rounded-[0.95rem]">
            <div className="product-art aspect-[4/3] text-[7rem] sm:aspect-square sm:text-[11rem]">
              <span aria-hidden className="product-art-mark">{product.icon}</span>
            </div>
            <span aria-hidden className="sheen absolute inset-0 rounded-[0.95rem]" />
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-24"
              style={{ background: "linear-gradient(180deg, transparent, color-mix(in srgb, var(--bg-deep) 55%, transparent))" }}
            />
            <span className="badge-champagne absolute bottom-3 start-3 z-10 text-[0.7rem]">
              <span className="tracking-luxe">E-VORA</span>
            </span>
          </div>
        </div>

        {/* Sticky buy box (desktop) / inline action block (phone) */}
        <aside
          aria-label={ar ? "صندوق الشراء" : "Buy box"}
          className="command-panel p-4 sm:p-5 lg:sticky lg:top-32"
        >
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted">{ar ? "السعر" : "Price"}</p>
              <p className="mt-1 text-3xl font-black tracking-tight text-gradient-dawn">
                {formatCents(product.priceCents, locale)}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-muted">
                {formatEgpFromUsdCents(product.priceCents, locale)}
              </p>
            </div>
            <span className={inStock ? "badge-green" : "badge-red"}>
              {inStock ? t.card.instant : t.card.outOfStock}
            </span>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-edge bg-raised/40 p-3">
            <span aria-hidden="true" className="text-base">{deliveryGuide.icon}</span>
            <div className="min-w-0">
              <p className="text-xs font-bold">{deliveryGuide.title}</p>
              <p className="mt-0.5 text-[0.72rem] leading-5 text-muted">{deliveryGuide.text}</p>
            </div>
          </div>

          <div className="mt-4">
            <AddToCart
              productId={product.id}
              stock={product.stock}
              inputType={product.inputType}
            />
          </div>

          <ul className="mt-4 space-y-2 border-t border-edge pt-4">
            {guarantees.map((item) => (
              <li key={item.text} className="flex items-center gap-2 text-xs text-muted">
                <span aria-hidden="true">{item.icon}</span>
                {item.text}
              </li>
            ))}
          </ul>

          <p className="mt-3 rounded-xl bg-amber-500/[.07] px-3 py-2 text-[0.68rem] leading-5 text-muted">
            {ar
              ? "معاينة فقط: مفيش دفع حقيقي ولا حجز مخزون."
              : "Preview only: no real payment and no stock reservation."}
          </p>
        </aside>
      </div>

      {/* Description + specification */}
      <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="surface p-5 sm:p-6">
          <h2 className="text-lg font-bold">{ar ? "تفاصيل المنتج" : "Product details"}</h2>
          <p className="mt-2 leading-relaxed text-muted">{locDesc(product, locale)}</p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              { term: ar ? "القسم" : "Category", value: categoryLabel },
              { term: ar ? "طريقة التسليم" : "Delivery", value: t.card.instant },
              { term: ar ? "نوع البيانات" : "Required details", value: deliveryGuide.title },
              { term: ar ? "المتجر" : "Store", value: product.sellerId ? t.card.verifiedSeller : t.card.officialStore },
            ].map((spec) => (
              <div key={spec.term} className="rounded-xl border border-edge bg-raised/40 px-3.5 py-3">
                <dt className="text-[0.68rem] font-semibold uppercase text-muted">{spec.term}</dt>
                <dd className="mt-1 text-sm font-semibold">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="surface p-5">
          <h2 className="text-sm font-bold">{t.trust.label}</h2>
          <ul className="mt-3 space-y-3">
            {[
              { icon: "🔐", title: t.trust.vaultTitle, text: t.trust.vaultText },
              { icon: "⚖️", title: t.trust.escrowTitle, text: t.trust.escrowText },
            ].map((item) => (
              <li key={item.title} className="flex items-start gap-2.5">
                <span aria-hidden="true" className="text-base">{item.icon}</span>
                <div>
                  <p className="text-xs font-bold">{item.title}</p>
                  <p className="mt-0.5 text-[0.72rem] leading-5 text-muted">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[0.7rem] leading-5 text-muted">✓ {t.product.officialNote}</p>
        </div>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-12">
          <div className="mb-5">
            <p className="eyebrow">{ar ? "اكتشف المزيد" : "KEEP EXPLORING"}</p>
            <h2 className="title-luxe mt-2 text-2xl">
              {fill(t.product.moreIn, { category: categoryLabel })}
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
            {related.map((p, index) => (
              <Reveal key={p.id} delay={index * 60} className="h-full">
                <ProductCard product={p} locale={locale} />
              </Reveal>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
