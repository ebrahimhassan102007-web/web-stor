/** Stable, locale-independent promo normalization. */
export function normalizePromoCode(code: string): string {
  return code.normalize("NFKC").trim().toLocaleUpperCase("en-US");
}

export function hasSufficientWalletBalance(balanceCents: number, chargeCents: number): boolean {
  return Number.isSafeInteger(balanceCents) && Number.isSafeInteger(chargeCents) && balanceCents >= 0 && chargeCents >= 0 && balanceCents >= chargeCents;
}

export function isPromoWithinLimits(input: { globalCount: number; maxRedemptions: number | null; redeemerCount: number; perUserLimit: number }): boolean {
  return Number.isSafeInteger(input.globalCount) && Number.isSafeInteger(input.redeemerCount) && input.globalCount >= 0 && input.redeemerCount >= 0 && (input.maxRedemptions === null || input.globalCount < input.maxRedemptions) && input.redeemerCount < input.perUserLimit;
}

export function calculatePromoDiscount(input: {
  discountType: "percentage" | "fixed_cents";
  discountValue: number;
  minSubtotalCents: number;
  maxDiscountCents: number | null;
  subtotalCents: number;
}): number {
  const { subtotalCents, discountValue, minSubtotalCents } = input;
  if (![subtotalCents, discountValue, minSubtotalCents].every(Number.isSafeInteger) || subtotalCents < 0 || discountValue <= 0 || minSubtotalCents < 0 || subtotalCents < minSubtotalCents) return 0;
  const raw = input.discountType === "percentage"
    ? Math.floor((subtotalCents * discountValue) / 10_000)
    : Math.min(subtotalCents, discountValue);
  const capped = input.maxDiscountCents === null ? raw : Math.min(raw, input.maxDiscountCents);
  return Math.max(0, Math.min(subtotalCents, capped));
}
