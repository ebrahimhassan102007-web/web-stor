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
      className="btn-icon h-10 w-10 text-base"
    >
      <span aria-hidden>{theme === "dark" ? "☀️" : "🌙"}</span>
    </button>
  );
}
