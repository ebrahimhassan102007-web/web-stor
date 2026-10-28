/**
 * Account-area skeleton (shared by the dashboard, orders and wallet routes
 * that stream under /account). Same geometry as the real header + nav so
 * navigation feels instant rather than blank.
 */
export default function AccountLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your account…</span>
      <div className="surface p-6 sm:p-9">
        <div className="skeleton h-3 w-40" />
        <div className="skeleton mt-4 h-9 w-72 max-w-full" />
        <div className="skeleton mt-3 h-4 w-full max-w-lg" />
        <div className="mt-6 flex gap-2">
          <div className="skeleton h-11 w-40" />
          <div className="skeleton h-11 w-32" />
        </div>
      </div>
      <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-12" />
        ))}
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-card p-5">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton mt-3 h-7 w-32" />
            <div className="skeleton mt-3 h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
