"use client";

import { useCallback, useEffect, useState } from "react";

type AdminCategory = {
  id: number;
  slug: string;
  nameAr: string;
  nameEn: string;
  description: string;
  icon: string;
  sortOrder: number;
  visible: boolean;
  productCount: number;
};

export default function AdminCategoriesPage() {
  const [rows, setRows] = useState<AdminCategory[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ slug: "", nameAr: "", icon: "🗂️", sortOrder: "0" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/categories", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) setRows(body.data.categories);
      else setError(body?.error ?? "تعذر تحميل التصنيفات.");
    } catch {
      setError("خطأ في الاتصال.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function api(path: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const resBody = await res.json().catch(() => null);
      if (res.ok && resBody?.ok) {
        await load();
        return true;
      }
      setError(resBody?.error ?? "فشلت العملية.");
      return false;
    } catch {
      setError("خطأ في الاتصال.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!rows) return <div className="skeleton h-80" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold">التصنيفات ({rows.length})</h2>
        <button type="button" onClick={() => setShowCreate((v) => !v)} className="btn-primary px-5 py-2 text-sm">
          {showCreate ? "إغلاق" : "+ تصنيف جديد"}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </p>
      )}

      {showCreate && (
        <form
          className="glass-card flex flex-wrap items-end gap-3 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await api("/api/admin/categories", "POST", {
              slug: form.slug,
              nameAr: form.nameAr,
              icon: form.icon,
              sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
            });
            if (ok) {
              setShowCreate(false);
              setForm({ slug: "", nameAr: "", icon: "🗂️", sortOrder: "0" });
              setNotice("تم إنشاء التصنيف.");
            }
          }}
        >
          <label className="text-xs font-semibold">
            المعرف (slug)
            <input required dir="ltr" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} className="input-dark mt-1 w-40" />
          </label>
          <label className="text-xs font-semibold">
            الاسم بالعربية
            <input required value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} className="input-dark mt-1 w-48" />
          </label>
          <label className="text-xs font-semibold">
            الأيقونة
            <input required value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} className="input-dark mt-1 w-20" />
          </label>
          <label className="text-xs font-semibold">
            الترتيب
            <input inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} className="input-dark mt-1 w-20" />
          </label>
          <button type="submit" disabled={busy} className="btn-primary px-5 py-2 text-sm">
            إنشاء
          </button>
        </form>
      )}

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-right text-xs text-muted">
              <th className="p-3 font-semibold">التصنيف</th>
              <th className="p-3 font-semibold">المنتجات</th>
              <th className="p-3 font-semibold">الترتيب</th>
              <th className="p-3 font-semibold">الظهور</th>
              <th className="p-3 font-semibold">حذف</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="p-3">
                  <span aria-hidden className="ml-2">{c.icon}</span>
                  <span className="font-semibold">{c.nameAr}</span>
                  <span className="block text-xs text-muted ltr-inline">{c.slug}</span>
                </td>
                <td className="p-3 tabular-nums">{c.productCount}</td>
                <td className="p-3">
                  <SortOrderCell
                    value={c.sortOrder}
                    busy={busy}
                    onSave={(v) => api(`/api/admin/categories/${c.id}`, "PATCH", { sortOrder: v })}
                  />
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => api(`/api/admin/categories/${c.id}`, "PATCH", { visible: !c.visible })}
                    className={c.visible ? "badge-green" : "badge-red"}
                  >
                    {c.visible ? "ظاهر" : "مخفي"}
                  </button>
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    disabled={busy || c.productCount > 0}
                    title={c.productCount > 0 ? "لا يمكن حذف تصنيف يحتوي على منتجات" : "حذف"}
                    onClick={async () => {
                      const ok = await api(`/api/admin/categories/${c.id}`, "DELETE");
                      if (ok) setNotice("تم حذف التصنيف.");
                    }}
                    className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-30"
                  >
                    حذف
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortOrderCell({
  value,
  busy,
  onSave,
}: {
  value: number;
  busy: boolean;
  onSave: (v: number) => Promise<boolean>;
}) {
  const [v, setV] = useState(String(value));
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const n = Number.parseInt(v, 10);
        if (Number.isFinite(n) && n !== value) await onSave(n);
      }}
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        inputMode="numeric"
        aria-label="ترتيب التصنيف"
        className="input-dark w-16 py-1.5 text-center text-xs"
      />
      <button type="submit" disabled={busy} className="btn-ghost px-2.5 py-1.5 text-xs">
        حفظ
      </button>
    </form>
  );
}
