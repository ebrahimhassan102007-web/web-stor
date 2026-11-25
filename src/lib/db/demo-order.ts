import { asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { cartItems, carts, orderItems, orders, products, promoCodes, promoRedemptions, walletAccounts, walletLedger } from "./schema";
import { calculatePromoDiscount, hasSufficientWalletBalance, isPromoWithinLimits, normalizePromoCode } from "../wallet-math";
import { createHash } from "node:crypto";
import { DEMO_ORDER_STATUS, resolveCheckoutMode } from "../checkout-policy";
import { calculateSubtotalCents } from "../money";
import { newOrderNumber } from "../order-number";
import { validateFulfillmentTarget } from "@/lib/validation";

export type DemoOrderInput = {
  cartId: string;
  /** Digest of the user/cart-scoped client idempotency key. */
  idempotencyKey: string;
  /** Owning account when the buyer is signed in (S-08). Never inferred from email. */
  userId?: string | null;
  promoCode?: string;
  paymentMethod?: "demo" | "wallet";
  shipping: {
    customerName: string;
    email: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    postalCode: string;
    country: string;
  };
};

export type DemoOrderResult =
  | { status: "empty" }
  | { status: "insufficient-stock"; productName: string }
  | { status: "invalid-target"; productName: string }
  | { status: "invalid-promo" }
  | { status: "insufficient-funds" }
  | { status: "recorded" | "replayed"; orderNumber: string; totalCents: number };

/**
 * Persist either an unpaid local preview order or a wallet-funded paid order.
 * Demo mode is guarded here as well as at the route. Wallet mode serializes on
 * the account row and commits order, stock, fulfillment, ledger and balance as
 * one transaction. Prices and totals come from locked catalog rows and integer cents.
 */
export async function recordDemoOrder<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>,
  input: DemoOrderInput,
): Promise<DemoOrderResult> {
  const paymentMethod = input.paymentMethod ?? "demo";
  if (paymentMethod === "demo" && (process.env.NODE_ENV === "production" || resolveCheckoutMode() !== "demo")) {
    throw new Error("Demo orders are disabled in this environment");
  }
  if (paymentMethod === "wallet" && !input.userId) throw new Error("Wallet checkout requires an authenticated user");
  if (!/^[a-f0-9]{64}$/.test(input.idempotencyKey)) {
    throw new Error("A valid scoped checkout idempotency digest is required");
  }

  return database.transaction(async (tx): Promise<DemoOrderResult> => {
    const [cart] = await tx
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.id, input.cartId))
      .for("update")
      .limit(1);
    if (!cart) return { status: "empty" };

    const [existing] = await tx
      .select({ orderNumber: orders.orderNumber, totalCents: orders.totalCents })
      .from(orders)
      .where(eq(orders.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) return { status: "replayed", ...existing };

    const cartLines = await tx
      .select({ productId: cartItems.productId, quantity: cartItems.quantity, inputValue: cartItems.inputValue })
      .from(cartItems)
      .where(eq(cartItems.cartId, input.cartId))
      .orderBy(asc(cartItems.productId))
      .for("update");
    if (cartLines.length === 0) return { status: "empty" };

    const lines: Array<{
      productId: number;
      quantity: number;
      inputValue: string | null;
      name: string;
      nameAr: string;
      priceCents: number;
      stock: number;
      inputType: string;
    }> = [];
    for (const cartLine of cartLines) {
      const [product] = await tx
        .select({
          id: products.id,
          name: products.name,
          nameAr: products.nameAr,
          priceCents: products.priceCents,
          stock: products.stock,
          inputType: products.inputType,
        })
        .from(products)
        .where(eq(products.id, cartLine.productId))
        .for("update")
        .limit(1);
      if (!product || cartLine.quantity > product.stock) {
        return { status: "insufficient-stock", productName: product?.name ?? "" };
      }
      const target = validateFulfillmentTarget(product.inputType, cartLine.inputValue);
      if (!target.ok) return { status: "invalid-target", productName: product.name };
      lines.push({ ...product, productId: product.id, quantity: cartLine.quantity, inputValue: target.value });
    }

    const subtotalCents = calculateSubtotalCents(
      lines.map((line) => ({ priceCents: line.priceCents, quantity: line.quantity })),
    );
    const shippingCents = 0;
    let promoId: number | null = null;
    let promoRedeemerKey = "";
    let discountCents = 0;
    if (input.promoCode) {
      const code = normalizePromoCode(input.promoCode);
      const [promo] = await tx.select().from(promoCodes).where(eq(promoCodes.code, code)).for("update").limit(1);
      const now = new Date();
      if (!promo || !promo.isActive || promo.startsAt > now || (promo.expiresAt && promo.expiresAt <= now)) return { status: "invalid-promo" };
      const redeemerKey = input.userId ? `user:${input.userId}` : createHash("sha256").update(`guest-cart:${input.cartId}`).digest("hex");
      promoRedeemerKey = redeemerKey;
      const [{ globalCount }] = await tx.select({ globalCount: sql<number>`count(*)::int` }).from(promoRedemptions).where(eq(promoRedemptions.promoCodeId, promo.id));
      const [{ userCount }] = await tx.select({ userCount: sql<number>`count(*)::int` }).from(promoRedemptions).where(sql`${promoRedemptions.promoCodeId} = ${promo.id} AND ${promoRedemptions.redeemerKey} = ${redeemerKey}`);
      if (!isPromoWithinLimits({ globalCount, maxRedemptions: promo.maxRedemptions, redeemerCount: userCount, perUserLimit: promo.perUserLimit })) return { status: "invalid-promo" };
      discountCents = calculatePromoDiscount({ discountType: promo.discountType as "percentage" | "fixed_cents", discountValue: promo.discountValue, minSubtotalCents: promo.minSubtotalCents, maxDiscountCents: promo.maxDiscountCents, subtotalCents });
      if (discountCents <= 0) return { status: "invalid-promo" };
      promoId = promo.id;
    }
    const totalCents = Math.max(0, subtotalCents + shippingCents - discountCents);
    if (paymentMethod === "wallet") {
      const ownerId = input.userId!;
      await tx.insert(walletAccounts).values({ userId: ownerId, balanceCents: 0 }).onConflictDoNothing();
      const [wallet] = await tx.select({ balanceCents: walletAccounts.balanceCents }).from(walletAccounts).where(eq(walletAccounts.userId, ownerId)).for("update").limit(1);
      const [walletReplay] = await tx.select({ orderNumber: orders.orderNumber, totalCents: orders.totalCents }).from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey)).limit(1);
      if (walletReplay) return { status: "replayed", ...walletReplay };
      if (!wallet || !hasSufficientWalletBalance(wallet.balanceCents, totalCents)) return { status: "insufficient-funds" };
    }

    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber: newOrderNumber(),
        idempotencyKey: input.idempotencyKey,
        promoCodeId: promoId,
        discountCents,
        userId: input.userId ?? null,
        status: paymentMethod === "wallet" ? "paid" : DEMO_ORDER_STATUS,
        customerName: input.shipping.customerName,
        email: input.shipping.email,
        addressLine1: input.shipping.addressLine1,
        addressLine2: input.shipping.addressLine2 ?? "",
        city: input.shipping.city,
        postalCode: input.shipping.postalCode,
        country: input.shipping.country,
        subtotalCents,
        shippingCents,
        totalCents,
      })
      .onConflictDoNothing({ target: orders.idempotencyKey })
      .returning({ id: orders.id, orderNumber: orders.orderNumber });

    // A concurrent request from the same user may use a different cart and
    // therefore a different row lock. The UNIQUE idempotency index is final
    // arbiter; a conflict returns the already-committed result without writes.
    if (!order) {
      const [duplicate] = await tx
        .select({ orderNumber: orders.orderNumber, totalCents: orders.totalCents })
        .from(orders)
        .where(eq(orders.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (duplicate) return { status: "replayed", ...duplicate };
      throw new Error("Checkout idempotency conflict could not be resolved");
    }

    const insertedItems = await tx.insert(orderItems).values(
      lines.map((line) => ({
        orderId: order.id,
        productId: line.productId,
        productName: line.name,
        productNameAr: line.nameAr,
        unitPriceCents: line.priceCents,
        quantity: line.quantity,
        deliveryCode: "",
        deliveryInfo: line.inputValue ? `${line.inputType}:${line.inputValue}` : null,
        fulfillmentTarget: line.inputValue ? { type: line.inputType, value: line.inputValue } : null,
      })),
    ).returning({ id: orderItems.id, quantity: orderItems.quantity });
    if (paymentMethod === "wallet") {
      const { allocateFulfillmentCodesInTransaction } = await import("@/lib/security/fulfillment-vault");
      for (const item of insertedItems) await allocateFulfillmentCodesInTransaction(tx, item.id, item.quantity);
      for (const line of lines) {
        const changed = await tx.update(products).set({ stock: sql`${products.stock} - ${line.quantity}` }).where(sql`${products.id} = ${line.productId} AND ${products.stock} >= ${line.quantity}`).returning({ id: products.id });
        if (changed.length !== 1) throw new Error("Product stock changed while locked");
      }
    }
    if (paymentMethod === "wallet" && totalCents > 0) {
      const ownerId = input.userId!;
      const [debit] = await tx.insert(walletLedger).values({ userId: ownerId, entryType: "debit_order", direction: "debit", amountCents: totalCents, currency: "USD", orderId: order.id, idempotencyKey: `order:${order.id}`, description: `Order ${order.orderNumber}` }).onConflictDoNothing({ target: walletLedger.idempotencyKey }).returning({ id: walletLedger.id });
      if (!debit) throw new Error("Wallet debit idempotency conflict");
      const changed = await tx.update(walletAccounts).set({ balanceCents: sql`${walletAccounts.balanceCents} - ${totalCents}`, updatedAt: new Date() }).where(sql`${walletAccounts.userId} = ${ownerId} AND ${walletAccounts.balanceCents} >= ${totalCents}`).returning({ userId: walletAccounts.userId });
      if (changed.length !== 1) throw new Error("Wallet balance changed while locked");
    }
    if (promoId !== null) {
      await tx.insert(promoRedemptions).values({
        promoCodeId: promoId,
        userId: input.userId ?? null,
        redeemerKey: promoRedeemerKey,
        orderId: order.id,
        discountCents,
      });
    }
    if (paymentMethod === "wallet") await tx.delete(cartItems).where(eq(cartItems.cartId, input.cartId));

    return { status: "recorded", orderNumber: order.orderNumber, totalCents };
  });
}
