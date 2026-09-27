"use client";

import { useCallback, useEffect, useState } from "react";

type AuditEntry = {
  id: number;
  action: string;
  targetType: string;
  targetId: string;
  meta: Record<string, unknown> | null;
  adminEmail: string | null;
  createdAt: string;
};

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");

  const load = useCallback(async (p: number) => {
    try {
      const res = await fetch(`/api/admin/audit?page=${p}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setRows(body.data.entries);
        setTotalPages(body.data.totalPages);
      } else {
        setError(body?.error ?? "تعذر تحميل السجل.");
      }
    } catch {
      setError("خطأ في الاتصال.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(page);
  }, [load, page]);

  if (!rows) return <div className="skeleton h-96" />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold">سجل نشاط المشرفين</h2>
        <p className="mt-1 text-xs text-muted">
          كل إجراء إداري يُسجَّل تلقائياً ولا يمكن تعديله من الواجهة.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {error}
        </p>
      )}

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-right text-xs text-muted">
              <th className="p-3 font-semibold">الوقت</th>
              <th className="p-3 font-semibold">المشرف</th>
              <th className="p-3 font-semibold">الإجراء</th>
              <th className="p-3 font-semibold">الهدف</th>
              <th className="p-3 font-semibold">تفاصيل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted">
                  لا توجد سجلات بعد.
                </td>
              </tr>
            )}
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="p-3 text-xs text-muted whitespace-nowrap">
                  {new Intl.DateTimeFormat("ar-EG", {
                    dateStyle: "short",
                    timeStyle: "medium",
                  }).format(new Date(e.createdAt))}
                </td>
                <td className="p-3 text-xs ltr-inline">{e.adminEmail ?? "—"}</td>
                <td className="p-3">
                  <span className="badge-neutral font-mono text-xs">{e.action}</span>
                </td>
                <td className="p-3 text-xs text-muted">
                  {e.targetType} <span className="ltr-inline">#{e.targetId}</span>
                </td>
                <td className="p-3 text-xs text-muted max-w-64">
                  {e.meta ? (
                    <code dir="ltr" className="block truncate font-mono text-[11px]">
                      {JSON.stringify(e.meta)}
                    </code>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost px-4 py-2 text-sm disabled:opacity-30">
            السابق
          </button>
          <span className="badge-neutral px-4 py-2">صفحة {page} من {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-ghost px-4 py-2 text-sm disabled:opacity-30">
            التالي
          </button>
        </div>
      )}
    </div>
  );
}
