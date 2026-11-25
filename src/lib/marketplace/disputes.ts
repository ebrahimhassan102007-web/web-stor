/**
 * Buyer order disputes + atomic refund resolution (S-26).
 *
 * A dispute is the buyer's only lever over a delivered digital code, so the
 * money path is deliberately strict:
 *
 *  - only the buyer who owns the order can open one (ownership is part of the
 *    row lock predicate);
 *  - only a paid/fulfilled/completed order is disputable;
 *  - at most one `open` dispute per order (partial unique index in `0010`);
 *  - the owner resolves locally (`npm run ops -- disputes resolve`), and a
 *    `refund` writes the immutable `wallet_ledger` `credit_refund` row, marks
 *    the order cancelled and permanently blocks the seller's payouts.
 *
 * The functions are transaction-scoped and free of `server-only`, like
 * `fulfillment-reveal.ts`, so the atomic resolution is proved against a real
 * PostgreSQL engine.
 */
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import { orderDisputes, orderItems, orders, products, sellerProfiles, walletAccounts, walletLedger } from "../db/schema";
import { normalizeSecurityInput } from "../security/digits";

export {
  DISPUTE_REASONS,
  DISPUTE_REASON_COPY,
  DISPUTE_STATUSES,
  DISPUTE_STATUS_COPY,
  type DisputeReason,
  type DisputeStatus,
} from "./dispute-copy";
import { DISPUTE_REASONS, type DisputeReason, type DisputeStatus } from "./dispute-copy";

/** Orders a buyer is allowed to dispute at all. */
export const DISPUTABLE_ORDER_STATUSES = ["paid", "fulfilled", "completed"] as const;

const cleanText = (min: number, max: number) =>
  z
    .string()
    .transform(normalizeSecurityInput)
    .pipe(
      z
        .string()
        .min(min)
        .max(max)
        .regex(/^[^\u0000-\u001f\u007f]*$/, "Invalid characters"),
    );

export const orderDisputeSchema = z.object({
  reason: z.enum(DISPUTE_REASONS),
  details: cleanText(0, 1000).optional().default(""),
});

export type OrderDisputeInput = z.infer<typeof orderDisputeSchema>;

export type CreateDisputeOutcome =
  | { ok: true; disputeId: string; status: DisputeStatus }
  | {
      ok: false;
      error: "ORDER_NOT_FOUND" | "ORDER_NOT_DISPUTABLE" | "DISPUTE_ALREADY_OPEN";
    };

/**
 * Open a dispute for the signed-in buyer.
 * `userId` is the authenticated session's user id — never a request field.
 */
export async function createOrderDisputeInTransaction(
  tx: PgDatabase<PgQueryResultHKT, typeof schema>,
  input: {
    orderId: string;
    userId: string;
    reason: DisputeReason;
    details?: string;
    now?: Date;
  },
): Promise<CreateDisputeOutcome> {
  const [order] = await tx
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.userId, input.userId)))
    .for("update")
    .limit(1);
  if (!order) return { ok: false, error: "ORDER_NOT_FOUND" };
  if (!(DISPUTABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
    return { ok: false, error: "ORDER_NOT_DISPUTABLE" };
  }

  const [existing] = await tx
    .select({ id: orderDisputes.id })
    .from(orderDisputes)
    .where(and(eq(orderDisputes.orderId, order.id), eq(orderDisputes.status, "open")))
    .limit(1);
  if (existing) return { ok: false, error: "DISPUTE_ALREADY_OPEN" };

  const now = input.now ?? new Date();
  const [created] = await tx
    .insert(orderDisputes)
    .values({
      orderId: order.id,
      userId: input.userId,
      reason: input.reason,
      details: input.details ?? "",
      status: "open",
      createdAt: now,
      updatedAt: now,
    })
    // The partial unique index is the real guard against a racing duplicate.
    .onConflictDoNothing()
    .returning({ id: orderDisputes.id });
  if (!created) return { ok: false, error: "DISPUTE_ALREADY_OPEN" };

  return { ok: true, disputeId: created.id, status: "open" };
}

export type ResolveDisputeOutcome =
  | {
      ok: true;
      status: "refunded" | "rejected";
      alreadyResolved: boolean;
      refundedCents: number;
      blockedSellerIds: string[];
      orderNumber: string;
    }
  | { ok: false; error: "DISPUTE_NOT_FOUND" | "INVALID_ACTION" | "ORDER_NOT_REFUNDABLE" };

/**
 * Owner resolution. Atomic and idempotent:
 *
 *  - a `refund` writes at most one `credit_refund` ledger row per order (the
 *    ledger's unique idempotency key makes a replay a no-op), credits the
 *    buyer's wallet, cancels the order and permanently blocks each seller
 *    involved in the order;
 *  - a `reject` only closes the dispute, releasing the escrow hold.
 */
