import Link from "next/link";
import type { Product } from "@/lib/db/schema";
import { formatCents, formatEgpFromUsdCents } from "@/lib/money";
import {
  dictionaries,
  locDesc,
  locName,
  type Locale,
} from "@/lib/i18n/dictionary";

/**
 * Product tile.
 *
 * Presentation only: the data, pricing format helpers and link target are
 * unchanged. The artwork layer (`.card-media-zoom`) is what scales on hover —
 * text never moves, so nothing reflows and no text is clipped.
 */
export function ProductCard({
  product,
  locale,
  categoryName,
}: {
  product: Product;
  locale: Locale;
  categoryName?: string;
}) {
  const t = dictionaries[locale];
  const artwork = product.slug.startsWith("pubg") ? "/products/pubg.svg" : product.slug.startsWith("free-fire") ? "/products/free-fire.svg" : product.slug.startsWith("chatgpt") ? "/products/chatgpt.svg" : product.slug.startsWith("gemini") ? "/products/gemini.svg" : product.slug.startsWith("claude") ? "/products/claude.svg" : null;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="glass-card lift group flex h-full flex-col overflow-hidden"
    >
      <div className="card-media relative isolate flex aspect-[4/3] items-center justify-center text-white">
        {artwork ? (
          <>
            <span
              aria-hidden="true"
              className="card-media-zoom"
              style={{ backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.32)), url('${artwork}')` }}
            />
            <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          </>
        ) : (
          <>
            <span aria-hidden="true" className="absolute inset-0 product-art" />
            <span aria-hidden="true" className="product-art-mark relative text-6xl">{product.icon}</span>
          </>
        )}

        {/* Light sweep on hover (decorative, pointer-events none). */}
        <span aria-hidden="true" className="sheen absolute inset-0" />

        {product.featured && (
          <span className="badge-champagne absolute start-3.5 top-3.5 z-10 text-[0.7rem] shadow-lg">
            {t.product.featured}
          </span>
        )}

        <span
          aria-hidden="true"
          className="absolute bottom-3.5 end-3.5 z-10 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 font-mono text-[9px] font-semibold text-white/85 backdrop-blur"
        >
          <span className="tracking-luxe">E-VORA</span>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-[1.15rem]">
        <div className="flex min-h-6 items-center justify-between gap-2">
          {categoryName ? (
            <span className="badge-neutral max-w-[58%] truncate">{categoryName}</span>
          ) : (
            <span aria-hidden="true" className="h-6" />
          )}
          <span className="badge-neutral shrink-0">{t.card.previewOnly}</span>
        </div>

        <h3 className="line-clamp-2 min-h-[3rem] font-semibold leading-snug transition-colors duration-300 group-hover:text-champagne">
          {locName(product, locale)}
        </h3>
        <p className="line-clamp-2 min-h-[2.75rem] text-sm leading-relaxed text-muted">
          {locDesc(product, locale)}
        </p>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-edge pt-4">
          <span className="flex flex-col">
            <strong className="text-lg font-extrabold tabular-nums">{formatCents(product.priceCents, locale)}</strong>
            <small className="mt-0.5 text-xs font-medium tabular-nums text-muted">{formatEgpFromUsdCents(product.priceCents, locale)}</small>
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors duration-300 group-hover:text-foreground">
            {t.card.viewDetails}
            <span aria-hidden="true" className="inline-block transition-transform duration-300 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5">→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
