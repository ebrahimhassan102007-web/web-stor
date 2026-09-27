"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import {
  OrderStatusBadge,
  PAYMENT_STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
} from "@/components/order-status";

type AdminOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  customerName: string;
  customerEmail: string;
  totalCents: number;
  createdAt: string;
};

const ACTIONS: Record<string, { action: string; label: string; cls: string }[]> = {
  PENDING_PAYMENT: [{ action: "cancel", label: "إلغاء", cls: "btn-ghost" }],
  PAID: [
    { action: "mark_processing", label: "بدء التنفيذ", cls: "btn-primary" },
    { action: "mark_fulfilled", label: "تم التسليم", cls: "btn-success" },
  ],
  PROCESSING: [{ action: "mark_fulfilled", label: "تم التسليم", cls: "btn-success" }],
  FAILED: [{ action: "retry_fulfillment", label: "إعادة المحاولة", cls: "btn-primary" }],
};

export default function AdminOrdersPage() {
  const [rows, setRows] = useState<AdminOrder[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (p: number) => {
    try {
      const res = await fetch(`/api/admin/orders?page=${p}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setRows(body.data.orders);
        setTotalPages(body.data.totalPages);
      } else {
        setError(body?.error ?? "تعذر تحميل الطلبات.");
      }
    } catch {
      setError("خطأ في الاتصال.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(page);
  }, [load, page]);

  async function act(orderId: string, action: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) await load(page);
      else setError(body?.error ?? "فشلت العملية.");
    } catch {
      setError("خطأ في الاتصال.");
    } finally {
      setBusy(false);
    }
  }

  if (!rows) return <div className="skeleton h-96" />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold">الطلبات</h2>

      {error && (
        <p role="alert" className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {error}
        </p>
      )}

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-right text-xs text-muted">
              <th className="p-3 font-semibold">الطلب</th>
              <th className="p-3 font-semibold">العميل</th>
              <th className="p-3 font-semibold">الحالة</th>
              <th className="p-3 font-semibold">الدفع / التسليم</th>
              <th className="p-3 font-semibold">الإجمالي</th>
              <th className="p-3 font-semibold">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted">
                  لا توجد طلبات.
                </td>
              </tr>
            )}
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="p-3">
                  <span className="font-mono text-xs ltr-inline">{o.orderNumber}</span>
                  <span className="block text-xs text-muted">
                    {new Intl.DateTimeFormat("ar-EG", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(o.createdAt))}
                  </span>
                </td>
                <td className="p-3">
                  <span className="font-semibold">{o.customerName}</span>
                  <span className="block text-xs text-muted ltr-inline">{o.customerEmail}</span>
                </td>
                <td className="p-3"><OrderStatusBadge status={o.status} /></td>
                <td className="p-3 text-xs text-muted whitespace-nowrap">
                  {PAYMENT_STATUS_LABELS[o.paymentStatus] ?? o.paymentStatus}
                  <br />
                  {FULFILLMENT_STATUS_LABELS[o.fulfillmentStatus] ?? o.fulfillmentStatus}
                </td>
                <td className="p-3 font-bold tabular-nums whitespace-nowrap">
                  {formatCents(o.totalCents)}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {(ACTIONS[o.status] ?? []).map((a) => (
                      <button
                        key={a.action}
                        type="button"
                        disabled={busy}
                        onClick={() => act(o.id, a.action)}
                        className={`${a.cls} px-3 py-1.5 text-xs`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
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
