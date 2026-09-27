"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import { TYPE_LABELS } from "@/components/product-card";

type AdminProduct = {
  product: {
    id: number;
    slug: string;
    nameAr: string;
    nameEn: string;
    type: string;
    categoryId: number;
    priceCents: number;
    originalPriceCents: number | null;
    stock: number;
    icon: string;
    featured: boolean;
    active: boolean;
  };
  categoryNameAr: string;
  availableCodes: number;
};

type AdminCategory = { id: number; nameAr: string };

const PRODUCT_TYPES = Object.keys(TYPE_LABELS);

function egp(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toString();
}
function toCents(v: string): number | null {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export default function AdminProductsPage() {
  const [rows, setRows] = useState<AdminProduct[] | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openEditor, setOpenEditor] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        fetch("/api/admin/products", { cache: "no-store" }),
        fetch("/api/admin/categories", { cache: "no-store" }),
      ]);
      const pBody = await pRes.json().catch(() => null);
      const cBody = await cRes.json().catch(() => null);
      if (pRes.ok && pBody?.ok) setRows(pBody.data.products);
      else setError(pBody?.error ?? "تعذر تحميل المنتجات.");
      if (cRes.ok && cBody?.ok) setCategories(cBody.data.categories);
    } catch {
      setError("خطأ في الاتصال.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function api(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<boolean> {
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

  if (!rows) {
    return <div className="skeleton h-96" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold">المنتجات ({rows.length})</h2>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="btn-primary px-5 py-2 text-sm"
        >
          {showCreate ? "إغلاق" : "+ منتج جديد"}
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
        <CreateProductForm
          categories={categories}
          busy={busy}
          onSubmit={async (payload) => {
            const ok = await api("/api/admin/products", "POST", payload);
            if (ok) {
              setShowCreate(false);
              setNotice("تم إنشاء المنتج.");
            }
          }}
        />
      )}

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-right text-xs text-muted">
              <th className="p-3 font-semibold">المنتج</th>
              <th className="p-3 font-semibold">النوع</th>
              <th className="p-3 font-semibold">السعر</th>
              <th className="p-3 font-semibold">المخزون</th>
              <th className="p-3 font-semibold">الحالة</th>
              <th className="p-3 font-semibold">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {rows.map((row) => (
              <ProductRow
                key={row.product.id}
                row={row}
                busy={busy}
                editing={openEditor === row.product.id}
                onToggleEdit={() =>
                  setOpenEditor((v) => (v === row.product.id ? null : row.product.id))
                }
                onPatch={async (patch) => {
                  const ok = await api(
                    `/api/admin/products/${row.product.id}`,
                    "PATCH",
                    patch,
                  );
                  if (ok) setNotice("تم حفظ التعديلات.");
                  return ok;
                }}
                onAddCodes={async (codes) => {
                  const ok = await api(
                    `/api/admin/products/${row.product.id}/codes`,
                    "POST",
                    { codes },
                  );
                  if (ok) setNotice(`تمت إضافة ${codes.length} كود.`);
                  return ok;
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductRow({
  row,
  busy,
  editing,
  onToggleEdit,
  onPatch,
  onAddCodes,
}: {
  row: AdminProduct;
  busy: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  onPatch: (patch: Record<string, unknown>) => Promise<boolean>;
  onAddCodes: (codes: string[]) => Promise<boolean>;
}) {
  const p = row.product;
  const [price, setPrice] = useState(egp(p.priceCents));
  const [original, setOriginal] = useState(egp(p.originalPriceCents));
  const [stock, setStock] = useState(String(p.stock));
  const [codesText, setCodesText] = useState("");

  return (
    <>
      <tr>
        <td className="p-3">
          <span aria-hidden className="ml-2">{p.icon}</span>
          <span className="font-semibold">{p.nameAr}</span>
          <span className="block text-xs text-muted ltr-inline">{p.slug}</span>
        </td>
        <td className="p-3 whitespace-nowrap">
          {TYPE_LABELS[p.type] ?? p.type}
          {p.type === "DIGITAL_CODE" && (
            <span className="block text-xs text-muted">
              أكواد متاحة: {row.availableCodes}
            </span>
          )}
        </td>
        <td className="p-3 whitespace-nowrap font-bold tabular-nums">
          {formatCents(p.priceCents)}
        </td>
        <td className="p-3">
          <span className={p.stock === 0 ? "badge-red" : p.stock <= 5 ? "badge-neutral" : "badge-green"}>
            {p.stock}
          </span>
        </td>
        <td className="p-3 whitespace-nowrap">
          <button
            type="button"
            disabled={busy}
            onClick={() => onPatch({ active: !p.active })}
            className={p.active ? "badge-green" : "badge-red"}
            title="تبديل التفعيل"
          >
            {p.active ? "نشط" : "موقوف"}
          </button>{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => onPatch({ featured: !p.featured })}
            className={p.featured ? "badge-red" : "badge-neutral"}
            title="تبديل التمييز"
          >
            {p.featured ? "★ مميز" : "☆ عادي"}
          </button>
        </td>
        <td className="p-3">
          <button type="button" onClick={onToggleEdit} className="btn-ghost px-3 py-1.5 text-xs">
            {editing ? "إغلاق" : "تعديل"}
          </button>
        </td>
      </tr>

      {editing && (
        <tr>
          <td colSpan={6} className="bg-raised/40 p-4">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const patch: Record<string, unknown> = {};
                const pc = toCents(price);
                if (pc !== null && pc !== p.priceCents) patch.priceCents = pc;
                const oc = original.trim() === "" ? null : toCents(original);
                if (oc !== p.originalPriceCents) patch.originalPriceCents = oc;
                const st = Number.parseInt(stock, 10);
                if (Number.isFinite(st) && st !== p.stock) patch.stock = st;
                if (Object.keys(patch).length > 0) await onPatch(patch);
              }}
            >
              <label className="text-xs font-semibold">
                السعر (ج.م)
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  className="input-dark mt-1 w-28"
                />
              </label>
              <label className="text-xs font-semibold">
                السعر قبل الخصم (اختياري)
                <input
                  value={original}
                  onChange={(e) => setOriginal(e.target.value)}
                  inputMode="decimal"
                  className="input-dark mt-1 w-28"
                />
              </label>
              <label className="text-xs font-semibold">
                المخزون
                <input
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  inputMode="numeric"
                  className="input-dark mt-1 w-24"
                />
              </label>
              <button type="submit" disabled={busy} className="btn-primary px-5 py-2 text-sm">
                حفظ
              </button>
            </form>

            {p.type === "DIGITAL_CODE" && (
              <form
                className="mt-4 border-t border-edge pt-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const codes = codesText
                    .split("\n")
                    .map((c) => c.trim())
                    .filter(Boolean);
                  if (codes.length === 0) return;
                  const ok = await onAddCodes(codes);
                  if (ok) setCodesText("");
                }}
              >
                <label className="text-xs font-semibold">
                  إضافة أكواد رقمية (كود في كل سطر — تُشفَّر قبل الحفظ ولا تُعرض مرة أخرى)
                  <textarea
                    value={codesText}
                    onChange={(e) => setCodesText(e.target.value)}
                    rows={4}
                    dir="ltr"
                    className="input-dark mt-1 font-mono text-xs"
                    placeholder={"XXXX-XXXX-XXXX\nYYYY-YYYY-YYYY"}
                  />
                </label>
                <button type="submit" disabled={busy} className="btn-primary mt-2 px-5 py-2 text-sm">
                  رفع الأكواد
                </button>
              </form>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function CreateProductForm({
  categories,
  busy,
  onSubmit,
}: {
  categories: AdminCategory[];
  busy: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    slug: "",
    nameAr: "",
    nameEn: "",
    type: "DIGITAL_CODE",
    categoryId: categories[0]?.id ?? 0,
    price: "",
    originalPrice: "",
    stock: "0",
    icon: "🎁",
    shortDescription: "",
    description: "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <form
      className="glass-card grid gap-3 p-5 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit({
          slug: form.slug,
          nameAr: form.nameAr,
          nameEn: form.nameEn,
          type: form.type,
          categoryId: Number(form.categoryId),
          priceCents: toCents(form.price) ?? 0,
          originalPriceCents:
            form.originalPrice.trim() === "" ? null : toCents(form.originalPrice),
          stock: Number.parseInt(form.stock, 10) || 0,
          icon: form.icon,
          shortDescription: form.shortDescription,
          description: form.description,
          featured: false,
          active: true,
        });
      }}
    >
      <label className="text-xs font-semibold">
        المعرف (slug)
        <input required dir="ltr" value={form.slug} onChange={(e) => set("slug", e.target.value)} className="input-dark mt-1" placeholder="my-product" />
      </label>
      <label className="text-xs font-semibold">
        الاسم بالعربية
        <input required value={form.nameAr} onChange={(e) => set("nameAr", e.target.value)} className="input-dark mt-1" />
      </label>
      <label className="text-xs font-semibold">
        الاسم بالإنجليزية (اختياري)
        <input dir="ltr" value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} className="input-dark mt-1" />
      </label>
      <label className="text-xs font-semibold">
        النوع
        <select value={form.type} onChange={(e) => set("type", e.target.value)} className="input-dark mt-1">
          {PRODUCT_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold">
        التصنيف
        <select value={form.categoryId} onChange={(e) => set("categoryId", Number(e.target.value))} className="input-dark mt-1">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.nameAr}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold">
        الأيقونة (إيموجي)
        <input required value={form.icon} onChange={(e) => set("icon", e.target.value)} className="input-dark mt-1 w-24" />
      </label>
      <label className="text-xs font-semibold">
        السعر (ج.م)
        <input required inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} className="input-dark mt-1" />
      </label>
      <label className="text-xs font-semibold">
        السعر قبل الخصم (اختياري)
        <input inputMode="decimal" value={form.originalPrice} onChange={(e) => set("originalPrice", e.target.value)} className="input-dark mt-1" />
      </label>
      <label className="text-xs font-semibold">
        المخزون الابتدائي
        <input inputMode="numeric" value={form.stock} onChange={(e) => set("stock", e.target.value)} className="input-dark mt-1" />
      </label>
      <label className="text-xs font-semibold sm:col-span-2">
        وصف مختصر
        <input value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} className="input-dark mt-1" />
      </label>
      <label className="text-xs font-semibold sm:col-span-2">
        الوصف الكامل
        <textarea required rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} className="input-dark mt-1" />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className="btn-primary px-6 py-2.5 text-sm">
          {busy ? "جارٍ الحفظ…" : "إنشاء المنتج"}
        </button>
      </div>
    </form>
  );
}
