import type { MetadataRoute } from "next";

/** Public catalogue is crawlable; account/admin/API surfaces are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/products", "/offers", "/about", "/faq", "/contact"],
        disallow: ["/account", "/admin", "/api", "/checkout", "/cart", "/login"],
      },
    ],
  };
}
