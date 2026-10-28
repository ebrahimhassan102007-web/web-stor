import Link from "next/link";
import { getCategories } from "@/lib/catalog";
import { getI18n } from "@/lib/i18n/server";
import { fill, locName } from "@/lib/i18n/dictionary";
import { staticPages } from "@/lib/i18n/static-pages";

export async function Footer() {
  const [{ locale, t }, categories] = await Promise.all([
    getI18n(),
    getCategories().catch(() => []),
  ]);
  const links = staticPages[locale].footerLinks;

  return (
    <footer className="relative mt-20 border-t border-edge bg-gradient-to-b from-transparent to-base/70">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-champagne/30 to-transparent" />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-dim text-sm font-black text-white shadow-[0_8px_18px_-12px_rgba(239,68,68,0.9)] ring-1 ring-inset ring-white/20">
                E
              </span>
              <span className="font-extrabold">
                E<span className="text-primary">-Vora</span>
              </span>
            </div>
            <p className="mt-4 text-sm text-muted leading-relaxed">
              {t.footer.tagline}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">{t.footer.shop}</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li>
                <Link href="/products" className="hover:text-primary transition-colors">
                  {t.footer.allProducts}
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/products?category=${encodeURIComponent(c.slug)}`}
                    className="hover:text-primary transition-colors"
                  >
                    {c.icon} {locName(c, locale)}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/products?sort=rating" className="hover:text-primary transition-colors">
                  {t.footer.topRated}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">{links.heading}</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li><Link href="/about" className="transition-colors duration-200 hover:text-champagne">{links.about}</Link></li>
              <li><Link href="/faq" className="transition-colors duration-200 hover:text-champagne">{links.faq}</Link></li>
              <li><Link href="/contact" className="transition-colors duration-200 hover:text-champagne">{links.contact}</Link></li>
              <li><Link href="/policies/privacy" className="transition-colors duration-200 hover:text-champagne">{links.privacy}</Link></li>
              <li><Link href="/policies/terms" className="transition-colors duration-200 hover:text-champagne">{links.terms}</Link></li>
              <li><Link href="/policies/delivery-refunds" className="transition-colors duration-200 hover:text-champagne">{links.deliveryRefunds}</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">{t.footer.trust}</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              {t.footer.trustItems.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="text-success">✓</span> {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">{t.footer.status}</h3>
            <div className="mt-4 space-y-3">
              <span className="badge-green">
                <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_2px_color-mix(in_srgb,var(--accent-green)_35%,transparent)]" />
                {t.footer.operational}
              </span>
              <p className="text-xs text-muted font-mono">{t.footer.statusMono}</p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-edge pt-6 sm:flex-row">
          <p className="text-xs text-muted">
            {fill(t.footer.copyright, { year: new Date().getFullYear() })}
          </p>
          <p className="text-xs text-muted font-mono">{t.footer.builtNote}</p>
        </div>
      </div>
    </footer>
  );
}
