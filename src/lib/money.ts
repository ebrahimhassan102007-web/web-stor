import type { Locale } from "@/lib/i18n/dictionary";

/**
 * Currency helpers — prices are integer cents everywhere.
 * Arabic formats with Latin digits (common for commerce UIs).
 * All goods are digital → delivery is always instant and free,
 * so there is no shipping calculation anymore.
 */
const formatters = new Map<Locale, Intl.NumberFormat>();

function formatterFor(locale: Locale): Intl.NumberFormat {
  let fmt = formatters.get(locale);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US", {
      style: "currency",
      currency: "USD",
    });
    formatters.set(locale, fmt);
  }
  return fmt;
}

export function formatCents(cents: number, locale: Locale = "en"): string {
  return formatterFor(locale).format(cents / 100);
}
