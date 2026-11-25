"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useI18n } from "./locale-provider";
import { formatCents } from "@/lib/money";

/**
 * Instant omnibox (Wave 6).
 *
 * Behaviour
 *  • opens on click, on `/`, or on ⌘K / Ctrl+K;
 *  • fetches the small public index once (`GET /api/catalog/omnibox`), then
 *    filters **client-side** on every keystroke — typing never waits on the
 *    network and never hits the database;
 *  • ArrowUp / ArrowDown move the active row, Enter opens it, Escape closes;
 *  • rendered through a portal to `document.body`: the sticky header uses
 *    `backdrop-filter`, which would otherwise become the containing block for
 *    `position: fixed` (the same P0-1 trap the drawer already documents).
 *
 * It is presentation only: no prices are computed, nothing is written, and the
 * only destinations are links that already exist in the app.
 */

type IndexPayload = {
  products: {
    slug: string;
    name: string;
    nameAr: string;
    icon: string;
    priceCents: number;
    categoryName: string;
    categoryNameAr: string;
    categorySlug: string;
    inputType: string;
  }[];
  categories: { slug: string; name: string; nameAr: string; icon: string; productCount: number }[];
};

type Row = {
  key: string;
  href: string;
  group: "products" | "categories" | "offers";
  title: string;
  meta: string;
  icon: string;
  priceCents?: number;
};

const QUICK_LINKS = [
  { key: "deals", href: "/offers", icon: "🏷️", en: "Today's deals", ar: "عروض اليوم", metaEn: "Offers", metaAr: "العروض" },
  { key: "support", href: "/support-bot", icon: "🤖", en: "Support bot", ar: "بوت الدعم", metaEn: "Help", metaAr: "مساعده" },
  { key: "seller", href: "/seller", icon: "◈", en: "Seller Central", ar: "بوابة التجار", metaEn: "Merchant", metaAr: "التجار" },
  { key: "wallet", href: "/account/wallet", icon: "▣", en: "Wallet & deposits", ar: "المحفظة والإيداع", metaEn: "Account", metaAr: "الحساب" },
  { key: "orders", href: "/account/orders", icon: "▤", en: "My orders", ar: "طلباتي", metaEn: "Account", metaAr: "الحساب" },
] as const;

