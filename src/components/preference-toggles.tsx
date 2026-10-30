"use client";

import { useState } from "react";
import { useI18n } from "./locale-provider";
import { THEME_COOKIE, type Theme } from "@/lib/i18n/dictionary";

/** AR / EN segmented language switch (persisted in a cookie). */
export function LanguageToggle() {
  const { locale, setLocale, switching, t } = useI18n();

  const btn = (active: boolean) =>
    `rounded-md px-1.5 py-1 text-xs font-bold transition-colors sm:px-2.5 ${
      active
        ? "bg-[var(--hover-fill)] text-champagne shadow-[inset_0_1px_0_var(--glass-highlight)]"
        : "text-muted hover:text-foreground"
    }`;

  return (
    <div
      className={`flex items-center gap-0.5 rounded-xl border border-edge bg-[var(--input-bg)] p-0.5 ${
        switching ? "opacity-60" : ""
      }`}
      role="group"
      aria-label={t.nav.languageToggle}
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        className={btn(locale === "en")}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("ar")}
        aria-pressed={locale === "ar"}
        className={btn(locale === "ar")}
      >
        عربي
      </button>
    </div>
  );
}

/** ☀️ / 🌙 theme switch (persisted in a cookie, applied instantly). */
export function ThemeToggle({ initialTheme }: { initialTheme: Theme }) {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>(initialTheme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    try {
      localStorage.setItem(THEME_COOKIE, next);
    } catch {
      // storage unavailable — cookie alone is enough.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? t.theme.toLight : t.theme.toDark}
      className="btn-icon group h-10 w-10"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[1.15rem] w-[1.15rem] text-muted transition-colors duration-300 group-hover:text-champagne"
      >
        {theme === "dark" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
          </>
        ) : (
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
        )}
      </svg>
    </button>
  );
}
