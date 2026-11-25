import type { Locale } from "./i18n/dictionary";

/**
 * Deterministic, locale-aware integer formatting for the merchant workspace.
 *
 * Explicit locale (never the ambient environment) so the server-rendered value
 * and the client hydration agree exactly. Latin digits are used for Arabic,
 * matching the rest of the commerce UI.
 */
export function formatCount(value: number, locale: Locale): string {
  const safe = Number.isFinite(value) ? Math.trunc(value) : 0;
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US").format(safe);
}
