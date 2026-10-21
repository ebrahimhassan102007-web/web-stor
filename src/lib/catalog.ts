import "server-only";
import { db, categories, products, orders, orderItems } from "@/lib/db";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { productQuerySchema, slugSchema, orderNumberSchema } from "@/lib/validation";

/**
 * Catalog data access. Every function validates its inputs with Zod before
 * they reach Drizzle, and Drizzle parameterizes everything — user input is
 * never concatenated into SQL.
 */

export async function getCategories() {
  return db.select().from(categories).orderBy(asc(categories.id));
}

export async function getCategoriesWithCounts() {
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      nameAr: categories.nameAr,
      description: categories.description,
      descriptionAr: categories.descriptionAr,
      icon: categories.icon,
      productCount: sql<number>`count(${products.id})::int`,
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.id));
}

export async function getFeaturedProducts(limit = 8) {
  return db
    .select()
    .from(products)
    .where(eq(products.featured, true))
    .orderBy(desc(products.rating))
    .limit(limit);
}

export type ProductFilters = {
  q?: string | string[];
  category?: string | string[];
  sort?: string | string[];
};

export async function getFilteredProducts(rawFilters: ProductFilters) {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const parsed = productQuerySchema.safeParse({
    q: first(rawFilters.q),
    category: first(rawFilters.category),
    sort: first(rawFilters.sort),
  });
  // Invalid query params fall back to safe defaults instead of erroring.
  const { q, category, sort } = parsed.success
    ? parsed.data
    : { q: "", category: "", sort: "newest" as const };

  const conditions = [];
  if (q) {
    // ilike is parameterized; escape LIKE wildcards in user input.
    const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
    conditions.push(
      or(
        ilike(products.name, `%${escaped}%`),
        ilike(products.description, `%${escaped}%`),
        // Arabic copy is searchable too (e.g. "شدات" or "بطاقة").
        ilike(products.nameAr, `%${escaped}%`),
        ilike(products.descriptionAr, `%${escaped}%`),
      ),
    );
  }
  if (category) {
    conditions.push(eq(categories.slug, category));
  }

  const orderBy = {
    newest: [desc(products.createdAt), desc(products.id)],
    "price-asc": [asc(products.priceCents)],
    "price-desc": [desc(products.priceCents)],
    rating: [desc(products.rating), desc(products.reviewCount)],
  }[sort];

  const rows = await db
    .select({
      product: products,
      categoryName: categories.name,
      categoryNameAr: categories.nameAr,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...orderBy)
    .limit(60);

  return { rows, applied: { q, category, sort } };
}

export async function getProductBySlug(rawSlug: string) {
  const parsed = slugSchema.safeParse(rawSlug);
  if (!parsed.success) return null;

  const [row] = await db
    .select({
      product: products,
      categoryName: categories.name,
      categoryNameAr: categories.nameAr,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.slug, parsed.data))
    .limit(1);

  return row ?? null;
}

export async function getRelatedProducts(categoryId: number, excludeId: number, limit = 4) {
  return db
    .select()
    .from(products)
    .where(and(eq(products.categoryId, categoryId), sql`${products.id} <> ${excludeId}`))
    .orderBy(desc(products.rating))
    .limit(limit);
}

export async function getOrderByNumber(rawNumber: string) {
  const parsed = orderNumberSchema.safeParse(rawNumber);
  if (!parsed.success) return null;

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, parsed.data))
    .limit(1);
  if (!order) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.id));

  return { order, items };
}
