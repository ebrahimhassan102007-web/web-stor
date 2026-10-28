"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useCart } from "./cart-provider";
import { useI18n } from "./locale-provider";
import { LanguageToggle, ThemeToggle } from "./preference-toggles";
import { fill, type Theme } from "@/lib/i18n/dictionary";
import {
  formatDemoUsd,
  WALLET_LOGIN_PATH,
  WALLET_PATH,
} from "@/lib/wallet";

/**
 * Header + navigation drawer.
 *
 * P0-1 fix: the drawer/overlay are rendered through a portal to
 * `document.body`. They must NOT live inside the sticky <header>: its
 * `backdrop-blur-xl` (backdrop-filter) creates a containing block for
 * `position: fixed` descendants, which collapsed the full-viewport drawer
 * into the 68px header strip (menu "open" in state, invisible on screen).
 */
export function Header({ initialTheme }: { initialTheme: Theme }) {
  const pathname = usePathname();
  const { count } = useCart();
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  // True only on the client (portal target exists). SSR snapshot = false.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [signedIn, setSignedIn] = useState(false);
  // Compact/glassier header once the page is scrolled (CSS-only transition).
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);
  const isArabic = locale === "ar";

  // Wallet chip target depends on auth state (same source as wallet page).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { headers: { accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setSignedIn(Boolean(body?.data?.authenticated));
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const close = useCallback(() => setOpen(false), []);

  // Passive, rAF-throttled scroll flag; no layout reads while scrolling.
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      setScrolled(window.scrollY > 12);
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Close on route change (render-phase reset pattern).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) {
      // Restore focus to the toggle after having been open.
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        toggleRef.current?.focus();
      }
      return;
    }
    wasOpenRef.current = true;

    // Lock page scroll while the drawer is open (restored on close/unmount).
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    // Make the rest of the page inert while the modal drawer is open.
    const inertTargets = [
      document.querySelector("main"),
      document.querySelector("footer"),
    ].filter((el): el is HTMLElement => el instanceof HTMLElement);
    for (const el of inertTargets) {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    }

    // Move focus into the drawer (first link).
    const drawer = drawerRef.current;
    const firstLink = drawer?.querySelector<HTMLElement>("nav a");
    (firstLink ?? drawer)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      // Focus trap: keep Tab cycling inside the drawer.
      const focusables = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      root.style.overflow = previousOverflow;
      for (const el of inertTargets) {
        el.removeAttribute("inert");
        el.removeAttribute("aria-hidden");
      }
    };
  }, [open]);

  const navItems = [
    { href: "/", label: t.nav.home, icon: "⌂" },
    { href: "/products", label: t.nav.products, icon: "▦" },
    { href: "/offers", label: isArabic ? "العروض" : "Offers", icon: "🏷️" },
    { href: "/products?category=game-topups", label: isArabic ? "شحن الألعاب" : "Game top-ups", icon: "⚡" },
    { href: "/products?category=gift-cards", label: isArabic ? "بطاقات الهدايا" : "Gift cards", icon: "▤" },
    { href: "/products?category=subscriptions", label: isArabic ? "الاشتراكات" : "Subscriptions", icon: "✦" },
    { href: "/products?category=software-keys", label: isArabic ? "مفاتيح البرامج والألعاب" : "Software & game keys", icon: "⌘" },
    { href: "/cart", label: t.nav.cart, icon: "🛒" },
    { href: "/account", label: isArabic ? "لوحة التحكم" : "Dashboard", icon: "◉" },
    { href: "/account/wallet", label: isArabic ? "المحفظة والإيداع" : "Wallet & deposits", icon: "▣", addFunds: true },
    { href: "/account/orders", label: isArabic ? "طلباتي" : "My orders", icon: "▤" },
    { href: "/faq", label: isArabic ? "الأسئلة الشائعة" : "Help center", icon: "?" },
    { href: "/support-bot", label: isArabic ? "بوت الدعم" : "Support bot", icon: "🤖" },
    { href: "/contact", label: isArabic ? "تواصل معنا" : "Contact us", icon: "✉" },
    { href: "/about", label: isArabic ? "عن E‑Vora" : "About E‑Vora", icon: "ⓘ" },
  ] as const;

  const closeLabel = isArabic ? "إغلاق القائمة" : "Close menu";
  const menuTitle = isArabic ? "تصفح E‑Vora" : "Explore E‑Vora";
  const addFundsLabel = isArabic ? "إضافة رصيد" : "Add funds";
  const walletBalanceLabel = isArabic
    ? `رصيد المحفظة التجريبي ${formatDemoUsd()}`
    : `Demo wallet balance ${formatDemoUsd()}`;
  const addFundsHref = signedIn ? WALLET_PATH : WALLET_LOGIN_PATH;

  const drawer = open ? (
    <>
      <button
        type="button"
        aria-label={closeLabel}
        tabIndex={-1}
        data-testid="menu-overlay"
        onClick={close}
        className="fixed inset-0 z-[60] cursor-default bg-black/60 backdrop-blur-[2px]"
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={menuTitle}
        data-testid="nav-drawer"
        dir={isArabic ? "rtl" : "ltr"}
        className="drawer-panel fixed inset-y-0 end-0 z-[70] flex w-[min(88vw,24rem)] flex-col border-s border-edge shadow-[0_0_80px_-20px_rgba(0,0,0,0.9)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-edge px-5 py-5">
          <div>
            <p className="text-lg font-bold">{menuTitle}</p>
            <p className="mt-1 text-xs text-muted">{isArabic ? "كل اللي تحتاجه، من غير زحمة." : "Everything you need, without the clutter."}</p>
          </div>
          <button type="button" aria-label={closeLabel} onClick={close} className="btn-icon h-11 w-11 shrink-0 text-muted">
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <nav aria-label={menuTitle} className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href.split("?")[0] + "/");
            return (
              <div key={item.href} className="flex items-center gap-1">
                <Link
                  href={item.href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={`group flex min-h-12 flex-1 items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-medium transition-all duration-200 ${
                    active
                      ? "border-champagne/35 bg-champagne/[0.08] text-foreground"
                      : "border-transparent text-foreground hover:border-edge hover:bg-hover"
                  }`}
                >
                  <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-edge bg-card text-base transition-transform duration-200 group-hover:scale-105">{item.icon}</span>
                  <span>{item.label}</span>
                  <span aria-hidden="true" className="ms-auto text-muted">{isArabic ? "‹" : "›"}</span>
                </Link>
                {"addFunds" in item && item.addFunds ? (
                  <Link
                    href={addFundsHref}
                    onClick={close}
                    aria-label={addFundsLabel}
                    data-testid="drawer-add-funds"
                    className="btn-icon h-11 w-11 shrink-0 text-lg font-bold text-primary hover:text-primary"
                  >
                    <span aria-hidden="true">+</span>
                  </Link>
                ) : null}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  ) : null;

  return (
    <>
      <header
        data-scrolled={scrolled ? "true" : "false"}
        className="site-header sticky top-0 z-50 border-b border-edge/80 bg-base/60 backdrop-blur-2xl supports-[backdrop-filter]:bg-base/45"
      >
        <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between gap-1 px-3 sm:gap-4 sm:px-6">
          <Link href="/" aria-label="E-Vora" className="group flex shrink-0 items-center gap-2.5">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dim text-lg font-black text-white shadow-[0_10px_24px_-14px_rgba(239,68,68,0.9)] transition-transform duration-300 group-hover:scale-[1.04]">
              <span aria-hidden="true" className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" />
              E
            </span>
            <span className="hidden text-lg font-extrabold tracking-tight min-[420px]:inline">
              E<span className="text-primary">-Vora</span>
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <LanguageToggle />
            <ThemeToggle initialTheme={initialTheme} />

            {/* Wallet balance chip + add-funds "+" (P0-2). Amount is the same
                honest demo zero shown on the wallet page; signed-out visitors
                see only the "+" and are routed through login. */}
            <div className="flex items-center gap-1 sm:gap-1.5" data-testid="wallet-chip">
              {signedIn ? (
                <Link
                  href={WALLET_PATH}
                  aria-label={walletBalanceLabel}
                  className="btn-icon h-11 gap-1.5 px-2.5"
                >
                  <svg aria-hidden="true" className="h-[1.15rem] w-[1.15rem] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 1 3 7.5m18 4.5v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5V9" />
                  </svg>
                  <span className="hidden text-sm font-bold tabular-nums sm:inline">
                    {formatDemoUsd()}
                  </span>
                </Link>
              ) : null}
              <Link
                href={addFundsHref}
                aria-label={addFundsLabel}
                data-testid="header-add-funds"
                className="btn-icon h-11 w-11 text-xl font-bold text-primary hover:text-primary"
              >
                <span aria-hidden="true">+</span>
              </Link>
            </div>

            <Link
              href="/cart"
              aria-label={fill(t.nav.cartAria, { count })}
              className="btn-icon relative h-10 w-10"
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
              ref={toggleRef}
              type="button"
              aria-label={t.nav.menuToggle}
              aria-expanded={open}
              aria-haspopup="dialog"
              data-testid="menu-toggle"
              onClick={() => setOpen((value) => !value)}
              className="btn-icon h-11 w-11"
            >
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                {open
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
        </div>
      </header>
      {mounted && drawer ? createPortal(drawer, document.body) : null}
    </>
  );
}
