"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "./cart-provider";
import { useI18n } from "./locale-provider";
import { LanguageToggle, ThemeToggle } from "./preference-toggles";
import { fill, type Theme } from "@/lib/i18n/dictionary";

export function Header({ initialTheme }: { initialTheme: Theme }) {
  const pathname = usePathname();
  const { count } = useCart();
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const isArabic = locale === "ar";

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const navItems = [
    { href: "/", label: t.nav.home, icon: "⌂" },
    { href: "/products", label: t.nav.products, icon: "▦" },
    { href: "/products?category=game-topups", label: isArabic ? "شحن الألعاب" : "Game top-ups", icon: "⚡" },
    { href: "/products?category=gift-cards", label: isArabic ? "بطاقات الهدايا" : "Gift cards", icon: "▤" },
    { href: "/products?category=subscriptions", label: isArabic ? "الاشتراكات" : "Subscriptions", icon: "✦" },
    { href: "/products?category=software-keys", label: isArabic ? "مفاتيح البرامج والألعاب" : "Software & game keys", icon: "⌘" },
    { href: "/cart", label: t.nav.cart, icon: "🛒" },
    { href: "/account", label: t.nav.account, icon: "◉" },
  ];

  const closeLabel = isArabic ? "إغلاق القائمة" : "Close menu";
  const menuTitle = isArabic ? "تصفح E‑Vora" : "Explore E‑Vora";

  return (
    <header className="sticky top-0 z-50 border-b border-edge bg-base/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="E-Vora" className="group flex shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-lg font-black text-white transition-transform group-hover:scale-[1.03]">
            E
          </span>
          <span className="text-lg font-extrabold tracking-tight">
            E<span className="text-primary">-Vora</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/cart"
            aria-label={fill(t.nav.cartAria, { count })}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-edge bg-card transition-colors hover:border-primary/50 hover:text-primary"
          >
            <svg aria-hidden="true" className="h-[1.2rem] w-[1.2rem]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h1.6c.5 0 .94.34 1.07.82l.4 1.48M7.5 14.5h10.7c1.1-2.3 2.08-4.68 2.9-7.1A60 60 0 0 0 4.6 5.6M7.5 14.5 6.07 5.3M7.5 14.5l-.7 2.5h12M9 20a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm9.5 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
            {count > 0 && (
              <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>

          <button
            type="button"
            aria-label={t.nav.menuToggle}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen((value) => !value)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-edge bg-card transition-colors hover:border-primary/50 hover:text-primary"
          >
            <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              {open
                ? <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <>
          <button
            type="button"
            aria-label={closeLabel}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] cursor-default bg-black/60 backdrop-blur-[2px]"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={menuTitle}
            dir={isArabic ? "rtl" : "ltr"}
            className="fixed inset-y-0 end-0 z-[70] flex w-[min(88vw,24rem)] flex-col border-s border-edge bg-base shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-edge px-5 py-5">
              <div>
                <p className="text-lg font-bold">{menuTitle}</p>
                <p className="mt-1 text-xs text-muted">{isArabic ? "كل اللي تحتاجه، من غير زحمة." : "Everything you need, without the clutter."}</p>
              </div>
              <button type="button" aria-label={closeLabel} onClick={() => setOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge text-muted hover:text-foreground">
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <nav aria-label={menuTitle} className="flex-1 space-y-1 overflow-y-auto p-3">
              {navItems.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href.split("?")[0] + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-12 items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-hover"}`}
                  >
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-edge bg-card text-base">{item.icon}</span>
                    <span>{item.label}</span>
                    <span aria-hidden="true" className="ms-auto text-muted">{isArabic ? "‹" : "›"}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="space-y-4 border-t border-edge p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">{isArabic ? "اللغة" : "Language"}</span>
                <LanguageToggle />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">{isArabic ? "المظهر" : "Appearance"}</span>
                <ThemeToggle initialTheme={initialTheme} />
              </div>
            </div>
          </aside>
        </>
      )}
    </header>
  );
}
