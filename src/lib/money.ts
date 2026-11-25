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

export const MAX_STORED_CENTS = 2_147_483_647;

/** Integer-only server pricing that fits the existing PostgreSQL INTEGER columns. */
export function calculateSubtotalCents(lines: readonly { priceCents: number; quantity: number }[]): number {
  let total = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.priceCents) || line.priceCents <= 0 || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new Error("Invalid line price or quantity");
    }
    const lineTotal = line.priceCents * line.quantity;
    if (!Number.isSafeInteger(lineTotal) || total > MAX_STORED_CENTS - lineTotal) {
      throw new Error("Order total exceeds the stored money range");
    }
    total += lineTotal;
  }
  return total;
}

export function formatCents(cents: number, locale: Locale = "en"): string {
  return formatterFor(locale).format(cents / 100);
}

/** Indicative display-only USD/EGP rate; update before live commercial use. */
export const USD_TO_EGP_PREVIEW_RATE = 55.3;

export function formatEgpFromUsdCents(cents: number, locale: Locale = "en"): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format((cents / 100) * USD_TO_EGP_PREVIEW_RATE);
}
