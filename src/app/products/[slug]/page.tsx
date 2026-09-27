import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProductBySlug,
  getRelatedProducts,
} from "@/lib/catalog";
import { formatCents } from "@/lib/money";
import { Stars } from "@/components/stars";
import { AddToCart } from "@/components/add-to-cart";
import { ProductCard } from "@/components/product-card";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata(props: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const row = await getProductBySlug(slug);
  if (!row) return { title: "Product not found" };
  return {
    title: row.product.name,
    description: row.product.description.slice(0, 160),
  };
}

export default async function ProductDetailPage(props: { params: Params }) {
  const { slug } = await props.params;
  const row = await getProductBySlug(slug);
  if (!row) notFound();

  const { product, categoryName, categorySlug } = row;
  const related = await getRelatedProducts(product.categoryId, product.id, 4);

  const inStock = product.stock > 0;
  const low = inStock && product.stock <= 10;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="hover:text-primary">Home</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/products" className="hover:text-primary">Products</Link></li>
          <li aria-hidden>/</li>
          <li>
            <Link
              href={`/products?category=${encodeURIComponent(categorySlug)}`}
              className="hover:text-primary"
            >
              {categoryName}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-foreground font-medium">{product.name}</li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Art */}
        <div className="glass-card overflow-hidden">
          <div className="product-art aspect-square text-[9rem] sm:text-[11rem]">
            <span aria-hidden>{product.icon}</span>
          </div>
        </div>

        {/* Info */}
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-neutral">{categoryName}</span>
            {inStock ? (
              <span className="badge-green">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {low ? `Low stock — only ${product.stock} left` : `In Stock (${product.stock})`}
              </span>
            ) : (
              <span className="badge-red">Out of Stock</span>
            )}
            {product.featured && <span className="badge-red">★ Featured</span>}
          </div>

          <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
            {product.name}
          </h1>

          <div className="mt-3">
            <Stars rating={Number(product.rating)} count={product.reviewCount} />
          </div>

          <p className="mt-5 text-muted leading-relaxed">
            {product.description}
          </p>

          <div className="mt-6 flex items-baseline gap-3">
            <span className="text-4xl font-extrabold tracking-tight">
              {formatCents(product.priceCents)}
            </span>
            {product.priceCents >= 10_000 && (
              <span className="badge-green">Free shipping</span>
            )}
          </div>

          <div className="mt-8">
            <AddToCart productId={product.id} stock={product.stock} />
          </div>

          <div className="mt-8 glass-card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center text-xs text-muted">
            <div>
              <p className="text-base" aria-hidden>🔒</p>
              <p className="mt-1 font-medium text-foreground">Secure checkout</p>
            </div>
            <div>
              <p className="text-base" aria-hidden>🚚</p>
              <p className="mt-1 font-medium text-foreground">Tracked delivery</p>
            </div>
            <div>
              <p className="text-base" aria-hidden>↩️</p>
              <p className="mt-1 font-medium text-foreground">30-day returns</p>
            </div>
          </div>
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-6 text-2xl font-bold tracking-tight">
            More in <span className="text-primary">{categoryName}</span>
          </h2>
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
