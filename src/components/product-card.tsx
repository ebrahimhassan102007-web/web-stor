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

  return (
    <Link href={`/products/${product.slug}`}
      className="glass-card card-glow-red group flex h-full flex-col overflow-hidden transition-transform duration-300 hover:-translate-y-1">
      <div className="product-art relative isolate flex aspect-[4/3] items-center justify-center text-6xl">
        {product.featured && <span className="badge-red absolute start-4 top-4 z-10 text-xs">{t.product.featured}</span>}
        <span aria-hidden className="product-art-mark">{product.icon}</span>
        <span aria-hidden className="absolute bottom-4 end-4 z-10 rounded-full border border-edge/80 bg-base/60 px-2.5 py-1 font-mono text-[9px] font-semibold tracking-[0.18em] text-muted backdrop-blur">E-VORA</span>
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
