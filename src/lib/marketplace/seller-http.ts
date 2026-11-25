import "server-only";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { SELLER_GATE_HTTP_STATUS, type SellerGateResult } from "@/lib/marketplace/seller-gate";
import { loadSellerContext, type SellerContext } from "@/lib/marketplace/seller-session";
import type { SellerProfileRow } from "@/lib/marketplace/seller-store";

/**
 * Shared authorization prelude for `/api/seller/**` (S-26).
 *
 * Every handler starts here, so no merchant route can forget one of the
 * checks. Refusals are `403` (gates) or `401` (no session) and always carry
 * `Cache-Control: private, no-store` through `jsonError`.
 */

type Refused = { response: NextResponse };
type Authed = { context: SellerContext };
export type SellerGateResultResponse = Refused | Authed;

/** Any authenticated account (used by `apply`: customers may become sellers). */
export async function requireSellerUser(): Promise<SellerGateResultResponse> {
  const context = await loadSellerContext();
  if (!context) return { response: jsonError("AUTH_REQUIRED", 401) };
  return { context };
}

export type ApprovedSellerResult = Refused | { context: SellerContext; seller: SellerProfileRow };

/** An authenticated seller whose profile is approved (read-only money views). */
export async function requireApprovedSeller(): Promise<ApprovedSellerResult> {
  const context = await loadSellerContext();
  if (!context) return { response: jsonError("AUTH_REQUIRED", 401) };
  if (!context.seller) return { response: jsonError("SELLER_NOT_REGISTERED", 403) };
  if (context.seller.status !== "approved") {
    return {
      response: NextResponse.json(
        {
          ok: false as const,
          error: "SELLER_NOT_APPROVED",
          status: context.seller.status,
          blocker: "SELLER_NOT_APPROVED",
        },
        {
          status: SELLER_GATE_HTTP_STATUS,
          headers: {
            "Cache-Control": "private, no-store, no-cache, must-revalidate",
            Vary: "Cookie",
          },
        },
      ),
    };
  }
  return { context, seller: context.seller };
}

export type LiveSellerResult = Refused | { context: SellerContext; seller: SellerProfileRow };

/**
 * The full merchant red line: email verified + TOTP 2FA + approved profile.
 * Publishing listings and importing **live** stock require all three.
 */
export async function requireLiveSeller(): Promise<LiveSellerResult> {
  const context = await loadSellerContext();
  if (!context) return { response: jsonError("AUTH_REQUIRED", 401) };
  if (!context.seller) return { response: jsonError("SELLER_NOT_REGISTERED", 403) };
  if (!context.gates.ready) return { response: sellerGateRefusal(context.gates) };
  return { context, seller: context.seller };
}

/** A 403 that tells the seller exactly which gate is unmet (no secrets). */
export function sellerGateRefusal(gates: SellerGateResult): NextResponse {
  return NextResponse.json(
    {
      ok: false as const,
      error: "SELLER_GATES_INCOMPLETE",
      blocker: gates.blocker,
      checks: gates.checks.map((check) => ({ key: check.key, ok: check.ok })),
      messageEn: gates.blockerEn,
      messageAr: gates.blockerAr,
    },
    {
      status: SELLER_GATE_HTTP_STATUS,
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
        Vary: "Cookie",
      },
    },
  );
}
