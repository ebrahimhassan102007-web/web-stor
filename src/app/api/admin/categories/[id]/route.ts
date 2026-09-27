import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, categories, products } from "@/lib/db";
import { guardAdmin } from "@/lib/security/admin-guard";
import { adminCategorySchema, cartItemIdSchema } from "@/lib/validation";
import { jsonOk, jsonError, readJsonBody, handleUnexpected } from "@/lib/http";
import { securityLog } from "@/lib/log";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/categories/:id */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("Invalid input.", 400);

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("Invalid request body.", 400);

    const parsed = adminCategorySchema.partial().safeParse(raw);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return jsonError("Please review the fields.", 400);
    }

    const updated = await db
      .update(categories)
      .set(parsed.data)
      .where(eq(categories.id, idParsed.data))
      .returning({ id: categories.id });
    if (updated.length === 0) return jsonError("Category not found.", 404);

    securityLog.adminAction({
      action: "category.update",
      adminId: guard.user.id,
      categoryId: idParsed.data,
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
    if (!idParsed.success) return jsonError("Invalid input.", 400);

    const [inUse] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.categoryId, idParsed.data))
      .limit(1);
    if (inUse) {
      return jsonError("Category still contains products. Move or delete them first.", 409);
    }

    const deleted = await db
      .delete(categories)
      .where(eq(categories.id, idParsed.data))
      .returning({ id: categories.id });
    if (deleted.length === 0) return jsonError("Category not found.", 404);

    securityLog.adminAction({
      action: "category.delete",
      adminId: guard.user.id,
      categoryId: idParsed.data,
    });
    return jsonOk({ id: idParsed.data, deleted: true });
  } catch (err) {
    return handleUnexpected("admin:categories:delete", err);
  }
}
