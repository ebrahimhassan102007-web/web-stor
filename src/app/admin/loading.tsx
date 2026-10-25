export default function AdminLoading() {
  return (
    <div className="admin-page-stack" aria-label="Loading admin workspace" aria-busy="true">
      <div className="admin-skeleton-heading"><span /><span /><span /></div>
      <div className="admin-skeleton-hero" />
      <div className="admin-metrics-grid">{[0, 1, 2, 3].map((item) => <div className="admin-skeleton-metric" key={item}><span /><span /><span /></div>)}</div>
      <div className="admin-overview-grid"><div className="admin-skeleton-panel" /><div className="admin-skeleton-panel" /></div>
      <span className="sr-only">Loading store workspace…</span>
    </div>
  );
}
