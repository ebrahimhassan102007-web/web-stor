"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "./store-provider";

const NAV = [
  { href: "/", label: "الرئيسية" },
  { href: "/products", label: "الخدمات" },
  { href: "/cart", label: "السلة" },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { cartCount, user, refreshUser, refreshCart } = useStore();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setMenuOpen(false);
    await Promise.all([refreshUser(), refreshCart()]);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 glass border-x-0 border-t-0">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 border border-primary/30 text-primary font-extrabold group-hover:shadow-[0_0_16px_rgba(239,68,68,0.4)] transition-shadow">
            خ
          </span>
          <span className="text-lg font-extrabold tracking-tight">
            خدمتك <span className="text-primary">ستور</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="التنقل الرئيسي" className="hidden md:flex items-center gap-1">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? "text-primary bg-primary/10"
                    : "text-muted hover:text-foreground hover:bg-white/5"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {user?.role === "admin" && (
            <Link
              href="/admin"
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                pathname.startsWith("/admin")
                  ? "text-primary bg-primary/10"
                  : "text-muted hover:text-foreground hover:bg-white/5"
              }`}
            >
              لوحة التحكم
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Cart */}
          <Link
            href="/cart"
            aria-label={`السلة، ${cartCount} عنصر`}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-edge bg-raised/60 hover:border-primary/40 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
            {cartCount > 0 && (
              <span className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>

          {/* Auth */}
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex h-10 items-center gap-2 rounded-lg border border-edge bg-raised/60 px-3 text-sm font-semibold hover:border-success/40 transition-colors"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success text-xs font-bold">
                  {user.name.charAt(0)}
                </span>
                <span className="hidden sm:inline max-w-24 truncate">{user.name}</span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 mt-2 w-48 glass-card p-1.5 text-sm shadow-xl"
                >
                  <Link
                    role="menuitem"
                    href="/account"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-3 py-2 hover:bg-white/5"
                  >
                    حسابي وطلباتي
                  </Link>
                  {user.role === "admin" && (
                    <Link
                      role="menuitem"
                      href="/admin"
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-lg px-3 py-2 hover:bg-white/5"
                    >
                      لوحة التحكم
                    </Link>
                  )}
                  <button
                    role="menuitem"
                    type="button"
                    onClick={logout}
                    className="block w-full rounded-lg px-3 py-2 text-right text-primary hover:bg-primary/10"
                  >
                    تسجيل الخروج
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" className="btn-ghost h-10 px-4 text-sm">
              تسجيل الدخول
            </Link>
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            aria-label="القائمة"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="md:hidden flex h-10 w-10 items-center justify-center rounded-lg border border-edge bg-raised/60"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {open && (
        <nav aria-label="قائمة الجوال" className="md:hidden border-t border-edge px-4 py-3 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-4 py-2.5 text-sm font-semibold text-muted hover:text-foreground hover:bg-white/5"
            >
              {item.label}
            </Link>
          ))}
          {user?.role === "admin" && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-4 py-2.5 text-sm font-semibold text-muted hover:text-foreground hover:bg-white/5"
            >
              لوحة التحكم
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
