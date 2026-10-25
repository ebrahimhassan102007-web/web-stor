"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "./locale-provider";

type CategoryOption = { slug: string; name: string };

export function ProductFilters({
  categories,
  applied,
}: {
  categories: CategoryOption[];
  applied: { q: string; category: string; sort: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useI18n();
  const [q, setQ] = useState(applied.q);
  const [isPending, startTransition] = useTransition();

  function pushParams(update: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(update)) {
      if (v && !(k === "sort" && v === "newest")) next.set(k, v);
      else next.delete(k);
    }
    startTransition(() => {
      router.replace(`/products?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div className={`catalog-filter-card glass-card p-4 sm:p-5 space-y-4 ${isPending ? "is-pending" : ""}`} aria-busy={isPending}>
      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            pushParams({ q: q.trim().slice(0, 100) });
          }}
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.filters.searchPlaceholder}
            maxLength={100}
            className="input-dark pe-24"
            aria-label={t.filters.searchAria}
          />
          <button
            type="submit"
            className="absolute end-1.5 top-1/2 -translate-y-1/2 btn-primary px-4 py-1.5 text-sm"
          >
            {t.filters.search}
          </button>
        </form>

        <select
          value={applied.sort}
          onChange={(e) => pushParams({ sort: e.target.value })}
          aria-label={t.filters.sortAria}
          className="input-dark sm:w-56 cursor-pointer"
        >
          <option value="newest">{t.filters.newest}</option>
          <option value="price-asc">{t.filters.priceAsc}</option>
          <option value="price-desc">{t.filters.priceDesc}</option>
          <option value="rating">{t.filters.rating}</option>
        </select>
        {(applied.q || applied.category || applied.sort !== "newest") && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              pushParams({ q: "", category: "", sort: "newest" });
            }}
            className="btn-ghost min-h-11 w-full px-4 text-sm sm:w-auto"
          >
            {t.filters.clear}
          </button>
        )}
      </div>
      <p className="catalog-filter-status" role="status" aria-live="polite">{isPending ? t.filters.updating : ""}</p>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={!applied.category}
          onClick={() => pushParams({ category: "" })}
          className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
            !applied.category
              ? "border-primary/50 bg-primary/15 text-primary"
              : "border-edge bg-raised/60 text-muted hover:text-foreground hover:border-strong"
          }`}
        >
          {t.filters.all}
        </button>
        {categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            aria-pressed={applied.category === c.slug}
            onClick={() =>
              pushParams({ category: applied.category === c.slug ? "" : c.slug })
            }
            className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
              applied.category === c.slug
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-edge bg-raised/60 text-muted hover:text-foreground hover:border-strong"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
