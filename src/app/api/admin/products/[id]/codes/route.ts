import type { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, products, digitalCodes } from "@/lib/db";
import { guardAdmin } from "@/lib/security/admin-guard";
import { adminCodesUploadSchema, cartItemIdSchema } from "@/lib/validation";
import { encryptCode } from "@/lib/security/codes-crypto";
import { recordAudit } from "@/lib/audit";
import { jsonOk, jsonError, readJsonBody, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/products/:id/codes — inventory COUNTS only.
 * Code values are never listed back through any API, even to admins.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("بيانات غير صالحة.", 400);

    const [counts] = await db
      .select({
        available: sql<number>`count(*) filter (where ${digitalCodes.status} = 'AVAILABLE')::int`,
        reserved: sql<number>`count(*) filter (where ${digitalCodes.status} = 'RESERVED')::int`,
        sold: sql<number>`count(*) filter (where ${digitalCodes.status} = 'SOLD')::int`,
        voided: sql<number>`count(*) filter (where ${digitalCodes.status} = 'VOID')::int`,
      })
      .from(digitalCodes)
      .where(eq(digitalCodes.productId, idParsed.data));

    return jsonOk({ counts });
  } catch (err) {
    return handleUnexpected("admin:codes:counts", err);
  }
}

/**
 * POST /api/admin/products/:id/codes — bulk-add codes (encrypted at rest).
 * Also raises the product's stock by the number of codes added, inside the
 * same transaction, so stock and inventory can never drift apart.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("بيانات غير صالحة.", 400);

    const raw = await readJsonBody(req, 256 * 1024);
    if (raw === undefined) return jsonError("طلب غير صالح.", 400);

    const parsed = adminCodesUploadSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("قائمة الأكواد غير صالحة.", 400, parsed.error.flatten().fieldErrors);
    }

    const [product] = await db
      .select({ id: products.id, type: products.type })
      .from(products)
      .where(eq(products.id, idParsed.data))
      .limit(1);
    if (!product) return jsonError("المنتج غير موجود.", 404);
    if (product.type !== "DIGITAL_CODE") {
      return jsonError("هذا المنتج لا يستخدم مخزون أكواد.", 409);
    }

    const added = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(digitalCodes)
        .values(
          parsed.data.codes.map((code) => ({
            productId: product.id,
            codeEncrypted: encryptCode(code),
          })),
        )
        .returning({ id: digitalCodes.id });

      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${inserted.length}` })
        .where(eq(products.id, product.id));

      return inserted.length;
    });

    // Audit records the COUNT — never the code values.
    await recordAudit({
      adminId: guard.user.id,
      action: "inventory.codes.add",
      targetType: "product",
      targetId: product.id,
      meta: { count: added },
    });
    return jsonOk({ added }, { status: 201 });
  } catch (err) {
    return handleUnexpected("admin:codes:add", err);
  }
}