export function Omnibox({ variant = "full" }: { variant?: "full" | "compact" }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<IndexPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [cursor, setCursor] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const requestedRef = useRef(false);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const close = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  // Lazy load: people who never search never pay for the index.
  const openSearch = useCallback(() => {
    setOpen(true);
    setCursor(0);
    if (requestedRef.current) return;
    requestedRef.current = true;
    fetch("/api/catalog/omnibox", { headers: { accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((body) => {
        if (body?.ok && body.data) setIndex(body.data as IndexPayload);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, []);

  // `/` and ⌘K / Ctrl+K open the palette — never while typing in a field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

      const isShortcut =
        (event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey);
      const isSlash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;

      if (isShortcut || (isSlash && !typing)) {
        event.preventDefault();
        openSearch();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);

  // Focus the field once the portal exists + lock nothing else on the page.
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  // Derived reset during render: a new query always starts at the first row.
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setCursor(0);
  }

  const rows = useMemo<Row[]>(() => {
    const needle = query.trim().toLocaleLowerCase();
    const products: Row[] = (index?.products ?? [])
      .filter((product) => {
        if (!needle) return true;
        return [
          product.name,
          product.nameAr,
          product.slug,
          product.categoryName,
          product.categoryNameAr,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle);
      })
      .slice(0, 24)
      .map((product) => ({
        key: `p:${product.slug}`,
        href: `/products/${product.slug}`,
        group: "products" as const,
        title: ar && product.nameAr ? product.nameAr : product.name,
        meta: ar && product.categoryNameAr ? product.categoryNameAr : product.categoryName,
        icon: product.icon,
        priceCents: product.priceCents,
      }));

    const categories: Row[] = (index?.categories ?? [])
      .filter((category) => {
        if (!needle) return false;
        return [category.name, category.nameAr, category.slug]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle);
      })
      .slice(0, 6)
      .map((category) => ({
        key: `c:${category.slug}`,
        href: `/products?category=${encodeURIComponent(category.slug)}`,
        group: "categories" as const,
        title: ar ? category.nameAr : category.name,
        meta: `${category.productCount} ${ar ? "منتج" : "items"}`,
        icon: category.icon,
      }));

    const offers: Row[] = QUICK_LINKS.filter((link) => {
      if (!needle) return true;
      return [link.en, link.ar, link.key].join(" ").toLocaleLowerCase().includes(needle);
    }).map((link) => ({
      key: `q:${link.key}`,
      href: link.href,
      group: "offers" as const,
      title: ar ? link.ar : link.en,
      meta: ar ? link.metaAr : link.metaEn,
      icon: link.icon,
    }));

    // Products first when searching, quick links first on an empty query.
    return needle ? [...products, ...categories, ...offers] : [...offers, ...products];
  }, [index, query, ar]);

  // Keep the active row inside the scrollable list.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-row-index="${cursor}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router],
  );

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((value) => (rows.length ? (value + 1) % rows.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((value) => (rows.length ? (value - 1 + rows.length) % rows.length : 0));
      return;
    }
    if (event.key === "Enter") {
      const row = rows[cursor];
      if (row) {
        event.preventDefault();
        go(row.href);
      }
    }
  }

  const grouped = useMemo(() => {
    const order: Row["group"][] = ["offers", "categories", "products"];
    return order
      .map((group) => ({ group, rows: rows.filter((row) => row.group === group) }))
      .filter((entry) => entry.rows.length > 0);
  }, [rows]);

  const activeId = rows[cursor] ? `omnibox-row-${rows[cursor].key.replace(/[^a-zA-Z0-9-]/g, "-")}` : undefined;

  const trigger =
    variant === "full" ? (
      <button
        ref={triggerRef}
        type="button"
        onClick={openSearch}
        data-testid="omnibox-trigger"
        aria-haspopup="dialog"
        aria-label={t.omnibox.open}
        className="group flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-edge bg-[var(--input-bg)] px-3 text-start text-sm text-muted transition-colors duration-200 hover:border-champagne/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="m20 20-4-4" />
        </svg>
        <span className="truncate">{t.omnibox.placeholder}</span>
        <kbd className="ms-auto hidden shrink-0 rounded-md border border-edge bg-raised/70 px-1.5 py-0.5 font-mono text-[0.65rem] text-muted lg:inline">
          ⌘K
        </kbd>
      </button>
    ) : (
      <button
        ref={triggerRef}
        type="button"
        onClick={openSearch}
        data-testid="omnibox-trigger"
        aria-haspopup="dialog"
        aria-label={t.omnibox.open}
        className="tap rounded-xl text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="m20 20-4-4" />
        </svg>
      </button>
    );

  const dialog = open ? (
    <div className="fixed inset-0 z-[85]">
      <button
        type="button"
        aria-label={t.omnibox.close}
        tabIndex={-1}
        onClick={close}
        className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-[3px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.omnibox.dialogTitle}
        data-testid="omnibox"
        dir={ar ? "rtl" : "ltr"}
        className="command-panel absolute inset-x-0 top-[6vh] mx-auto flex max-h-[80vh] w-[min(94vw,46rem)] flex-col overflow-hidden shadow-[0_40px_120px_-40px_rgba(0,0,0,0.95)]"
      >
        <div className="flex items-center gap-2 border-b border-edge px-3 py-2.5">
          <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-champagne" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="m20 20-4-4" />
          </svg>
          <input
            ref={inputRef}
            data-testid="omnibox-input"
            type="text"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls="omnibox-list"
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-label={t.omnibox.open}
            autoComplete="off"
            spellCheck={false}
            placeholder={t.omnibox.placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            className="h-11 min-w-0 flex-1 bg-transparent px-1 text-base text-foreground outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={close}
            aria-label={t.omnibox.close}
            className="tap rounded-lg text-muted transition-colors hover:text-foreground"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {failed ? (
            <p className="px-3 py-6 text-sm text-muted">{t.omnibox.unavailable}</p>
          ) : !index ? (
            <p className="px-3 py-6 text-sm text-muted">{t.omnibox.loading}</p>
          ) : rows.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-semibold">
                {t.omnibox.empty.replace("{q}", query.trim())}
              </p>
              <p className="mt-1 text-xs text-muted">{t.omnibox.emptyHint}</p>
            </div>
          ) : (
            <ul ref={listRef} id="omnibox-list" role="listbox" aria-label={t.omnibox.results} className="space-y-1">
              {grouped.map((group) => (
                <li key={group.group} role="presentation">
                  <p className="px-2.5 pb-1 pt-2 text-[0.65rem] font-bold uppercase text-muted">
                    {t.omnibox[group.group]}
                  </p>
                  <ul role="presentation" className="space-y-0.5">
                    {group.rows.map((row) => {
                      const index = rows.indexOf(row);
                      const isActive = index === cursor;
                      return (
                        <li key={row.key} role="presentation">
                          <button
                            type="button"
                            role="option"
                            id={`omnibox-row-${row.key.replace(/[^a-zA-Z0-9-]/g, "-")}`}
                            data-row-index={index}
                            aria-selected={isActive}
                            onMouseEnter={() => setCursor(index)}
                            onClick={() => go(row.href)}
                            className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start transition-colors duration-150 ${
                              isActive ? "bg-champagne/10 text-foreground" : "text-foreground/90 hover:bg-hover"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-edge bg-raised/60 text-lg"
                            >
                              {row.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{row.title}</span>
                              <span className="block truncate text-xs text-muted">{row.meta}</span>
                            </span>
                            {typeof row.priceCents === "number" && (
                              <span className="shrink-0 text-sm font-bold tabular-nums text-champagne">
                                {formatCents(row.priceCents, locale)}
                              </span>
                            )}
                            <span aria-hidden="true" className="shrink-0 text-muted">
                              {ar ? "‹" : "›"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge px-3 py-2 text-[0.7rem] text-muted">
          <span className="hidden sm:inline">{t.omnibox.hintKeys}</span>
          <button type="button" onClick={() => go("/products")} className="font-semibold text-primary hover:underline">
            {t.omnibox.seeAll} {ar ? "←" : "→"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {trigger}
      {mounted && dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