export async function resolveOrderDisputeInTransaction(
  tx: PgDatabase<PgQueryResultHKT, typeof schema>,
  input: {
    disputeId: string;
    action: "refund" | "reject";
    note: string;
    now?: Date;
  },
): Promise<ResolveDisputeOutcome> {
  if (input.action !== "refund" && input.action !== "reject") {
    return { ok: false, error: "INVALID_ACTION" };
  }
  const [dispute] = await tx
    .select()
    .from(orderDisputes)
    .where(eq(orderDisputes.id, input.disputeId))
    .for("update")
    .limit(1);
  if (!dispute) return { ok: false, error: "DISPUTE_NOT_FOUND" };

  const [order] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, dispute.orderId))
    .for("update")
    .limit(1);
  if (!order) return { ok: false, error: "DISPUTE_NOT_FOUND" };

  const now = input.now ?? new Date();
  const note = input.note.trim().slice(0, 512);

  if (dispute.status !== "open") {
    return {
      ok: true,
      status: dispute.status === "refunded" ? "refunded" : "rejected",
      alreadyResolved: true,
      refundedCents: 0,
      blockedSellerIds: [],
      orderNumber: order.orderNumber,
    };
  }

  if (input.action === "reject") {
    await tx
      .update(orderDisputes)
      .set({ status: "rejected", resolutionNote: note, resolvedAt: now, updatedAt: now })
      .where(eq(orderDisputes.id, dispute.id));
    return {
      ok: true,
      status: "rejected",
      alreadyResolved: false,
      refundedCents: 0,
      blockedSellerIds: [],
      orderNumber: order.orderNumber,
    };
  }

  if (!(DISPUTABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
    return { ok: false, error: "ORDER_NOT_REFUNDABLE" };
  }
  if (!order.userId) return { ok: false, error: "ORDER_NOT_REFUNDABLE" };
  if (order.totalCents <= 0) return { ok: false, error: "ORDER_NOT_REFUNDABLE" };

  const buyerId = order.userId;

  await tx
    .insert(walletAccounts)
    .values({ userId: buyerId, balanceCents: 0 })
    .onConflictDoNothing();
  // Serialize concurrent resolutions for the same wallet.
  await tx
    .select({ userId: walletAccounts.userId })
    .from(walletAccounts)
    .where(eq(walletAccounts.userId, buyerId))
    .for("update")
    .limit(1);

  const [entry] = await tx
    .insert(walletLedger)
    .values({
      userId: buyerId,
      entryType: "credit_refund",
      direction: "credit",
      amountCents: order.totalCents,
      currency: "USD",
      orderId: order.id,
      idempotencyKey: `refund:${order.id}`,
      description: `dispute refund ${dispute.id}`.slice(0, 160),
    })
    .onConflictDoNothing({ target: walletLedger.idempotencyKey })
    .returning({ id: walletLedger.id });

  // A replay that lost the race still must not double-credit.
  if (entry) {
    await tx
      .update(walletAccounts)
      .set({
        balanceCents: sql`${walletAccounts.balanceCents} + ${order.totalCents}`,
        updatedAt: now,
      })
      .where(eq(walletAccounts.userId, buyerId));
  }

  // Permanent, per-seller payout block for every non-platform seller involved.
  const sellerRows = await tx
    .selectDistinct({ sellerId: products.sellerId })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, order.id));
  const blockedSellerIds: string[] = [];
  for (const row of sellerRows) {
    if (!row.sellerId) continue;
    await tx
      .update(sellerProfiles)
      .set({
        payoutBlockedAt: now,
        payoutBlockedReason: `dispute ${dispute.id} refunded order ${order.orderNumber}`.slice(0, 512),
        updatedAt: now,
      })
      .where(eq(sellerProfiles.id, row.sellerId));
    blockedSellerIds.push(row.sellerId);
  }

  await tx
    .update(orders)
    .set({ status: "cancelled" })
    .where(eq(orders.id, order.id));

  await tx
    .update(orderDisputes)
    .set({ status: "refunded", resolutionNote: note, resolvedAt: now, updatedAt: now })
    .where(eq(orderDisputes.id, dispute.id));

  return {
    ok: true,
    status: "refunded",
    alreadyResolved: false,
    refundedCents: order.totalCents,
    blockedSellerIds,
    orderNumber: order.orderNumber,
  };
}

/** Disputes currently blocking a seller's payout eligibility. */
export async function openDisputeOrderIds(
  tx: PgDatabase<PgQueryResultHKT, typeof schema>,
  orderIds: readonly string[],
): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  const rows = await tx
    .select({ orderId: orderDisputes.orderId })
    .from(orderDisputes)
    .where(and(inArray(orderDisputes.orderId, [...orderIds]), eq(orderDisputes.status, "open")));
  return new Set(rows.map((row) => row.orderId));
}
