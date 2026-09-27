import type { Metadata } from "next";
import { Suspense } from "react";
import { getCategories, getFilteredProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { ProductFilters } from "@/components/product-filters";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Products",
  description: "Browse the full WebStor catalog — electronics, security gear, fashion, gaming and more.",
};

type SearchParams = Promise<{
  q?: string | string[];
  category?: string | string[];
  sort?: string | string[];
}>;

export default async function ProductsPage(props: {
  searchParams: SearchParams;
}) {
  const searchParams = await props.searchParams;
  const [{ rows, applied }, categories] = await Promise.all([
    getFilteredProducts(searchParams),
    getCategories(),
  ]);

  const activeCategory = categories.find((c) => c.slug === applied.category);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          {activeCategory ? (
            <>
              {activeCategory.icon} {activeCategory.name}
            </>
          ) : (
            <>
              All <span className="text-primary">Products</span>
            </>
          )}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {rows.length} {rows.length === 1 ? "product" : "products"}
          {applied.q && (
            <>
              {" "}matching <span className="text-foreground font-medium">“{applied.q}”</span>
            </>
          )}
        </p>
      </div>

      <Suspense>
        <ProductFilters
          categories={categories.map((c) => ({
            slug: c.slug,
            name: c.name,
            icon: c.icon,
          }))}
          applied={applied}
        />
      </Suspense>

      {rows.length === 0 ? (
        <div className="glass-card mt-8 p-12 text-center">
          <p className="text-4xl" aria-hidden>🔍</p>
          <h2 className="mt-4 text-lg font-semibold">No products found</h2>
          <p className="mt-1 text-sm text-muted">
            Try a different search term or clear the filters.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map(({ product, categoryName }) => (
            <ProductCard
              key={product.id}
              product={product}
              categoryName={categoryName}
            />
          ))}
        </div>
      )}
    </div>
  );
}
