"use client";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="admin-page-stack">
      <section className="admin-panel admin-error-panel" role="alert">
        <span className="admin-error-icon" aria-hidden="true">!</span>
        <p className="admin-section-kicker">E‑VORA / ADMIN</p>
        <h1>Couldn’t load the workspace <span aria-hidden="true">·</span> تعذّر تحميل لوحة المتجر</h1>
        <p>Try again. If the issue continues, check the store database connection. جرّب مرة أخرى، وإذا استمرت المشكلة راجع اتصال قاعدة البيانات.</p>
        <button className="admin-button-primary" onClick={reset}>Try again · إعادة المحاولة</button>
      </section>
    </div>
  );
}
