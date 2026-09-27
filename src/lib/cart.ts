import "server-only";
import { db, cartItems, products } from "@/lib/db";
import { eq, asc } from "drizzle-orm";
import type { ProductType } from "@/lib/db/schema";

export type CartLine = {
  id: number;
  productId: number;
  nameAr: string;
  slug: string;
  icon: string;
  type: ProductType;
  unitPriceCents: number;
  quantity: number;
  stock: number;
  active: boolean;
  customerInputs: Record<string, string>;
  lineTotalCents: number;
};

export type CartSummary = {
  items: CartLine[];
  itemCount: number;
  subtotalCents: number;
  totalCents: number;
};

export const EMPTY_CART: CartSummary = {
  items: [],
  itemCount: 0,
  subtotalCents: 0,
  totalCents: 0,
};

/** Loads a cart with product data and computed totals (server prices only). */
export async function getCartSummary(
  cartId: string | null,
): Promise<CartSummary> {
  if (!cartId) return EMPTY_CART;

  const rows = await db
    .select({
      id: cartItems.id,
      productId: cartItems.productId,
      quantity: cartItems.quantity,
      customerInputs: cartItems.customerInputs,
      nameAr: products.nameAr,
      slug: products.slug,
      icon: products.icon,
      type: products.type,
      unitPriceCents: products.priceCents,
      stock: products.stock,
      active: products.active,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.createdAt));

  const items: CartLine[] = rows.map((r) => ({
    ...r,
    type: r.type as ProductType,
    customerInputs: (r.customerInputs ?? {}) as Record<string, string>,
    lineTotalCents: r.unitPriceCents * r.quantity,
  }));

  const subtotalCents = items.reduce((s, i) => s + i.lineTotalCents, 0);

  return {
    items,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    subtotalCents,
    // Digital goods: no shipping. Total = subtotal (discounts are already
    // reflected in unit prices).
    totalCents: subtotalCents,
  };
}
