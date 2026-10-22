"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCart } from "./cart-provider";
import { useI18n } from "./locale-provider";
import { LanguageToggle, ThemeToggle } from "./preference-toggles";
import { fill, type Theme } from "@/lib/i18n/dictionary";

export function Header({ initialTheme }: { initialTheme: Theme }) {
  const pathname = usePathname();
  const { count } = useCart();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const NAV = [
    { href: "/", label: t.nav.home },
    { href: "/products", label: t.nav.products },
    { href: "/cart", label: t.nav.cart },
    { href: "/account", label: t.nav.account },
  ];

  return (
    <header className="sticky top-0 z-50 glass border-x-0 border-t-0">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* Brand */}
        <Link href="/" aria-label={`${t.nav.home} — E-Vora`} className="flex items-center gap-2.5 group shrink-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dim text-white text-lg font-black shadow-[0_4px_16px_rgba(239,68,68,0.35)] group-hover:shadow-[0_4px_22px_rgba(239,68,68,0.55)] transition-shadow">
            E
          </span>
          <span className="text-lg font-extrabold tracking-tight">
            E<span className="text-primary">-Vora</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "text-primary bg-primary/10"
                    : "text-muted hover:text-foreground hover:bg-hover"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden lg:inline-flex badge-green">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            {t.nav.secure}
          </span>

          <LanguageToggle />
          <ThemeToggle initialTheme={initialTheme} />

          {/* Cart */}
          <Link
            href="/cart"
            aria-label={fill(t.nav.cartAria, { count })}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-edge bg-raised/60 hover:border-primary/40 transition-colors"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
              />
            </svg>
            {count > 0 && (
              <span className="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>

          {/* Mobile menu toggle */}
          <button
            type="button"
            aria-label={t.nav.menuToggle}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="md:hidden flex h-10 w-10 items-center justify-center rounded-lg border border-edge bg-raised/60"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              {open ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {open && (
        <nav className="md:hidden border-t border-edge px-4 py-3 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:bg-hover"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
