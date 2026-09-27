import type { MetadataRoute } from "next";
import { db, products, categories } from "@/lib/db";
import { eq } from "drizzle-orm";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://khodmtak.store";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [productRows, categoryRows] = await Promise.all([
    db
      .select({ slug: products.slug, updatedAt: products.updatedAt })
      .from(products)
      .where(eq(products.active, true)),
    db
      .select({ slug: categories.slug })
      .from(categories)
      .where(eq(categories.visible, true)),
  ]);

  return [
    { url: BASE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/products`, changeFrequency: "daily", priority: 0.9 },
    ...categoryRows.map((c) => ({
      url: `${BASE_URL}/products?category=${encodeURIComponent(c.slug)}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...productRows.map((p) => ({
      url: `${BASE_URL}/products/${encodeURIComponent(p.slug)}`,
      lastModified: p.updatedAt ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
