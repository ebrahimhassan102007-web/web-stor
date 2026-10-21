import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { categories, products } from "./schema";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "./seed-data";
import { assertNotProduction } from "./seed-safety";

export type SeedResult = {
  categoriesAdded: number;
  productsAdded: number;
};

/**
 * Adds any missing demo categories/products and leaves every existing row
 * exactly as it is. Repeat runs are no-ops.
 *
 * Additive by design: there is no delete or update path here, so seeding can
 * never wipe a catalog, a cart or an order. Production is refused outright.
 */
export async function seedMissingCatalog<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult, typeof schema>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SeedResult> {
  assertNotProduction(env);

  const insertedCategories = await db
    .insert(categories)
    .values(SEED_CATEGORIES.map((category) => ({ ...category })))
    .onConflictDoNothing({ target: categories.slug })
    .returning({ id: categories.id });

  const existingCategories = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories);
  const idBySlug = new Map(
    existingCategories.map((category) => [category.slug, category.id]),
  );

  const rows = SEED_PRODUCTS.flatMap(({ category, ...product }) => {
    const categoryId = idBySlug.get(category);
    return categoryId === undefined
      ? []
      : [{ ...product, featured: product.featured ?? false, categoryId }];
  });

  const insertedProducts = rows.length
    ? await db
        .insert(products)
        .values(rows)
        .onConflictDoNothing({ target: products.slug })
        .returning({ id: products.id })
    : [];

  return {
    categoriesAdded: insertedCategories.length,
    productsAdded: insertedProducts.length,
  };
}
