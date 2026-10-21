import type { Locale } from "@/lib/i18n/dictionary";

export function Stars({
  rating,
  count,
  locale = "en",
}: {
  rating: number;
  count?: number;
  locale?: Locale;
}) {
  const full = Math.round(Math.min(Math.max(rating, 0), 5));
  const numLocale = locale === "ar" ? "ar-EG-u-nu-latn" : "en-US";
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span aria-hidden className="tracking-tight text-amber-400">
        {"★".repeat(full)}
        <span className="text-foreground/15">{"★".repeat(5 - full)}</span>
      </span>
      <span className="text-xs text-muted">
        {rating.toLocaleString(numLocale, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}
        {typeof count === "number" && ` (${count.toLocaleString(numLocale)})`}
      </span>
    </div>
  );
}
