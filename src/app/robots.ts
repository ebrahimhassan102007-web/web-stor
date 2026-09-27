import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://khodmtak.store";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/account", "/checkout", "/cart", "/pay/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
