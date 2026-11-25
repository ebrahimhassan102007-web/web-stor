import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonError, jsonOk, handleUnexpected } from "@/lib/http";
import { guardMutatingRequest } from "@/lib/security/request-guard";
import { readAuthJson } from "@/lib/security/auth-http";
import { recordSecurityEvent } from "@/lib/security/audit-log";
import { sellerProductToggleSchema } from "@/lib/marketplace/seller-validation";
import { setSellerProductActive } from "@/lib/marketplace/seller-store";
import { requireLiveSeller, requireSellerUser } from "@/lib/marketplace/seller-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ productId: string }> };

/**
 * Toggle one of the caller's own listings (S-26).
 *
 * Publishing (`isActive: true`) requires the full merchant gate. Un-publishing
 * is always allowed for the owner, so a merchant whose 2FA was disabled can
 * still take their catalogue offline immediately.
 */
export async function PATCH(request: NextRequest, context: Context) {
  const guard = await guardMutatingRequest(request);
  if (guard) return guard;

  const { productId } = await context.params;
  const id = Number(productId);
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError("PRODUCT_NOT_FOUND", 404);

  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = sellerProductToggleSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);

  let sellerId: string;
  let userId: string;
  if (parsed.data.isActive) {
    const auth = await requireLiveSeller();
    if ("response" in auth) return auth.response;
    sellerId = auth.seller.id;
    userId = auth.context.user.id;
  } else {
    const auth = await requireSellerUser();
    if ("response" in auth) return auth.response;
    if (!auth.context.seller) return jsonError("SELLER_NOT_REGISTERED", 403);
    sellerId = auth.context.seller.id;
    userId = auth.context.user.id;
  }

  try {
    const updated = await setSellerProductActive(db, {
      sellerId,
      productId: id,
      isActive: parsed.data.isActive,
    });
    if (!updated) return jsonError("PRODUCT_NOT_FOUND", 404);
    await recordSecurityEvent(
      parsed.data.isActive ? "seller_product_published" : "seller_product_unpublished",
      userId,
      String(updated.id),
    );
    return jsonOk({ product: { id: updated.id, isActive: updated.isActive } });
  } catch (error) {
    return handleUnexpected("seller-product-toggle", error);
  }
}
