import Link from "next/link";
import type { Product } from "@/lib/db/schema";
import { formatCents, discountPercent } from "@/lib/money";

export const TYPE_LABELS: Record<string, string> = {
  DIGITAL_CODE: "كود رقمي",
  SUBSCRIPTION: "اشتراك",
  GAME_TOPUP: "شحن لعبة",
  MOBILE_RECHARGE: "شحن رصيد",
  DIGITAL_SERVICE: "خدمة رقمية",
};

export function ProductCard({
  product,
  categoryNameAr,
}: {
  product: Product;
  categoryNameAr?: string;
}) {
  const inStock = product.stock > 0;
  const low = inStock && product.stock <= 5;
  const discount = discountPercent(product.priceCents, product.originalPriceCents);

  return (
    <Link
      href={`/products/${product.slug}`}
      className="glass-card card-glow-red group flex flex-col overflow-hidden"
    >
      <div className="product-art relative aspect-[4/3] text-6xl transition-transform duration-300 group-hover:scale-[1.03]">
        <span aria-hidden>{product.icon}</span>
        {discount && (
          <span className="absolute top-3 right-3 badge-red">خصم {discount}٪</span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="badge-neutral">
            {categoryNameAr ?? TYPE_LABELS[product.type] ?? ""}
          </span>
          {inStock ? (
            <span className="badge-green">
              {low ? `متبقي ${product.stock} فقط` : "متوفر"}
            </span>
          ) : (
            <span className="badge-red">غير متوفر</span>
          )}
        </div>

        <h3 className="font-bold leading-snug group-hover:text-primary transition-colors">
          {product.nameAr}
        </h3>

        {product.shortDescription && (
          <p className="text-xs text-muted leading-relaxed line-clamp-2">
            {product.shortDescription}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="flex items-baseline gap-2">
            <span className="text-lg font-extrabold">
              {formatCents(product.priceCents)}
            </span>
            {product.originalPriceCents && (
              <span className="text-xs text-muted line-through">
                {formatCents(product.originalPriceCents)}
              </span>
            )}
          </span>
          <span className="text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
            → التفاصيل
          </span>
        </div>
      </div>
    </Link>
  );
}
