import "server-only";
import { db, categories, products, orders } from "@/lib/db";
import type { Category, Product } from "@/lib/db/schema";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "@/lib/db/seed-data";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { productQuerySchema, slugSchema, orderNumberSchema } from "@/lib/validation";

/**
 * Catalogue data access.
 *
 * If DATABASE_URL is not configured, or the connected database is missing its
 * catalogue tables (Postgres 42P01), public pages use a read-only preview from
 * the same source data as the explicit seed script. This preview does not
 * persist data and must never be used for carts, checkout, auth, orders, or
 * fulfilment. Other database errors still surface normally.
 */

const hasDatabase = () => Boolean(process.env.DATABASE_URL?.trim());
const previewCreatedAt = new Date("2026-01-01T00:00:00.000Z");

/**
 * Postgres error 42P01 means a referenced table/view is missing.
 * Use the preview for this schema-not-ready condition only. Connectivity,
 * permission and other query failures should not be disguised as success.
 */
function isMissingDatabaseRelation(error: unknown): boolean {
  const visited = new Set<object>();
  let current: unknown = error;

  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === "42P01") return true;
    current = candidate.cause;
  }

  return false;
}

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

function getPreviewCategoriesWithCounts() {
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

const PREVIEW_ONLY_PRODUCT_SLUGS = new Set([
  "gemini-pro-1mo",
  "chatgpt-plus-1mo",
  "free-fire-110-diamonds",
  "free-fire-530-diamonds",
]);

/**
 * Keep showcase listings visible on Vercel Preview even when Preview is
 * connected to an already-seeded database. These rows are synthetic,
 * read-only and never inserted into the database or accepted by checkout.
 */
async function getPreviewOnlyRows(existingSlugs: string[] = []) {
  if (process.env.VERCEL_ENV !== "preview") return [];
  const existing = new Set(existingSlugs);
  const categoriesInDb = await db.select().from(categories);
  return previewProducts
    .filter((product) => PREVIEW_ONLY_PRODUCT_SLUGS.has(product.slug) && !existing.has(product.slug))
    .flatMap((product) => {
      const seed = SEED_PRODUCTS.find((item) => item.slug === product.slug);
      const category = categoriesInDb.find((item) => item.slug === seed?.category);
      if (!category) return [];
      const previewProduct = {
        ...product,
        id: 1_000_000 + product.id,
        categoryId: category.id,
        stock: 0,
        rating: "0.0",
        reviewCount: 0,
      };
      return [{
        product: previewProduct,
        categoryName: category.name,
        categoryNameAr: category.nameAr,
        categorySlug: category.slug,
      }];
    });
}

function getPreviewFilteredProducts(q: string, category: string, sort: "newest" | "price-asc" | "price-desc" | "rating") {
  const rows = filterPreviewProducts(q, category)
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

  const showcase = await getPreviewOnlyRows(rows.map((row) => row.product.slug));
  const matchingShowcase = showcase.filter((row) => {
    const matchesCategory = !category || row.categorySlug === category;
    const searchText = [row.product.name, row.product.nameAr, row.product.description, row.product.descriptionAr].join(" ").toLocaleLowerCase();
    return matchesCategory && (!q || searchText.includes(q.toLocaleLowerCase()));
  });
  return { rows: [...rows, ...matchingShowcase].slice(0, 60), applied: { q, category, sort } };
}

function getPreviewProductBySlug(slug: string) {
  const product = previewProducts.find((item) => item.slug === slug);
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
  try {
    return await db.select().from(categories).orderBy(asc(categories.id));
  } catch (error) {
    if (isMissingDatabaseRelation(error)) return previewCategories;
    throw error;
  }
}

export async function getCategoriesWithCounts() {
  if (!hasDatabase()) return getPreviewCategoriesWithCounts();

  try {
    return await db
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
  } catch (error) {
    if (isMissingDatabaseRelation(error)) return getPreviewCategoriesWithCounts();
    throw error;
  }
}

export async function getFeaturedProducts(limit = 8) {
  const preview = () => previewProducts.filter((product) => product.featured).slice(0, limit);
  if (!hasDatabase()) return preview();

  try {
    const existing = await db
      .select()
      .from(products)
      .where(eq(products.featured, true))
      .orderBy(desc(products.rating))
      .limit(limit);
    const showcase = await getPreviewOnlyRows(existing.map((product) => product.slug));
    return [...existing, ...showcase.filter((row) => row.product.featured).map((row) => row.product)].slice(0, limit);
  } catch (error) {
    if (isMissingDatabaseRelation(error)) return preview();
    throw error;
  }
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

  if (!hasDatabase()) return getPreviewFilteredProducts(q, category, sort);

  try {
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
  } catch (error) {
    if (isMissingDatabaseRelation(error)) return getPreviewFilteredProducts(q, category, sort);
    throw error;
  }
}

export async function getProductBySlug(rawSlug: string) {
  const parsed = slugSchema.safeParse(rawSlug);
  if (!parsed.success) return null;

  if (!hasDatabase()) return getPreviewProductBySlug(parsed.data);

  try {
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

    if (row) return row;
    const showcase = await getPreviewOnlyRows();
    return showcase.find((item) => item.product.slug === parsed.data) ?? null;
  } catch (error) {
    if (isMissingDatabaseRelation(error)) return getPreviewProductBySlug(parsed.data);
    throw error;
  }
}

export async function getRelatedProducts(categoryId: number, excludeId: number, limit = 4) {
  const preview = () => previewProducts
    .filter((product) => product.categoryId === categoryId && product.id !== excludeId)
    .slice(0, limit);
  if (!hasDatabase()) return preview();

  try {
    return await db
      .select()
      .from(products)
      .where(and(eq(products.categoryId, categoryId), sql`${products.id} <> ${excludeId}`))
      .orderBy(desc(products.rating))
      .limit(limit);
  } catch (error) {
    if (isMissingDatabaseRelation(error)) return preview();
    throw error;
  }
}

export async function orderExistsByNumber(rawNumber: string): Promise<boolean> {
  const parsed = orderNumberSchema.safeParse(rawNumber);
  if (!parsed.success || !hasDatabase()) return false;

  try {
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.orderNumber, parsed.data))
      .limit(1);
    return Boolean(order);
  } catch (error) {
    if (isMissingDatabaseRelation(error)) return false;
    throw error;
  }
}
