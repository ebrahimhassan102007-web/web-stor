/** Currency helpers — prices are integer piasters (EGP cents) everywhere. */

export function formatCents(cents: number): string {
  const pounds = cents / 100;
  const formatted = new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: pounds % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(pounds);
  return `${formatted} ج.م`;
}

export function discountPercent(
  priceCents: number,
  originalPriceCents: number | null,
): number | null {
  if (!originalPriceCents || originalPriceCents <= priceCents) return null;
  return Math.round((1 - priceCents / originalPriceCents) * 100);
}
