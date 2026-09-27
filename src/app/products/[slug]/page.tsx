import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySlug, getRelatedProducts } from "@/lib/catalog";
import { requiredFieldsFor } from "@/lib/product-fields";
import type { ProductType } from "@/lib/db/schema";
import { formatCents, discountPercent } from "@/lib/money";
import { AddToCart } from "@/components/add-to-cart";
import { ProductCard, TYPE_LABELS } from "@/components/product-card";
import { MAX_LINE_QTY } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata(props: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const row = await getProductBySlug(slug);
  if (!row) return { title: "المنتج غير موجود" };
  return {
    title: row.product.nameAr,
    description: (row.product.shortDescription || row.product.description).slice(0, 160),
  };
}

const DELIVERY_INFO: Record<string, string> = {
  DIGITAL_CODE: "يصلك الكود في صفحة طلباتك فور تأكيد الدفع.",
  SUBSCRIPTION: "يُفعَّل الاشتراك على حسابك خلال ساعات العمل بعد الدفع.",
  GAME_TOPUP: "يُشحن مباشرة على معرّف اللاعب فور تأكيد الدفع.",
  MOBILE_RECHARGE: "يصل الرصيد إلى رقمك فور تنفيذ العملية.",
  DIGITAL_SERVICE: "يتواصل معك فريقنا لبدء تنفيذ الخدمة بعد الدفع.",
};

export default async function ProductDetailPage(props: { params: Params }) {
  const { slug } = await props.params;
  const row = await getProductBySlug(slug);
  if (!row) notFound();

  const { product, categoryNameAr, categorySlug } = row;
  const related = await getRelatedProducts(product.categoryId, product.id, 4);
  const fields = requiredFieldsFor(product.type as ProductType);
  const discount = discountPercent(product.priceCents, product.originalPriceCents);

  const inStock = product.stock > 0;
  const low = inStock && product.stock <= 5;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* Breadcrumbs */}
      <nav aria-label="مسار التنقل" className="mb-6 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="hover:text-primary">الرئيسية</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/products" className="hover:text-primary">الخدمات</Link></li>
          <li aria-hidden>/</li>
          <li>
            <Link
              href={`/products?category=${encodeURIComponent(categorySlug)}`}
              className="hover:text-primary"
            >
              {categoryNameAr}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-foreground font-semibold">{product.nameAr}</li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Art */}
        <div className="glass-card overflow-hidden">
          <div className="product-art relative aspect-square text-[9rem] sm:text-[11rem]">
            <span aria-hidden>{product.icon}</span>
            {discount && (
              <span className="absolute top-5 right-5 badge-red text-sm">
                خصم {discount}٪
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-neutral">{categoryNameAr}</span>
            <span className="badge-neutral">{TYPE_LABELS[product.type]}</span>
            {inStock ? (
              <span className="badge-green">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {low ? `متبقي ${product.stock} فقط` : "متوفر"}
              </span>
            ) : (
              <span className="badge-red">غير متوفر حالياً</span>
            )}
            {product.featured && <span className="badge-red">★ مميز</span>}
          </div>

          <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
            {product.nameAr}
          </h1>
          {product.nameEn && (
            <p className="mt-1 text-sm text-muted" dir="ltr">
              {product.nameEn}
            </p>
          )}

          <p className="mt-5 text-muted leading-relaxed whitespace-pre-line">
            {product.description}
          </p>

          <div className="mt-6 flex items-baseline gap-3">
            <span className="text-4xl font-extrabold tracking-tight">
              {formatCents(product.priceCents)}
            </span>
            {product.originalPriceCents && (
              <span className="text-lg text-muted line-through">
                {formatCents(product.originalPriceCents)}
              </span>
            )}
          </div>

          <div className="mt-8">
            <AddToCart
              productId={product.id}
              stock={product.stock}
              fields={fields}
              maxQty={MAX_LINE_QTY}
            />
          </div>

          {/* Delivery info */}
          <div className="mt-8 glass-card p-5 space-y-3 text-sm">
            <h2 className="font-bold">📦 معلومات التسليم</h2>
            <p className="text-muted leading-relaxed">
              {DELIVERY_INFO[product.type]}
            </p>
            {product.deliveryNote && (
              <p className="text-muted leading-relaxed border-t border-edge pt-3">
                {product.deliveryNote}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-6 text-2xl font-extrabold tracking-tight">
            المزيد من <span className="text-primary">{categoryNameAr}</span>
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
