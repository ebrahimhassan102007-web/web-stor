import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, products, orderItems, categories } from "@/lib/db";
import { guardAdmin } from "@/lib/security/admin-guard";
import { adminProductUpdateSchema, cartItemIdSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { jsonOk, jsonError, readJsonBody, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/products/:id — explicit-field partial update. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("بيانات غير صالحة.", 400);

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("طلب غير صالح.", 400);

    // Zod strips unknown keys — mass assignment is impossible.
    const parsed = adminProductUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("يرجى مراجعة الحقول.", 400, parsed.error.flatten().fieldErrors);
    }

    if (parsed.data.categoryId !== undefined) {
      const [cat] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, parsed.data.categoryId))
        .limit(1);
      if (!cat) return jsonError("القسم غير موجود.", 404);
    }

    const updated = await db
      .update(products)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(products.id, idParsed.data))
      .returning({ id: products.id });

    if (updated.length === 0) return jsonError("المنتج غير موجود.", 404);

    await recordAudit({
      adminId: guard.user.id,
      action: "product.update",
      targetType: "product",
      targetId: idParsed.data,
      meta: { fields: Object.keys(parsed.data).join(",") },
    });
    return jsonOk({ id: idParsed.data });
  } catch (err) {
    return handleUnexpected("admin:products:update", err);
  }
}

/**
 * DELETE /api/admin/products/:id
 * Products referenced by orders are soft-disabled (history is immutable);
 * unreferenced products are hard-deleted.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("بيانات غير صالحة.", 400);

    const [referenced] = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.productId, idParsed.data))
      .limit(1);

    if (referenced) {
      const updated = await db
        .update(products)
        .set({ active: false, featured: false, updatedAt: new Date() })
        .where(eq(products.id, idParsed.data))
        .returning({ id: products.id });
      if (updated.length === 0) return jsonError("المنتج غير موجود.", 404);

      await recordAudit({
        adminId: guard.user.id,
        action: "product.disable",
        targetType: "product",
        targetId: idParsed.data,
      });
      return jsonOk({ id: idParsed.data, disabled: true });
    }

    const deleted = await db
      .delete(products)
      .where(eq(products.id, idParsed.data))
      .returning({ id: products.id });
    if (deleted.length === 0) return jsonError("المنتج غير موجود.", 404);

    await recordAudit({
      adminId: guard.user.id,
      action: "product.delete",
      targetType: "product",
      targetId: idParsed.data,
    });
    return jsonOk({ id: idParsed.data, deleted: true });
  } catch (err) {
    return handleUnexpected("admin:products:delete", err);
  }
}
