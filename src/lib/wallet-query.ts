import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, walletAccounts, walletLedger } from "@/lib/db";

export async function getWallet(userId: string, page = 1, pageSize = 20) {
  const [account] = await db.select({ balanceCents: walletAccounts.balanceCents, currency: walletAccounts.currency })
    .from(walletAccounts).where(eq(walletAccounts.userId, userId)).limit(1);
  const safePage = Math.max(1, Math.min(10000, Math.floor(page)));
  const history = await db.select({
    id: walletLedger.id, entryType: walletLedger.entryType, direction: walletLedger.direction,
    amountCents: walletLedger.amountCents, currency: walletLedger.currency, orderId: walletLedger.orderId,
    description: walletLedger.description, createdAt: walletLedger.createdAt,
  }).from(walletLedger).where(eq(walletLedger.userId, userId)).orderBy(desc(walletLedger.createdAt), desc(walletLedger.id))
    .limit(pageSize).offset((safePage - 1) * pageSize);
  return { balanceCents: account?.balanceCents ?? 0, currency: account?.currency ?? "USD", history, page: safePage, pageSize };
}
