import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { categories, products } from "./schema";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "./seed-data";
import { assertLocalResetAllowed, assertNotProduction } from "./seed-safety";

/** Idempotently add missing demo records without updating/deleting existing rows. */
export async function seedMissingCatalog<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult, typeof schema>,
): Promise<void> {
  assertNotProduction(process.env);
  for (const category of SEED_CATEGORIES) {
    await db.insert(categories).values({ ...category }).onConflictDoNothing({
      target: categories.slug,
    });
  }

  const existingCategories = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories);
  const idBySlug = new Map(existingCategories.map((category) => [category.slug, category.id]));
  const newProducts = SEED_PRODUCTS.flatMap(({ category, ...product }) => {
    const categoryId = idBySlug.get(category);
    return categoryId === undefined
      ? []
      : [{ ...product, featured: product.featured ?? false, categoryId }];
  });

  if (newProducts.length) {
    await db.insert(products).values(newProducts).onConflictDoNothing({
      target: products.slug,
    });
  }
}

/** Only for the explicitly confirmed local reset script. */
export async function deleteCatalogAndDemoOrders<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult, typeof schema>,
): Promise<void> {
  assertLocalResetAllowed(process.env);
  await db.delete(schema.orderItems);
  await db.delete(schema.orders);
  await db.delete(schema.cartItems);
  await db.delete(products);
  await db.delete(categories);
}
