import Link from "next/link";
import { getCategoriesWithCounts, getFeaturedProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";

export const dynamic = "force-dynamic";

const TRUST_BADGES = [
  {
    icon: "🔒",
    title: "Encrypted Checkout",
    text: "Every session runs over TLS with HttpOnly, signed cookies.",
  },
  {
    icon: "🛡️",
    title: "Hardened by Design",
    text: "Strict input validation and parameterized queries everywhere.",
  },
  {
    icon: "🚚",
    title: "Free Shipping $100+",
    text: "Fast, tracked delivery on every order over one hundred dollars.",
  },
  {
    icon: "↩️",
    title: "30-Day Returns",
    text: "Changed your mind? Send it back within thirty days.",
  },
];

export default async function HomePage() {
  const [categories, featured] = await Promise.all([
    getCategoriesWithCounts(),
    getFeaturedProducts(8),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      {/* Hero */}
      <section className="relative py-16 sm:py-24 text-center">
        <div className="mx-auto max-w-3xl">
          <span className="badge-green mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            Zero-trust storefront · v1.0
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl leading-[1.1]">
            Gear for people who
            <span className="block text-primary">trust no one.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base sm:text-lg text-muted leading-relaxed">
            Premium electronics, security hardware and techwear — sold through
            a checkout built like a vault. No trackers, no leaks, no nonsense.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/products" className="btn-primary w-full sm:w-auto px-8 py-3 text-base">
              Browse Products
            </Link>
            <Link
              href="/products?category=security"
              className="btn-ghost w-full sm:w-auto px-8 py-3 text-base"
            >
              🛡️ Security Gear
            </Link>
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section aria-label="Why shop with us" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_BADGES.map((b) => (
          <div key={b.title} className="glass-card card-glow-green p-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                {b.icon}
              </span>
              <h2 className="font-semibold">{b.title}</h2>
            </div>
            <p className="mt-2 text-sm text-muted leading-relaxed">{b.text}</p>
          </div>
        ))}
      </section>

      {/* Featured products */}
      <section className="mt-20">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Featured <span className="text-primary">Drops</span>
            </h2>
            <p className="mt-1 text-sm text-muted">
              Hand-picked, top-rated, ready to ship.
            </p>
          </div>
          <Link
            href="/products"
            className="hidden sm:block text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            View all →
          </Link>
        </div>
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Category grid */}
      <section className="mt-20">
        <h2 className="mb-8 text-2xl sm:text-3xl font-bold tracking-tight">
          Shop by <span className="text-success">Category</span>
        </h2>
        <div className="grid gap-5 grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/products?category=${encodeURIComponent(c.slug)}`}
              className="glass-card card-glow-red group p-5 sm:p-6"
            >
              <span className="text-3xl" aria-hidden>
                {c.icon}
              </span>
              <h3 className="mt-3 font-semibold group-hover:text-primary transition-colors">
                {c.name}
              </h3>
              <p className="mt-1 hidden sm:block text-sm text-muted leading-relaxed">
                {c.description}
              </p>
              <p className="mt-3 text-xs font-medium text-muted">
                {c.productCount} products
              </p>
            </Link>
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
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Your data stays <span className="text-success">yours.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-muted leading-relaxed">
              We validate every byte of input, sign every session, and never
              run third-party trackers. The same discipline we demand from the
              gear we sell.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
              <span className="badge-neutral">HttpOnly cookies</span>
              <span className="badge-neutral">SameSite=Lax</span>
              <span className="badge-neutral">HMAC-signed sessions</span>
              <span className="badge-neutral">Zod-validated inputs</span>
              <span className="badge-neutral">Parameterized SQL</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
