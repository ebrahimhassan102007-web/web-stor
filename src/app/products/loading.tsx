/**
 * Catalogue skeleton.
 *
 * Shown while the dynamic products route streams. It mirrors the real grid
 * (same columns, same card aspect) so the page does not jump when content
 * arrives — the skeleton occupies the final geometry.
 */
export default function ProductsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading products…</span>
      <div className="skeleton h-4 w-32" />
      <div className="skeleton mt-4 h-9 w-64 max-w-full" />
      <div className="skeleton mt-3 h-4 w-80 max-w-full" />
      <div className="surface mt-7 p-4 sm:p-5">
        <div className="skeleton h-11 w-full" />
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-8 w-24 rounded-full" />
          ))}
        </div>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glass-card overflow-hidden">
            <div className="skeleton aspect-[4/3] rounded-none" />
            <div className="space-y-3 p-4">
              <div className="skeleton h-4 w-20 rounded-full" />
              <div className="skeleton h-5 w-full" />
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-6 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
