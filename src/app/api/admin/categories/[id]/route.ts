import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, categories, products } from "@/lib/db";
import { guardAdmin } from "@/lib/security/admin-guard";
import { adminCategoryUpdateSchema, cartItemIdSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { jsonOk, jsonError, readJsonBody, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/categories/:id */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("بيانات غير صالحة.", 400);

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("طلب غير صالح.", 400);

    const parsed = adminCategoryUpdateSchema.safeParse(raw);
    if (!parsed.success) return jsonError("يرجى مراجعة الحقول.", 400);

    const updated = await db
      .update(categories)
      .set(parsed.data)
      .where(eq(categories.id, idParsed.data))
      .returning({ id: categories.id });
    if (updated.length === 0) return jsonError("القسم غير موجود.", 404);

    await recordAudit({
      adminId: guard.user.id,
      action: "category.update",
      targetType: "category",
      targetId: idParsed.data,
      meta: { fields: Object.keys(parsed.data).join(",") },
    });
    return jsonOk({ id: idParsed.data });
  } catch (err) {
    return handleUnexpected("admin:categories:update", err);
  }
}

/** DELETE /api/admin/categories/:id — only when the category is empty. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("بيانات غير صالحة.", 400);

    const [inUse] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.categoryId, idParsed.data))
      .limit(1);
    if (inUse) {
      return jsonError("القسم يحتوي على منتجات. انقلها أو احذفها أولاً.", 409);
    }

    const deleted = await db
      .delete(categories)
      .where(eq(categories.id, idParsed.data))
      .returning({ id: categories.id });
    if (deleted.length === 0) return jsonError("القسم غير موجود.", 404);

    await recordAudit({
      adminId: guard.user.id,
      action: "category.delete",
      targetType: "category",
      targetId: idParsed.data,
    });
    return jsonOk({ id: idParsed.data, deleted: true });
  } catch (err) {
    return handleUnexpected("admin:categories:delete", err);
  }
}
