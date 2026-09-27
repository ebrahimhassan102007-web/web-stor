import type { NextRequest } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { db, categories, products } from "@/lib/db";
import { guardAdmin } from "@/lib/security/admin-guard";
import { adminCategorySchema } from "@/lib/validation";
import { jsonOk, jsonError, readJsonBody, handleUnexpected } from "@/lib/http";
import { securityLog } from "@/lib/log";

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
        name: categories.name,
        description: categories.description,
        icon: categories.icon,
        productCount: sql<number>`count(${products.id})::int`,
      })
      .from(categories)
      .leftJoin(products, eq(products.categoryId, categories.id))
      .groupBy(categories.id)
      .orderBy(asc(categories.id));

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
    if (raw === undefined) return jsonError("Invalid request body.", 400);

    const parsed = adminCategorySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("Please review the fields.", 400, parsed.error.flatten().fieldErrors);
    }

    const inserted = await db
      .insert(categories)
      .values(parsed.data)
      .onConflictDoNothing({ target: categories.slug })
      .returning({ id: categories.id });

    if (inserted.length === 0) {
      return jsonError("A category with this slug already exists.", 409);
    }

    securityLog.adminAction({
      action: "category.create",
      adminId: guard.user.id,
      categoryId: inserted[0].id,
    });
    return jsonOk({ id: inserted[0].id }, { status: 201 });
  } catch (err) {
    return handleUnexpected("admin:categories:create", err);
  }
}
