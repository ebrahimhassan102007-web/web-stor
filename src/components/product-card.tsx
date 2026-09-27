import Link from "next/link";
import type { Product } from "@/lib/db/schema";
import { formatCents } from "@/lib/money";
import { Stars } from "./stars";

export function ProductCard({
  product,
  categoryName,
}: {
  product: Product;
  categoryName?: string;
}) {
  const inStock = product.stock > 0;
  const low = inStock && product.stock <= 10;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="glass-card card-glow-red group flex flex-col overflow-hidden"
    >
      <div className="product-art aspect-[4/3] text-6xl transition-transform duration-300 group-hover:scale-[1.03]">
        <span aria-hidden>{product.icon}</span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          {categoryName ? (
            <span className="badge-neutral">{categoryName}</span>
          ) : (
            <span />
          )}
          {inStock ? (
            <span className="badge-green">
              {low ? `Only ${product.stock} left` : "In Stock"}
            </span>
          ) : (
            <span className="badge-red">Out of Stock</span>
          )}
        </div>

        <h3 className="font-semibold leading-snug group-hover:text-primary transition-colors">
          {product.name}
        </h3>

        <Stars rating={Number(product.rating)} count={product.reviewCount} />

        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-lg font-bold">
            {formatCents(product.priceCents)}
          </span>
          <span className="text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            View details →
          </span>
        </div>
      </div>
    </Link>
  );
}
