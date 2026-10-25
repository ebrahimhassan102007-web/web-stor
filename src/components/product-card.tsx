import Link from "next/link";
import type { CSSProperties } from "react";
import type { Product } from "@/lib/db/schema";
import { formatCents, formatEgpFromUsdCents } from "@/lib/money";
import { dictionaries, locDesc, locName, type Locale } from "@/lib/i18n/dictionary";
import { ProductArtwork } from "./product-artwork";

export function ProductCard({
  product,
  locale,
  categoryName,
  animationIndex = 0,
}: {
  product: Product;
  locale: Locale;
  categoryName?: string;
  animationIndex?: number;
}) {
  const t = dictionaries[locale];
  const animationStyle = {
    "--product-card-delay": `${Math.min(animationIndex, 10) * 45}ms`,
  } as CSSProperties;

  return (
    <Link href={`/products/${product.slug}`} className="product-card group" style={animationStyle}>
      <ProductArtwork product={product} featuredLabel={t.product.featured} />
      <div className="product-card-body">
        {categoryName && <span className="product-card-category">{categoryName}</span>}
        <h2 className="product-card-title">{locName(product, locale)}</h2>
        <p className="product-card-description">{locDesc(product, locale)}</p>
        <div className="product-card-footer">
          <span className="product-card-price">
            <strong>{formatCents(product.priceCents, locale)}</strong>
            <small>{formatEgpFromUsdCents(product.priceCents, locale)}</small>
          </span>
          <span className="product-card-action">
            {t.card.viewDetails}
            <span aria-hidden="true" className="product-card-arrow">→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
