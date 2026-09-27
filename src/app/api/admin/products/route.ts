import type { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, products, categories } from "@/lib/db";
import { guardAdmin } from "@/lib/security/admin-guard";
import { adminProductSchema } from "@/lib/validation";
import { jsonOk, jsonError, readJsonBody, handleUnexpected } from "@/lib/http";
import { securityLog } from "@/lib/log";

export const dynamic = "force-dynamic";

/** GET /api/admin/products — full catalog including inactive products. */
export async function GET(req: NextRequest) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const rows = await db
      .select({
        product: products,
        categoryName: categories.name,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
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
    if (raw === undefined) return jsonError("Invalid request body.", 400);

    const parsed = adminProductSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("Please review the fields.", 400, parsed.error.flatten().fieldErrors);
    }

    // Category must exist.
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, parsed.data.categoryId))
      .limit(1);
    if (!cat) return jsonError("Category not found.", 404);

    const inserted = await db
      .insert(products)
      .values(parsed.data)
      .onConflictDoNothing({ target: products.slug })
      .returning({ id: products.id });

    if (inserted.length === 0) {
      return jsonError("A product with this slug already exists.", 409);
    }

    securityLog.adminAction({
      action: "product.create",
      adminId: guard.user.id,
      productId: inserted[0].id,
    });
    return jsonOk({ id: inserted[0].id }, { status: 201 });
  } catch (err) {
    return handleUnexpected("admin:products:create", err);
  }
}
