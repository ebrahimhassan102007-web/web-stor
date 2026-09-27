import type { NextRequest } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { db, products, categories, digitalCodes } from "@/lib/db";
import { guardAdmin } from "@/lib/security/admin-guard";
import { adminProductSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { jsonOk, jsonError, readJsonBody, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/admin/products — full catalog incl. inactive + code counts. */
export async function GET(req: NextRequest) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const rows = await db
      .select({
        product: products,
        categoryNameAr: categories.nameAr,
        availableCodes: sql<number>`count(${digitalCodes.id}) filter (where ${digitalCodes.status} = 'AVAILABLE')::int`,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(digitalCodes, eq(digitalCodes.productId, products.id))
      .groupBy(products.id, categories.nameAr)
      .orderBy(asc(products.id))
      .limit(500);

    return jsonOk({ products: rows });
  } catch (err) {
    return handleUnexpected("admin:products:list", err);
  }
}

/** POST /api/admin/products — create a product. */
export async function POST(req: NextRequest) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("طلب غير صالح.", 400);

    const parsed = adminProductSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("يرجى مراجعة الحقول.", 400, parsed.error.flatten().fieldErrors);
    }
    if (
      parsed.data.originalPriceCents !== null &&
      parsed.data.originalPriceCents < parsed.data.priceCents
    ) {
      return jsonError("السعر الأصلي يجب أن يكون أكبر من سعر البيع.", 400);
    }

    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, parsed.data.categoryId))
      .limit(1);
    if (!cat) return jsonError("القسم غير موجود.", 404);

    const inserted = await db
      .insert(products)
      .values(parsed.data)
      .onConflictDoNothing({ target: products.slug })
      .returning({ id: products.id });

    if (inserted.length === 0) {
      return jsonError("يوجد منتج بنفس المعرّف (slug).", 409);
    }

    await recordAudit({
      adminId: guard.user.id,
      action: "product.create",
      targetType: "product",
      targetId: inserted[0].id,
      meta: { slug: parsed.data.slug, type: parsed.data.type },
    });
    return jsonOk({ id: inserted[0].id }, { status: 201 });
  } catch (err) {
    return handleUnexpected("admin:products:create", err);
  }
}
