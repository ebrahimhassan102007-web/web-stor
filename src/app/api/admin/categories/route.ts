import type { NextRequest } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { db, categories, products } from "@/lib/db";
import { guardAdmin } from "@/lib/security/admin-guard";
import { adminCategorySchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { jsonOk, jsonError, readJsonBody, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/admin/categories */
export async function GET(req: NextRequest) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const rows = await db
      .select({
        id: categories.id,
        slug: categories.slug,
        nameAr: categories.nameAr,
        nameEn: categories.nameEn,
        description: categories.description,
        icon: categories.icon,
        sortOrder: categories.sortOrder,
        visible: categories.visible,
        productCount: sql<number>`count(${products.id})::int`,
      })
      .from(categories)
      .leftJoin(products, eq(products.categoryId, categories.id))
      .groupBy(categories.id)
      .orderBy(asc(categories.sortOrder), asc(categories.id));

    return jsonOk({ categories: rows });
  } catch (err) {
    return handleUnexpected("admin:categories:list", err);
  }
}

/** POST /api/admin/categories */
export async function POST(req: NextRequest) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("طلب غير صالح.", 400);

    const parsed = adminCategorySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("يرجى مراجعة الحقول.", 400, parsed.error.flatten().fieldErrors);
    }

    const inserted = await db
      .insert(categories)
      .values(parsed.data)
      .onConflictDoNothing({ target: categories.slug })
      .returning({ id: categories.id });

    if (inserted.length === 0) {
      return jsonError("يوجد قسم بنفس المعرّف (slug).", 409);
    }

    await recordAudit({
      adminId: guard.user.id,
      action: "category.create",
      targetType: "category",
      targetId: inserted[0].id,
      meta: { slug: parsed.data.slug },
    });
    return jsonOk({ id: inserted[0].id }, { status: 201 });
  } catch (err) {
    return handleUnexpected("admin:categories:create", err);
  }
}
