import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { recordDemoOrder } from "@/lib/db/demo-order";
import { jsonError, jsonOk, handleUnexpected } from "@/lib/http";
import { resolveCheckoutMode, CHECKOUT_DISABLED_ERROR, CHECKOUT_DISABLED_STATUS } from "@/lib/checkout-policy";
import { getExistingCartId } from "@/lib/security/session";
import { guardMutatingRequest, noteRejectedBody, rejectHoneypot } from "@/lib/security/request-guard";
import { isHoneypotTripped } from "@/lib/security/honeypot";
import { enforceRateLimit, clientKey } from "@/lib/security/rate-limit";
import { readJsonBody, JSON_BODY_STATUS } from "@/lib/security/read-json";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { checkoutSchema } from "@/lib/validation";
import { getAuthSecret } from "@/lib/security/auth-core";
import { isClientIdempotencyKey, scopedCheckoutIdempotencyDigest } from "@/lib/marketplace/idempotency";
import { recordSecurityEvent } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";

/**
 * Unpaid demo orders fail closed in production. Authenticated wallet-funded
 * orders are a separate path that atomically checks funds, allocates encrypted
 * fulfillment inventory, and records a ledger debit.
 */
export async function POST(req: NextRequest) {
  try {
    const walletIntent = new URL(req.url).searchParams.get("payment") === "wallet";
    if (resolveCheckoutMode() === "disabled" && !walletIntent) return jsonError(CHECKOUT_DISABLED_ERROR, CHECKOUT_DISABLED_STATUS);
    const guard = await guardMutatingRequest(req);
  if (guard) return guard;
    if (!(await enforceRateLimit("checkout", [clientKey(req)], 10, 60_000))) {
      return jsonError("RATE_LIMITED", 429);
    }

    const body = await readJsonBody(req, 16 * 1024);
    if (!body.ok) {
      await noteRejectedBody(req, body);
      return jsonError("INVALID_BODY", JSON_BODY_STATUS[body.reason]);
    }
    if (isHoneypotTripped(body.value)) return await rejectHoneypot(req);
    const raw: unknown = body.value;

    const parsed = checkoutSchema.safeParse(raw);
    const promoCode = raw && typeof raw === "object" && "promoCode" in raw && typeof (raw as { promoCode?: unknown }).promoCode === "string"
      ? (raw as { promoCode: string }).promoCode.slice(0, 64)
      : undefined;
    const paymentMethod = raw && typeof raw === "object" && (raw as { paymentMethod?: unknown }).paymentMethod === "wallet" ? "wallet" : "demo";
    if (!parsed.success) {
      return jsonError(
        "INVALID_INPUT",
        400,
        parsed.error.flatten().fieldErrors,
      );
    }

    const cartId = await getExistingCartId();
    if (!cartId) return jsonError("CART_EMPTY", 400);

    if (!(await enforceRateLimit("checkout", [`cart:${cartId}`], 10, 60_000))) {
      return jsonError("RATE_LIMITED", 429);
    }
    const clientIdempotencyKey = req.headers.get("idempotency-key");
    if (!isClientIdempotencyKey(clientIdempotencyKey)) return jsonError("IDEMPOTENCY_KEY_REQUIRED", 400);

    // S-08: ownership comes from the signed-in session, never from the
    // email typed into the form. Guest keys are scoped to their verified cart.
    const accountUser = await getCurrentAccountUser().catch(() => null);
    if (resolveCheckoutMode() === "disabled" && paymentMethod !== "wallet") return jsonError(CHECKOUT_DISABLED_ERROR, CHECKOUT_DISABLED_STATUS);
    if (paymentMethod === "wallet" && !accountUser) return jsonError("AUTH_REQUIRED", 401);
    const idempotencyKey = scopedCheckoutIdempotencyDigest(
      accountUser?.id ?? `guest-cart:${cartId}`,
      clientIdempotencyKey,
      getAuthSecret(),
    );
    const result = await recordDemoOrder(db, {
      cartId,
      userId: accountUser?.id ?? null,
      idempotencyKey,
      promoCode,
      paymentMethod,
      shipping: parsed.data,
    });
    if (result.status === "empty") return jsonError("CART_EMPTY", 400);
    if (result.status === "insufficient-stock") {
      return jsonError("INSUFFICIENT_STOCK", 409, {
        productName: [result.productName],
      });
    }
    if (result.status === "invalid-target") return jsonError("INVALID_FULFILLMENT_TARGET", 400);
    if (result.status === "invalid-promo") return jsonError("PROMO_UNAVAILABLE", 400);
    if (result.status === "insufficient-funds") return jsonError("INSUFFICIENT_WALLET_FUNDS", 409);
    if (paymentMethod === "wallet" && accountUser && result.status === "recorded") await recordSecurityEvent("wallet_checkout_paid", accountUser.id, "wallet_order_paid");

    return jsonOk(
      { orderNumber: result.orderNumber, totalCents: result.totalCents, replayed: result.status === "replayed" },
      { status: result.status === "replayed" ? 200 : 201 },
    );
  } catch (error) {
    return handleUnexpected("checkout", error);
  }
}
