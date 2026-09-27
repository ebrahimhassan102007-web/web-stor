export function Stars({ rating, count }: { rating: number; count?: number }) {
  const full = Math.round(Math.min(Math.max(rating, 0), 5));
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span aria-hidden className="tracking-tight text-amber-400">
        {"★".repeat(full)}
        <span className="text-white/15">{"★".repeat(5 - full)}</span>
      </span>
      <span className="text-xs text-muted">
        {rating.toFixed(1)}
        {typeof count === "number" && ` (${count.toLocaleString()})`}
      </span>
    </div>
  );
}
