import "server-only";
import { db, categories, products, orders } from "@/lib/db";
import type { Category, Product } from "@/lib/db/schema";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "@/lib/db/seed-data";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { productQuerySchema, slugSchema, orderNumberSchema } from "@/lib/validation";

/**
 * Catalogue data access.
 *
 * When DATABASE_URL is not configured yet, the public storefront can display
 * a read-only catalogue preview backed by the same source data used by the
 * explicit seed script. This is not a database, does not persist user data,
 * and must never be used for carts, checkout, auth, orders, or fulfilment.
 * Database-backed operations continue to fail closed until DATABASE_URL is set.
 */

const hasDatabase = () => Boolean(process.env.DATABASE_URL?.trim());
const previewCreatedAt = new Date("2026-01-01T00:00:00.000Z");

const previewCategories: Category[] = SEED_CATEGORIES.map((category, index) => ({
  ...category,
  id: index + 1,
  createdAt: previewCreatedAt,
}));

const previewCategoryIdBySlug = new Map(
  previewCategories.map((category) => [category.slug, category.id]),
);

const previewProducts: Product[] = SEED_PRODUCTS.map((product, index) => ({
  ...product,
  id: index + 1,
  categoryId: previewCategoryIdBySlug.get(product.category) ?? 1,
  // Preview stock is intentionally zero: seed quantities are not live inventory.
  stock: 0,
  rating: "0.0",
  reviewCount: 0,
  featured: product.featured ?? false,
  createdAt: previewCreatedAt,
}));

function findPreviewCategory(slug: string) {
  return previewCategories.find((category) => category.slug === slug);
}

function filterPreviewProducts(q: string, category: string) {
  const normalizedQuery = q.toLocaleLowerCase();
  return previewProducts.filter((product) => {
    const matchesCategory =
      !category || findPreviewCategory(category)?.id === product.categoryId;
    const searchText = [
      product.name,
      product.nameAr,
      product.description,
      product.descriptionAr,
    ].join(" ").toLocaleLowerCase();
    return matchesCategory && (!normalizedQuery || searchText.includes(normalizedQuery));
  });
}

export async function getCategories() {
  if (!hasDatabase()) return previewCategories;
  return db.select().from(categories).orderBy(asc(categories.id));
}

export async function getCategoriesWithCounts() {
  if (!hasDatabase()) {
    return previewCategories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      nameAr: category.nameAr,
      description: category.description,
      descriptionAr: category.descriptionAr,
      icon: category.icon,
      productCount: previewProducts.filter((product) => product.categoryId === category.id).length,
    }));
  }

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
  if (!hasDatabase()) {
    return previewProducts.filter((product) => product.featured).slice(0, limit);
  }

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

  if (!hasDatabase()) {
    const previewRows = filterPreviewProducts(q, category)
      .sort((a, b) => {
        if (sort === "price-asc") return a.priceCents - b.priceCents;
        if (sort === "price-desc") return b.priceCents - a.priceCents;
        if (sort === "rating") return Number(b.featured) - Number(a.featured) || b.id - a.id;
        return b.id - a.id;
      })
      .slice(0, 60)
      .map((product) => {
        const productCategory = previewCategories.find((item) => item.id === product.categoryId);
        return {
          product,
          categoryName: productCategory?.name ?? "",
          categoryNameAr: productCategory?.nameAr ?? "",
          categorySlug: productCategory?.slug ?? "",
        };
      });
    return { rows: previewRows, applied: { q, category, sort } };
  }

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
    rating: [desc(products.featured), desc(products.createdAt)],
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

  if (!hasDatabase()) {
    const product = previewProducts.find((item) => item.slug === parsed.data);
    if (!product) return null;
    const category = previewCategories.find((item) => item.id === product.categoryId);
    if (!category) return null;
    return {
      product,
      categoryName: category.name,
      categoryNameAr: category.nameAr,
      categorySlug: category.slug,
    };
  }

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
  if (!hasDatabase()) {
    return previewProducts
      .filter((product) => product.categoryId === categoryId && product.id !== excludeId)
      .slice(0, limit);
  }

  return db
    .select()
    .from(products)
    .where(and(eq(products.categoryId, categoryId), sql`${products.id} <> ${excludeId}`))
    .orderBy(desc(products.rating))
    .limit(limit);
}

export async function orderExistsByNumber(rawNumber: string): Promise<boolean> {
  const parsed = orderNumberSchema.safeParse(rawNumber);
  if (!parsed.success || !hasDatabase()) return false;

  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.orderNumber, parsed.data))
    .limit(1);
  return Boolean(order);
}
