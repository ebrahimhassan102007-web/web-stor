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
      <div className="relative isolate flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br from-[#171827] via-[#20223b] to-[#101018] text-white">
        <div aria-hidden className="absolute -end-8 -top-12 h-48 w-48 rounded-full bg-rose-500/20 blur-3xl" />
        <div aria-hidden className="absolute -bottom-16 -start-8 h-44 w-44 rounded-full bg-violet-500/25 blur-3xl" />
        {product.featured && <span className="badge-red absolute start-4 top-4 z-10 text-xs">{t.product.featured}</span>}
        <div className="relative z-10 flex flex-col items-center gap-2 text-center">
          <span className="grid h-20 w-20 place-items-center rounded-[1.6rem] border border-white/15 bg-white/10 text-5xl shadow-2xl backdrop-blur">
            {product.slug.startsWith("pubg") ? "🪂" : product.slug.startsWith("free-fire") ? "🔥" : product.slug.startsWith("chatgpt") ? "✳" : product.slug.startsWith("gemini") ? "✦" : product.slug.startsWith("claude") ? "✺" : product.icon}
          </span>
          <span className="text-sm font-black tracking-[0.2em] text-white/90">
            {product.slug.startsWith("pubg") ? "PUBG MOBILE" : product.slug.startsWith("free-fire") ? "FREE FIRE" : product.slug.startsWith("chatgpt") ? "CHATGPT PRO" : product.slug.startsWith("gemini") ? "GEMINI PRO" : product.slug.startsWith("claude") ? "CLAUDE PRO" : "E‑VORA"}
          </span>
          <span className="text-[10px] font-medium tracking-widest text-white/55">{product.slug.startsWith("pubg") || product.slug.startsWith("free-fire") ? "GAME TOP-UP" : "DIGITAL SERVICE"}</span>
        </div>
        <span aria-hidden className="absolute bottom-4 end-4 z-10 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 font-mono text-[9px] font-semibold tracking-[0.18em] text-white/60 backdrop-blur">E‑VORA</span>
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
