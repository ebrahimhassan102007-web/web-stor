import type { MetadataRoute } from "next";

const PUBLIC_PATHS = [
  "/",
  "/products",
  "/offers",
  "/about",
  "/faq",
  "/contact",
  "/support-bot",
  "/policies/privacy",
  "/policies/terms",
  "/policies/delivery-refunds",
] as const;

/** Only genuinely public pages — never account/admin/checkout paths. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.APP_ORIGIN?.trim().replace(/\/$/, "");
  return PUBLIC_PATHS.map((path) => ({
    url: origin ? `${origin}${path}` : path,
  }));
}
