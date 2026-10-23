import Link from "next/link";
import type { Product } from "@/lib/db/schema";
import { formatCents, formatEgpFromUsdCents } from "@/lib/money";
import {
  dictionaries,
  locDesc,
  locName,
  type Locale,
} from "@/lib/i18n/dictionary";

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
    <Link href={`/products/${product.slug}`}
      className="glass-card card-glow-red group flex h-full flex-col overflow-hidden transition-transform duration-300 hover:-translate-y-1">
      <div
        className="product-art relative isolate flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br from-[#171827] via-[#20223b] to-[#101018] bg-cover bg-center text-white"
        style={artwork ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.04), rgba(0,0,0,.16)), url('${artwork}')` } : undefined}
      >
        {product.featured && <span className="badge-red absolute start-4 top-4 z-10 text-xs">{t.product.featured}</span>}
        {!artwork && <span aria-hidden className="product-art-mark text-6xl">{product.icon}</span>}
        <span aria-hidden className="absolute bottom-4 end-4 z-10 rounded-full border border-white/15 bg-black/35 px-2.5 py-1 font-mono text-[9px] font-semibold tracking-[0.18em] text-white/80 backdrop-blur">E‑VORA</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex min-h-6 items-center justify-between gap-2">
          {categoryName ? <span className="badge-neutral max-w-[58%] truncate">{categoryName}</span> : <span aria-hidden className="h-6" />}
          <span className="badge-neutral shrink-0">{t.card.previewOnly}</span>
        </div>
        <h3 className="line-clamp-2 min-h-[3rem] font-semibold leading-snug transition-colors group-hover:text-primary">{locName(product, locale)}</h3>
        <p className="line-clamp-2 min-h-[2.75rem] text-sm leading-relaxed text-muted">{locDesc(product, locale)}</p>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-edge pt-4">
          <span className="flex flex-col"><strong className="text-lg font-extrabold tabular-nums">{formatCents(product.priceCents, locale)}</strong><small className="mt-0.5 text-xs font-medium text-muted tabular-nums">{formatEgpFromUsdCents(product.priceCents, locale)}</small></span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors group-hover:text-foreground">
            {t.card.viewDetails}<span aria-hidden className="inline-block rtl:-scale-x-100">→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
