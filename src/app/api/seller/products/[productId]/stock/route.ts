import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonError, jsonOk, handleUnexpected } from "@/lib/http";
import { guardMutatingRequest } from "@/lib/security/request-guard";
import { readAuthJson } from "@/lib/security/auth-http";
import { enforceAuthRateLimit } from "@/lib/security/auth-rate-limit";
import { recordSecurityEvent } from "@/lib/security/audit-log";
import { sellerStockImportSchema, splitStockInput } from "@/lib/marketplace/seller-validation";
import { importSellerStock } from "@/lib/marketplace/seller-store";
import { requireLiveSeller } from "@/lib/marketplace/seller-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ productId: string }> };

/**
 * Batch-import real fulfillment codes into the caller's own product (S-26).
 *
 * - ownership is enforced in SQL (`products.seller_id = session seller`);
 * - every code is sealed immediately as a v2 split-key envelope;
 * - a keyed blind digest rejects duplicates without storing plaintext;
 * - the full merchant gate is required, so an unverified or 2FA-less account
 *   can never push fake or malicious codes into live inventory.
 */
export async function POST(request: NextRequest, context: Context) {
  const guard = await guardMutatingRequest(request);
  if (guard) return guard;

  const auth = await requireLiveSeller();
  if ("response" in auth) return auth.response;
  const { user, seller } = { user: auth.context.user, seller: auth.seller };

  const { productId } = await context.params;
  const id = Number(productId);
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError("PRODUCT_NOT_FOUND", 404);

  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  const parsed = sellerStockImportSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);

  const codes = parsed.data.codes?.length ? parsed.data.codes : splitStockInput(parsed.data.raw ?? "");
  if (codes.length === 0) return jsonError("INVALID_INPUT", 400);

  try {
    if (
      !(await enforceAuthRateLimit(request, "seller-stock", user.email, {
        windowMs: 60 * 60 * 1000,
        ipLimit: 40,
        emailLimit: 30,
      }))
    ) {
      return jsonError("RATE_LIMITED", 429);
    }

    const outcome = await importSellerStock(db, { sellerId: seller.id, productId: id, codes });
    if (!outcome.ok) {
      return jsonError(
        outcome.error === "PRODUCT_NOT_FOUND" ? "PRODUCT_NOT_FOUND" : "INVALID_INPUT",
        outcome.error === "PRODUCT_NOT_FOUND" ? 404 : 400,
      );
    }

    await recordSecurityEvent(
      "seller_stock_imported",
      user.id,
      `${outcome.result.imported}/${codes.length}`,
    );
    return jsonOk({
      imported: outcome.result.imported,
      duplicates: outcome.result.duplicates + outcome.result.batchDuplicates,
      rejected: outcome.result.rejected,
    });
  } catch (error) {
    return handleUnexpected("seller-stock-import", error);
  }
}
