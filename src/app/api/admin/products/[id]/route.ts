import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, products, orderItems, categories } from "@/lib/db";
import { guardAdmin } from "@/lib/security/admin-guard";
import { adminProductUpdateSchema, cartItemIdSchema } from "@/lib/validation";
import { jsonOk, jsonError, readJsonBody, handleUnexpected } from "@/lib/http";
import { securityLog } from "@/lib/log";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/products/:id — partial update. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("Invalid input.", 400);

    const raw = await readJsonBody(req);
    if (raw === undefined) return jsonError("Invalid request body.", 400);

    const parsed = adminProductUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("Please review the fields.", 400, parsed.error.flatten().fieldErrors);
    }

    if (parsed.data.categoryId !== undefined) {
      const [cat] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, parsed.data.categoryId))
        .limit(1);
      if (!cat) return jsonError("Category not found.", 404);
    }

    const updated = await db
      .update(products)
      .set(parsed.data)
      .where(eq(products.id, idParsed.data))
      .returning({ id: products.id });

    if (updated.length === 0) return jsonError("Product not found.", 404);

    securityLog.adminAction({
      action: "product.update",
      adminId: guard.user.id,
      productId: idParsed.data,
      fields: Object.keys(parsed.data).join(","),
    });
    return jsonOk({ id: idParsed.data });
  } catch (err) {
    return handleUnexpected("admin:products:update", err);
  }
}

/**
 * DELETE /api/admin/products/:id
 *
 * Products referenced by past orders are soft-disabled (order history is
 * immutable); unreferenced products are hard-deleted.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const idParsed = cartItemIdSchema.safeParse((await ctx.params).id);
    if (!idParsed.success) return jsonError("Invalid input.", 400);

    const [referenced] = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.productId, idParsed.data))
      .limit(1);

    if (referenced) {
      const updated = await db
        .update(products)
        .set({ active: false, featured: false })
        .where(eq(products.id, idParsed.data))
        .returning({ id: products.id });
      if (updated.length === 0) return jsonError("Product not found.", 404);

      securityLog.adminAction({
        action: "product.disable",
        adminId: guard.user.id,
        productId: idParsed.data,
      });
      return jsonOk({ id: idParsed.data, disabled: true });
    }

    const deleted = await db
      .delete(products)
      .where(eq(products.id, idParsed.data))
      .returning({ id: products.id });
    if (deleted.length === 0) return jsonError("Product not found.", 404);

    securityLog.adminAction({
      action: "product.delete",
      adminId: guard.user.id,
      productId: idParsed.data,
    });
    return jsonOk({ id: idParsed.data, deleted: true });
  } catch (err) {
    return handleUnexpected("admin:products:delete", err);
  }
}
