import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonError, jsonOk, handleUnexpected } from "@/lib/http";
import { guardMutatingRequest } from "@/lib/security/request-guard";
import { readAuthJson } from "@/lib/security/auth-http";
import { enforceAuthRateLimit } from "@/lib/security/auth-rate-limit";
import { recordSecurityEvent } from "@/lib/security/audit-log";
import { sellerApplySchema } from "@/lib/marketplace/seller-validation";
import { createSellerApplication } from "@/lib/marketplace/seller-store";
import { requireSellerUser } from "@/lib/marketplace/seller-http";

export const dynamic = "force-dynamic";

/**
 * Customer → Merchant onboarding (S-26).
 *
 * Any signed-in customer — including Google-only accounts that never set a
 * password — may apply from `/seller`. The application always lands as
 * `pending`; approval is a local owner action (`npm run ops -- sellers approve`).
 */
export async function POST(request: NextRequest) {
  const guard = await guardMutatingRequest(request);
  if (guard) return guard;

  const auth = await requireSellerUser();
  if ("response" in auth) return auth.response;
  const { user, seller } = auth.context;

  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = sellerApplySchema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);

  if (seller) return jsonError("SELLER_ALREADY_REGISTERED", 409);

  try {
    if (
      !(await enforceAuthRateLimit(request, "seller-apply", user.email, {
        windowMs: 60 * 60 * 1000,
        ipLimit: 6,
        emailLimit: 3,
      }))
    ) {
      return jsonError("RATE_LIMITED", 429);
    }

    const created = await createSellerApplication(db, {
      userId: user.id,
      application: parsed.data,
      source: "onboarding",
    });
    if (!created.ok) {
      return jsonError(
        created.error === "SLUG_TAKEN" ? "SELLER_SLUG_TAKEN" : "SELLER_ALREADY_REGISTERED",
        409,
      );
    }

    await recordSecurityEvent("seller_application_created", user.id, created.seller.id);
    return jsonOk(
      {
        sellerId: created.seller.id,
        status: created.seller.status,
        storeSlug: created.seller.storeSlug,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleUnexpected("seller-apply", error);
  }
}
