import { inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "./seed-data";

export type SeedResult = {
  categoriesAdded: number;
  productsAdded: number;
};

/** Add missing demo catalog rows without updating or deleting existing data. */
export async function seedMissingCatalog<
  TQueryResult extends PgQueryResultHKT,
>(database: PgDatabase<TQueryResult, typeof schema>): Promise<SeedResult> {
  const insertedCategories = await database
    .insert(schema.categories)
    .values(SEED_CATEGORIES.map((category) => ({ ...category })))
    .onConflictDoNothing({ target: schema.categories.slug })
    .returning({ id: schema.categories.id });

  const seededCategorySlugs = SEED_CATEGORIES.map((category) => category.slug);
  const categories = await database
    .select({ id: schema.categories.id, slug: schema.categories.slug })
    .from(schema.categories)
    .where(inArray(schema.categories.slug, seededCategorySlugs));
  const idBySlug = new Map(categories.map((category) => [category.slug, category.id]));

  const productValues = SEED_PRODUCTS.map(({ category, ...product }) => {
    const categoryId = idBySlug.get(category);
    if (!categoryId) {
      throw new Error(`Seed category is missing: ${category}`);
    }
    return {
      ...product,
      featured: product.featured ?? false,
      categoryId,
    };
  });

  const insertedProducts = await database
    .insert(schema.products)
    .values(productValues)
    .onConflictDoNothing({ target: schema.products.slug })
    .returning({ id: schema.products.id });

  return {
    categoriesAdded: insertedCategories.length,
    productsAdded: insertedProducts.length,
  };
}
