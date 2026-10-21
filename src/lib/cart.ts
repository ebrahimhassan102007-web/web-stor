import "server-only";
import { db, cartItems, products } from "@/lib/db";
import { eq, asc } from "drizzle-orm";

export type CartLine = {
  id: number;
  productId: number;
  name: string;
  nameAr: string;
  slug: string;
  icon: string;
  unitPriceCents: number;
  quantity: number;
  stock: number;
  lineTotalCents: number;
  /** "none" | "player-id" | "region" (see products.input_type). */
  inputType: string;
  /** Customer-supplied delivery input (Player ID / region code). */
  inputValue: string | null;
};

export type CartSummary = {
  items: CartLine[];
  itemCount: number;
  subtotalCents: number;
  /** Digital goods: delivery is instant & free; total == subtotal. */
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
      inputValue: cartItems.inputValue,
      name: products.name,
      nameAr: products.nameAr,
      slug: products.slug,
      icon: products.icon,
      unitPriceCents: products.priceCents,
      stock: products.stock,
      inputType: products.inputType,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.createdAt));

  const items: CartLine[] = rows.map((r) => ({
    ...r,
    lineTotalCents: r.unitPriceCents * r.quantity,
  }));

  const subtotalCents = items.reduce((s, i) => s + i.lineTotalCents, 0);

  return {
    items,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    subtotalCents,
    totalCents: subtotalCents,
  };
}
