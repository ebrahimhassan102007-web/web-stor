import "server-only";
import { cookies, headers } from "next/headers";
import {
  dictionaries,
  isLocale,
  LOCALE_COOKIE,
  THEME_COOKIE,
  type Dict,
  type Locale,
  type Theme,
} from "./dictionary";

/**
 * Resolves the active locale for this request:
 *  1. the `evora_locale` cookie (set by the language toggle), else
 *  2. the browser's primary Accept-Language (Arabic → "ar"), else
 *  3. English.
 */
export async function getLocale(): Promise<Locale> {
  const cookieValue = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieValue)) return cookieValue;

  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  const primary = acceptLanguage.split(",")[0]?.trim().toLowerCase() ?? "";
  return primary.startsWith("ar") ? "ar" : "en";
}

/** Resolves the active theme (dark unless the cookie says light). */
export async function getTheme(): Promise<Theme> {
  const cookieValue = (await cookies()).get(THEME_COOKIE)?.value;
  return cookieValue === "light" ? "light" : "dark";
}

/** Convenience: `{ locale, t }` for server components. */
export async function getI18n(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale] };
}
