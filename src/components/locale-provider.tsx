"use client";

import { createContext, useCallback, useContext, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, type Dict, type Locale } from "@/lib/i18n/dictionary";

/**
 * Client-side locale context. The server layout resolves the locale from
 * the `evora_locale` cookie and passes `{ locale, dict }` down; switching
 * language persists the cookie and refreshes the route so server
 * components (product names, metadata, dir/lang) re-render localized.
 */
type I18nContextValue = {
  locale: Locale;
  t: Dict;
  setLocale: (locale: Locale) => void;
  switching: boolean;
};

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  // Placeholder — real dict always provided by the provider.
  t: null as unknown as Dict,
  setLocale: () => {},
  switching: false,
});

export function LocaleProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dict;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [switching, startTransition] = useTransition();

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      // Mirror in localStorage for instant client-side reads.
      try {
        localStorage.setItem(LOCALE_COOKIE, next);
      } catch {
        // storage unavailable (private mode) — cookie alone is enough.
      }
      startTransition(() => router.refresh());
    },
    [locale, router],
  );

  return (
    <I18nContext.Provider value={{ locale, t: dict, setLocale, switching }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
