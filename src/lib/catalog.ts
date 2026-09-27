import "server-only";
import { db, categories, products } from "@/lib/db";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { productQuerySchema, slugSchema, PRODUCTS_PAGE_SIZE } from "@/lib/validation";

/**
 * Catalog data access. Every function validates its inputs with Zod before
 * they reach Drizzle, and Drizzle parameterizes everything — user input is
 * never concatenated into SQL. The storefront only ever sees active
 * products in visible categories.
 */

export async function getVisibleCategories() {
  return db
    .select()
    .from(categories)
    .where(eq(categories.visible, true))
    .orderBy(asc(categories.sortOrder), asc(categories.id));
}

export async function getVisibleCategoriesWithCounts() {
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      nameAr: categories.nameAr,
      nameEn: categories.nameEn,
      description: categories.description,
      icon: categories.icon,
      productCount: sql<number>`count(${products.id}) filter (where ${products.active})::int`,
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .where(eq(categories.visible, true))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.id));
}

export async function getFeaturedProducts(limit = 8) {
  return db
    .select()
    .from(products)
    .where(and(eq(products.featured, true), eq(products.active, true)))
    .orderBy(desc(products.createdAt))
    .limit(limit);
}

export type ProductFilters = {
  q?: string | string[];
  category?: string | string[];
  sort?: string | string[];
  page?: string | string[];
};

export async function getFilteredProducts(rawFilters: ProductFilters) {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const parsed = productQuerySchema.safeParse({
    q: first(rawFilters.q),
    category: first(rawFilters.category),
    sort: first(rawFilters.sort),
    page: first(rawFilters.page),
  });
  // Invalid query params fall back to safe defaults instead of erroring.
  const { q, category, sort, page } = parsed.success
    ? parsed.data
    : { q: "", category: "", sort: "featured" as const, page: 1 };

  const conditions = [eq(products.active, true), eq(categories.visible, true)];
  if (q) {
    // ilike is parameterized; escape LIKE wildcards in user input.
    const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
    const clause = or(
      ilike(products.nameAr, `%${escaped}%`),
      ilike(products.nameEn, `%${escaped}%`),
      ilike(products.description, `%${escaped}%`),
    );
    if (clause) conditions.push(clause);
  }
  if (category) {
    conditions.push(eq(categories.slug, category));
  }

  const orderBy = {
    featured: [desc(products.featured), desc(products.createdAt)],
    newest: [desc(products.createdAt), desc(products.id)],
    "price-asc": [asc(products.priceCents)],
    "price-desc": [desc(products.priceCents)],
  }[sort];

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        product: products,
        categoryNameAr: categories.nameAr,
        categorySlug: categories.slug,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(PRODUCTS_PAGE_SIZE)
      .offset((page - 1) * PRODUCTS_PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(where),
  ]);

  return {
    rows,
    total,
    totalPages: Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE)),
    applied: { q, category, sort, page },
  };
}

export async function getProductBySlug(rawSlug: string) {
  const parsed = slugSchema.safeParse(rawSlug);
  if (!parsed.success) return null;

  const [row] = await db
    .select({
      product: products,
      categoryNameAr: categories.nameAr,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(products.slug, parsed.data),
        eq(products.active, true),
        eq(categories.visible, true),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function getRelatedProducts(
  categoryId: number,
  excludeId: number,
  limit = 4,
) {
  return db
    .select()
    .from(products)
    .where(
      and(
        eq(products.categoryId, categoryId),
        eq(products.active, true),
        sql`${products.id} <> ${excludeId}`,
      ),
    )
    .orderBy(desc(products.featured), desc(products.createdAt))
    .limit(limit);
}
