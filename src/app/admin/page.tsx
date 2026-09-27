"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import { OrderStatusBadge } from "@/components/order-status";

type Stats = {
  revenueCents: number;
  totalOrders: number;
  fulfilledOrders: number;
  pendingOrders: number;
  failedOrders: number;
  customers: number;
  totalProducts: number;
  activeProducts: number;
  availableCodes: number;
  soldCodes: number;
  lowStock: { id: number; nameAr: string; stock: number; type: string }[];
  recentOrders: {
    orderNumber: string;
    status: string;
    totalCents: number;
    createdAt: string;
  }[];
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/stats", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (!alive) return;
        if (res.ok && body?.ok) setStats(body.data);
        else setError(body?.error ?? "تعذر تحميل الإحصائيات.");
      } catch {
        if (alive) setError("خطأ في الاتصال.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return <p role="alert" className="glass-card p-6 text-sm text-primary">{error}</p>;
  }

  if (!stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: "الإيرادات (مدفوعة)", value: formatCents(stats.revenueCents), accent: true },
    { label: "إجمالي الطلبات", value: String(stats.totalOrders) },
    { label: "طلبات مُسلَّمة", value: String(stats.fulfilledOrders) },
    { label: "بانتظار الدفع", value: String(stats.pendingOrders) },
    { label: "طلبات فاشلة", value: String(stats.failedOrders) },
    { label: "العملاء", value: String(stats.customers) },
    { label: "منتجات نشطة", value: `${stats.activeProducts} / ${stats.totalProducts}` },
    { label: "أكواد متاحة / مباعة", value: `${stats.availableCodes} / ${stats.soldCodes}` },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="glass-card p-5">
            <p className="text-xs text-muted">{c.label}</p>
            <p
              className={`mt-2 text-2xl font-extrabold tabular-nums tracking-tight ${
                c.accent ? "text-primary" : ""
              }`}
            >
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent orders */}
        <section className="glass-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold">أحدث الطلبات</h2>
            <Link href="/admin/orders" className="text-xs font-semibold text-primary hover:underline">
              عرض الكل
            </Link>
          </div>
          {stats.recentOrders.length === 0 ? (
            <p className="mt-4 text-sm text-muted">لا توجد طلبات بعد.</p>
          ) : (
            <ul className="mt-4 divide-y divide-edge text-sm">
              {stats.recentOrders.map((o) => (
                <li key={o.orderNumber} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="font-mono text-xs ltr-inline">{o.orderNumber}</span>
                  <span className="flex items-center gap-3">
                    <OrderStatusBadge status={o.status} />
                    <span className="font-bold tabular-nums">{formatCents(o.totalCents)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Low stock */}
        <section className="glass-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold">مخزون منخفض (≤ 5)</h2>
            <Link href="/admin/products" className="text-xs font-semibold text-primary hover:underline">
              إدارة المنتجات
            </Link>
          </div>
          {stats.lowStock.length === 0 ? (
            <p className="mt-4 text-sm text-success">✓ كل المنتجات النشطة متوفرة.</p>
          ) : (
            <ul className="mt-4 divide-y divide-edge text-sm">
              {stats.lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span>{p.nameAr}</span>
                  <span className={p.stock === 0 ? "badge-red" : "badge-neutral"}>
                    {p.stock === 0 ? "نفد المخزون" : `متبقي ${p.stock}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
