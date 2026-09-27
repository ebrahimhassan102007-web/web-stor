/** Currency helpers — prices are integer cents everywhere. */
const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCents(cents: number): string {
  return fmt.format(cents / 100);
}

export const FREE_SHIPPING_THRESHOLD_CENTS = 10_000; // $100
export const FLAT_SHIPPING_CENTS = 900; // $9

export function shippingFor(subtotalCents: number): number {
  return subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS || subtotalCents === 0
    ? 0
    : FLAT_SHIPPING_CENTS;
}
