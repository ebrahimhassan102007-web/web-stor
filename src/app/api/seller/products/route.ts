import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonError, jsonOk, handleUnexpected } from "@/lib/http";
import { guardMutatingRequest } from "@/lib/security/request-guard";
import { readAuthJson } from "@/lib/security/auth-http";
import { enforceAuthRateLimit } from "@/lib/security/auth-rate-limit";
import { recordSecurityEvent } from "@/lib/security/audit-log";
import { sellerProductSchema } from "@/lib/marketplace/seller-validation";
import { createSellerProduct, listSellerProducts } from "@/lib/marketplace/seller-store";
import { requireApprovedSeller, requireLiveSeller } from "@/lib/marketplace/seller-http";

export const dynamic = "force-dynamic";

/** The caller's own listings only — scoped by the session's seller id. */
export async function GET() {
  const auth = await requireApprovedSeller();
  if ("response" in auth) return auth.response;
  try {
    const rows = await listSellerProducts(db, auth.seller.id);
    return jsonOk({
      products: rows.map((product) => ({
        id: product.id,
        slug: product.slug,
        name: product.name,
        priceCents: product.priceCents,
        stock: product.stock,
        isActive: product.isActive,
        inputType: product.inputType,
      })),
    });
  } catch (error) {
    return handleUnexpected("seller-products-list", error);
  }
}

/**
 * Create a draft listing (S-26).
 *
 * Requires all three seller gates: verified email, active TOTP 2FA and an
 * approved profile. A pending or 2FA-less merchant is refused with `403` and
 * the exact unmet gate.
 */
export async function POST(request: NextRequest) {
  const guard = await guardMutatingRequest(request);
  if (guard) return guard;

  const auth = await requireLiveSeller();
  if ("response" in auth) return auth.response;
  const { user, seller } = { user: auth.context.user, seller: auth.seller };

  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = sellerProductSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);

  try {
    if (
      !(await enforceAuthRateLimit(request, "seller-product", user.email, {
        windowMs: 60 * 60 * 1000,
        ipLimit: 30,
        emailLimit: 20,
      }))
    ) {
      return jsonError("RATE_LIMITED", 429);
    }

    const created = await createSellerProduct(db, {
      sellerId: seller.id,
      storeSlug: seller.storeSlug,
      listing: parsed.data,
    });
    if (!created.ok) {
      return jsonError(
        created.error === "CATEGORY_NOT_FOUND" ? "CATEGORY_NOT_FOUND" : "PRODUCT_SLUG_UNAVAILABLE",
        created.error === "CATEGORY_NOT_FOUND" ? 400 : 409,
      );
    }

    await recordSecurityEvent("seller_product_created", user.id, String(created.product.id));
    return jsonOk(
      {
        product: {
          id: created.product.id,
          slug: created.product.slug,
          isActive: created.product.isActive,
          stock: created.product.stock,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleUnexpected("seller-products-create", error);
  }
}
