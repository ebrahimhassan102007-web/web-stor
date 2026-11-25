import { db } from "@/lib/db";
import { jsonOk, handleUnexpected } from "@/lib/http";
import { sellerPayoutLedger } from "@/lib/marketplace/payout-policy";
import { loadSellerPayoutOrders } from "@/lib/marketplace/seller-store";
import { requireApprovedSeller } from "@/lib/marketplace/seller-http";

export const dynamic = "force-dynamic";

/**
 * The merchant's own money view (S-26):
 * gross sales, 10% platform commission, escrow-held balance and the
 * payout-eligible remainder — computed from trusted order lines only.
 *
 * Never returns buyer identity, auth data or delivery secrets.
 */
export async function GET() {
  const auth = await requireApprovedSeller();
  if ("response" in auth) return auth.response;
  try {
    const lines = await loadSellerPayoutOrders(db, auth.seller.id);
    const ledger = sellerPayoutLedger(lines);
    return jsonOk({
      sellerId: auth.seller.id,
      status: auth.seller.status,
      payoutBlocked: auth.seller.payoutBlockedAt !== null,
      commissionBps: 1000,
      ledger,
    });
  } catch (error) {
    return handleUnexpected("seller-summary", error);
  }
}
