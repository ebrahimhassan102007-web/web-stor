import { getExistingCartId } from "@/lib/security/session";
import { getCartSummary } from "@/lib/cart";
import { jsonOk, handleUnexpected } from "@/lib/http";
import { scheduleEphemeralHygiene } from "@/lib/db/hygiene-schedule";

export const dynamic = "force-dynamic";

/** GET /api/cart — current cart contents and totals. */
export async function GET() {
  // S-25: bounded ephemeral cleanup runs after the response, at most hourly.
  scheduleEphemeralHygiene();
  try {
    const cartId = await getExistingCartId();
    const summary = await getCartSummary(cartId);
    return jsonOk(summary);
  } catch (err) {
    return handleUnexpected("cart:get", err);
  }
}
