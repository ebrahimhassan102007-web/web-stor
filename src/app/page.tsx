import Link from "next/link";
import {
  getVisibleCategoriesWithCounts,
  getFeaturedProducts,
} from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";

export const dynamic = "force-dynamic";

const TRUST_BADGES = [
  {
    icon: "⚡",
    title: "تسليم فوري",
    text: "الأكواد الرقمية تصلك في حسابك فور تأكيد الدفع مباشرة.",
  },
  {
    icon: "🔒",
    title: "دفع آمن",
    text: "جلسات مشفّرة وتحقق صارم من كل عملية قبل التنفيذ.",
  },
  {
    icon: "✅",
    title: "منتجات أصلية",
    text: "اشتراكات وبطاقات مرخّصة من مصادر معتمدة فقط.",
  },
  {
    icon: "🎧",
    title: "دعم سريع",
    text: "فريق دعم يتابع طلبك من لحظة الشراء حتى التسليم.",
  },
];

export default async function HomePage() {
  const [categories, featured] = await Promise.all([
    getVisibleCategoriesWithCounts(),
    getFeaturedProducts(8),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      {/* Hero */}
      <section className="relative py-16 sm:py-24 text-center">
        <div className="mx-auto max-w-3xl">
          <span className="badge-green mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            متجر رقمي موثوق
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl leading-[1.15]">
            كل خدماتك الرقمية
            <span className="block text-primary">في مكان واحد.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base sm:text-lg text-muted leading-relaxed">
            اشتراكات رقمية، شحن ألعاب، شحن رصيد، وبطاقات هدايا أصلية —
            بتسليم آمن وسريع داخل حسابك.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/products" className="btn-primary w-full sm:w-auto px-8 py-3 text-base">
              تصفح الخدمات
            </Link>
            <Link href="#categories" className="btn-ghost w-full sm:w-auto px-8 py-3 text-base">
              تصفح الأقسام
            </Link>
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section aria-label="لماذا خدمتك ستور" className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_BADGES.map((b) => (
          <div key={b.title} className="glass-card card-glow-green p-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>{b.icon}</span>
              <h2 className="font-bold">{b.title}</h2>
            </div>
            <p className="mt-2 text-sm text-muted leading-relaxed">{b.text}</p>
          </div>
        ))}
      </section>

      {/* Categories */}
      <section id="categories" className="mt-20 scroll-mt-24">
        <h2 className="mb-8 text-2xl sm:text-3xl font-extrabold tracking-tight">
          تسوّق حسب <span className="text-success">القسم</span>
        </h2>
        <div className="grid gap-5 grid-cols-2 lg:grid-cols-5">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/products?category=${encodeURIComponent(c.slug)}`}
              className="glass-card card-glow-red group p-5 text-center"
            >
              <span className="text-4xl" aria-hidden>{c.icon}</span>
              <h3 className="mt-3 font-bold group-hover:text-primary transition-colors">
                {c.nameAr}
              </h3>
              <p className="mt-2 text-xs font-semibold text-muted">
                {c.productCount} منتج
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="mt-20">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              الأكثر <span className="text-primary">طلباً</span>
            </h2>
            <p className="mt-1 text-sm text-muted">
              خدمات مختارة بعناية، جاهزة للتسليم الفوري.
            </p>
          </div>
          <Link
            href="/products"
            className="hidden sm:block text-sm font-semibold text-primary hover:underline underline-offset-4"
          >
            ← عرض الكل
          </Link>
        </div>
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Security banner */}
      <section className="mt-20">
        <div className="glass-card overflow-hidden">
          <div className="relative px-6 py-10 sm:px-12 sm:py-14 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_16rem_at_50%_-20%,rgba(34,197,94,0.1),transparent_70%)]"
            />
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              بياناتك وأكوادك <span className="text-success">في أمان.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-muted leading-relaxed">
              كل كود رقمي مشفّر حتى لحظة تسليمه لك وحدك، وكل طلب يمر بتحقق
              كامل على الخادم — لا نطلب منك إلا ما تحتاجه الخدمة فعلاً.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="badge-neutral">تشفير AES-256 للأكواد</span>
              <span className="badge-neutral">جلسات HttpOnly موقّعة</span>
              <span className="badge-neutral">تحقق كامل من المدخلات</span>
              <span className="badge-neutral">دفع مُتحقق منه على الخادم</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
