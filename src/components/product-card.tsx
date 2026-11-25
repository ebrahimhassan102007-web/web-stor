import Link from "next/link";
import type { Product } from "@/lib/db/schema";
import { formatCents, formatEgpFromUsdCents } from "@/lib/money";
import { AddToCart } from "@/components/add-to-cart";
import {
  dictionaries,
  locDesc,
  locName,
  type Locale,
} from "@/lib/i18n/dictionary";

/**
 * Amazon-grade product tile (Wave 6).
 *
 * Information hierarchy, top to bottom: artwork → category + trust badge →
 * title → short description → price block + action. Everything is one
 * `<Link>` except the optional quick-add button, which lives in the footer so
 * no interactive element is ever nested inside an anchor (invalid HTML and a
 * real keyboard trap).
 *
 * The `lift` + `sheen-edge` utilities own the hover physics; both are pure
 * transform/opacity and both stand down under `prefers-reduced-motion`.
 *
 * No discount badge is rendered unless a genuine compare-at price exists on the
 * record: inventing "was $X" urgency on a catalogue-only storefront would be
 * dishonest, so the slot stays empty rather than fabricated.
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
  const ar = locale === "ar";
  const artwork = product.slug.startsWith("pubg")
    ? "/products/pubg.svg"
    : product.slug.startsWith("free-fire")
      ? "/products/free-fire.svg"
      : product.slug.startsWith("chatgpt")
        ? "/products/chatgpt.svg"
        : product.slug.startsWith("gemini")
          ? "/products/gemini.svg"
          : product.slug.startsWith("claude")
            ? "/products/claude.svg"
            : null;
  const hasLiveStock = product.stock > 0;

  return (
    <article className="glass-card lift sheen-edge group relative flex h-full flex-col overflow-hidden">
      <Link
        href={`/products/${product.slug}`}
        className="flex flex-1 flex-col focus-visible:outline-none"
        aria-label={`${locName(product, locale)} — ${t.card.viewDetails}`}
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

          {/* Trust ribbon: what makes this tile buyable at a glance. */}
          <span className="absolute bottom-3 start-3.5 z-10 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[0.62rem] font-bold text-white/85 backdrop-blur">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />
            {t.card.instant}
          </span>

          <span
            aria-hidden="true"
            className="absolute bottom-3 end-3.5 z-10 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 font-mono text-[9px] font-semibold text-white/85 backdrop-blur"
          >
            <span className="tracking-luxe">E-VORA</span>
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 p-4 sm:p-[1.15rem]">
          <div className="flex min-h-6 items-center justify-between gap-2">
            {categoryName ? (
              <span className="badge-neutral max-w-[52%] truncate">{categoryName}</span>
            ) : (
              <span aria-hidden="true" className="h-6" />
            )}
            <span className={`shrink-0 ${product.sellerId ? "badge-green" : "badge-champagne"}`}>
              {product.sellerId ? t.card.verifiedSeller : t.card.officialStore}
            </span>
          </div>

          <h3 className="line-clamp-2 min-h-[3rem] font-semibold leading-snug transition-colors duration-300 group-hover:text-champagne">
            {locName(product, locale)}
          </h3>
          <p className="line-clamp-2 min-h-[2.6rem] text-sm leading-relaxed text-muted">
            {locDesc(product, locale)}
          </p>

          <div className="mt-auto flex items-end justify-between gap-3 border-t border-edge pt-3.5">
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

      {/* Quick add — only for genuinely live stock, so a preview catalogue tile
          never offers an action that cannot succeed. */}
      {hasLiveStock && (
        <div className="border-t border-edge/70 px-4 pb-4 pt-3 sm:px-[1.15rem]">
          <AddToCart productId={product.id} stock={product.stock} inputType={product.inputType} compact />
          <p className="mt-1.5 text-[0.65rem] text-muted">
            <span aria-hidden="true">🔒</span> {t.card.vaultSealed} · {ar ? "تسليم داخل الحساب" : "delivered in your account"}
          </p>
        </div>
      )}
    </article>
  );
}
