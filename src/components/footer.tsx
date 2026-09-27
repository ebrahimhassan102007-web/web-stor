import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-edge bg-base/80">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30 text-primary font-bold text-sm">
                W
              </span>
              <span className="font-bold">
                Web<span className="text-primary">Stor</span>
              </span>
            </div>
            <p className="mt-4 text-sm text-muted leading-relaxed">
              A hardened marketplace for people who take their tech — and
              their privacy — seriously.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Shop</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li><Link href="/products" className="hover:text-primary transition-colors">All Products</Link></li>
              <li><Link href="/products?category=electronics" className="hover:text-primary transition-colors">Electronics</Link></li>
              <li><Link href="/products?category=security" className="hover:text-primary transition-colors">Security Gear</Link></li>
              <li><Link href="/products?sort=rating" className="hover:text-primary transition-colors">Top Rated</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Trust</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li className="flex items-center gap-2">
                <span className="text-success">✓</span> TLS-encrypted checkout
              </li>
              <li className="flex items-center gap-2">
                <span className="text-success">✓</span> HttpOnly signed sessions
              </li>
              <li className="flex items-center gap-2">
                <span className="text-success">✓</span> Strict input validation
              </li>
              <li className="flex items-center gap-2">
                <span className="text-success">✓</span> Zero third-party trackers
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Status</h3>
            <div className="mt-4 space-y-3">
              <span className="badge-green">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                All systems operational
              </span>
              <p className="text-xs text-muted font-mono">
                AES-256 · FIDO2 · SameSite=Lax
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-edge pt-6 sm:flex-row">
          <p className="text-xs text-muted">
            © {new Date().getFullYear()} WebStor. Demo storefront — no real
            payments are processed.
          </p>
          <p className="text-xs text-muted font-mono">built secure by design</p>
        </div>
      </div>
    </footer>
  );
}
