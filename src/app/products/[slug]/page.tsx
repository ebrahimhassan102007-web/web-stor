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
import { ProductArtwork } from "@/components/product-artwork";
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

export default async function ProductDetailPage(props: { params: Params }) {
  const { slug } = await props.params;
  const [{ locale, t }, row] = await Promise.all([
    getI18n(),
    getProductBySlug(slug),
  ]);
  if (!row) notFound();

  const { product, categoryName, categoryNameAr, categorySlug } = row;
  const categoryLabel = locName(
    { name: categoryName, nameAr: categoryNameAr },
    locale,
  );
  const related = await getRelatedProducts(product.categoryId, product.id, 4);

  const inStock = product.stock > 0;

  return (
    <div className="store-page-enter mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
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
          <li aria-hidden>/</li>
          <li className="text-foreground font-medium">{locName(product, locale)}</li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Art */}
        <div className="glass-card overflow-hidden">
          <ProductArtwork product={product} featuredLabel={t.product.featured} variant="detail" />
        </div>

        {/* Info */}
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-neutral">{categoryLabel}</span>
            {inStock ? (
              <span className="badge-green">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {t.card.inStock}
              </span>
            ) : (
              <span className="badge-red">{t.card.outOfStock}</span>
            )}
            {product.featured && <span className="badge-red">{t.product.featured}</span>}
          </div>

          <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
            {locName(product, locale)}
          </h1>

          <p className="mt-5 text-muted leading-relaxed">
            {locDesc(product, locale)}
          </p>

          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <span className="flex flex-col">
              <strong className="text-4xl font-extrabold tracking-tight">{formatCents(product.priceCents, locale)}</strong>
              <small className="mt-1 text-base font-semibold text-muted">{formatEgpFromUsdCents(product.priceCents, locale)}</small>
            </span>
            <span className="badge-green">{t.product.instantDelivery}</span>
          </div>

          <div className="mt-8">
            <AddToCart
              productId={product.id}
              stock={product.stock}
              inputType={product.inputType}
            />
          </div>

          <div className="product-detail-points mt-8">
            <div><span>01</span><p>{t.product.tileSecure}</p></div>
            <div><span>02</span><p>{t.product.tileInstant}</p></div>
            <div><span>03</span><p>{t.product.tileOfficial}</p></div>
          </div>

          <p className="mt-4 text-center text-xs text-muted">
            ✓ {t.product.officialNote}
          </p>
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-6 text-2xl font-bold tracking-tight">
            {fill(t.product.moreIn, { category: categoryLabel })}
          </h2>
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p, index) => (
              <ProductCard key={p.id} product={p} locale={locale} animationIndex={index} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
