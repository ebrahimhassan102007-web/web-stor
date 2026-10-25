import Image from "next/image";
import type { CSSProperties } from "react";
import type { Product } from "@/lib/db/schema";

const artworkByPrefix: Array<[string, string]> = [
  ["pubg", "/products/pubg.svg"],
  ["free-fire", "/products/free-fire.svg"],
  ["chatgpt", "/products/chatgpt.svg"],
  ["gemini", "/products/gemini.svg"],
  ["claude", "/products/claude.svg"],
];

const accentByPrefix: Array<[string, string]> = [
  ["pubg", "#8bb7f2"],
  ["free-fire", "#ff8b45"],
  ["chatgpt", "#70d8b5"],
  ["gemini", "#a9b9ff"],
  ["claude", "#e7b28e"],
  ["steam", "#8ab4f8"],
  ["playstation", "#a8b7ff"],
  ["xbox", "#8ce5a4"],
];

function startsWithSlug(slug: string, prefix: string) {
  return slug === prefix || slug.startsWith(`${prefix}-`);
}

export function ProductArtwork({
  product,
  featuredLabel,
  variant = "card",
}: {
  product: Product;
  featuredLabel: string;
  variant?: "card" | "detail";
}) {
  const artwork = artworkByPrefix.find(([prefix]) => startsWithSlug(product.slug, prefix))?.[1];
  const accent = accentByPrefix.find(([prefix]) => startsWithSlug(product.slug, prefix))?.[1] ?? "#d9818d";
  const artStyle = { "--product-accent": accent } as CSSProperties;

  return (
    <div className={`product-art product-art-premium product-art-${variant}`} style={artStyle}>
      {artwork ? (
        <Image
          src={artwork}
          alt=""
          aria-hidden="true"
          fill
          sizes={variant === "detail" ? "(max-width: 1024px) 100vw, 50vw" : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"}
          className="product-art-image"
        />
      ) : (
        <div aria-hidden="true" className="product-art-fallback">
          <span className="product-art-fallback-orb" />
          <span className="product-art-fallback-icon">{product.icon || "✦"}</span>
          <span className="product-art-fallback-wordmark">E‑VORA DIGITAL</span>
        </div>
      )}
      <span aria-hidden="true" className="product-art-veil" />
      {product.featured && <span className="product-art-featured">{featuredLabel}</span>}
      {artwork && <span aria-hidden="true" className="product-art-signature">E‑VORA · DIGITAL</span>}
    </div>
  );
}
