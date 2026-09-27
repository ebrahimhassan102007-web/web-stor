"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

type CategoryOption = { slug: string; nameAr: string; icon: string };

export function ProductFilters({
  categories,
  applied,
}: {
  categories: CategoryOption[];
  applied: { q: string; category: string; sort: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(applied.q);
  const [, startTransition] = useTransition();

  function pushParams(update: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(update)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page"); // filters reset pagination
    startTransition(() => {
      router.replace(`/products?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="glass-card p-4 sm:p-5 space-y-4">
      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            pushParams({ q: q.trim().slice(0, 100) });
          }}
        >
          <label htmlFor="product-search" className="sr-only">
            ابحث عن خدمة
          </label>
          <input
            id="product-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث عن خدمة…"
            maxLength={100}
            className="input-dark pl-24"
          />
          <button
            type="submit"
            className="absolute left-1.5 top-1/2 -translate-y-1/2 btn-primary px-4 py-1.5 text-sm"
          >
            بحث
          </button>
        </form>

        <label htmlFor="product-sort" className="sr-only">
          ترتيب النتائج
        </label>
        <select
          id="product-sort"
          value={applied.sort}
          onChange={(e) => pushParams({ sort: e.target.value })}
          className="input-dark sm:w-52 cursor-pointer"
        >
          <option value="featured">المميزة أولاً</option>
          <option value="newest">الأحدث</option>
          <option value="price-asc">السعر: من الأقل</option>
          <option value="price-desc">السعر: من الأعلى</option>
        </select>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => pushParams({ category: "" })}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors ${
            !applied.category
              ? "border-primary/50 bg-primary/15 text-primary"
              : "border-edge bg-raised/60 text-muted hover:text-foreground hover:border-white/20"
          }`}
        >
          الكل
        </button>
        {categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() =>
              pushParams({ category: applied.category === c.slug ? "" : c.slug })
            }
            className={`rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors ${
              applied.category === c.slug
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-edge bg-raised/60 text-muted hover:text-foreground hover:border-white/20"
            }`}
          >
            <span aria-hidden className="ml-1.5">{c.icon}</span>
            {c.nameAr}
          </button>
        ))}
      </div>
    </div>
  );
}
