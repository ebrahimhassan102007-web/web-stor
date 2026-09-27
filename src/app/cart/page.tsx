"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/components/store-provider";
import { formatCents } from "@/lib/money";

type CartLine = {
  id: number;
  productId: number;
  nameAr: string;
  slug: string;
  icon: string;
  type: string;
  unitPriceCents: number;
  quantity: number;
  stock: number;
  customerInputs: Record<string, string>;
  lineTotalCents: number;
};

type CartSummary = {
  items: CartLine[];
  itemCount: number;
  subtotalCents: number;
  totalCents: number;
};

const INPUT_LABELS: Record<string, string> = {
  player_id: "معرّف اللاعب",
  phone: "رقم الهاتف",
  account_email: "بريد الحساب",
};

export default function CartPage() {
  const { refreshCart } = useStore();
  const [cart, setCart] = useState<CartSummary | null>(null);
  const [busyLine, setBusyLine] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cart", { cache: "no-store" });
      const body = await res.json();
      if (body?.ok) setCart(body.data);
    } catch {
      setError("تعذر تحميل السلة. يرجى تحديث الصفحة.");
    }
  }, []);

  useEffect(() => {
    // State is set only after the awaited fetch resolves (not synchronously).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function mutate(lineId: number, quantity: number) {
    setBusyLine(lineId);
    setError("");
    try {
      const res = await fetch(`/api/cart/items/${lineId}`, {
        method: quantity <= 0 ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: quantity <= 0 ? undefined : JSON.stringify({ quantity }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setCart(body.data);
        await refreshCart();
      } else {
        setError(body?.error ?? "تعذر تحديث السلة.");
      }
    } catch {
      setError("خطأ في الاتصال. حاول مرة أخرى.");
    } finally {
      setBusyLine(null);
    }
  }

  if (!cart) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="skeleton h-10 w-48" />
        <div className="mt-6 space-y-4">
          <div className="skeleton h-32 w-full" />
          <div className="skeleton h-32 w-full" />
        </div>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="glass-card p-12 text-center">
          <p className="text-5xl" aria-hidden>🛒</p>
          <h1 className="mt-5 text-2xl font-extrabold">السلة فارغة</h1>
          <p className="mt-2 text-sm text-muted">
            تصفح خدماتنا الرقمية وأضف ما يناسبك.
          </p>
          <Link href="/products" className="btn-primary mt-6 px-8">
            تصفح الخدمات
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">
        سلة <span className="text-primary">المشتريات</span>
      </h1>
      <p className="mt-1 text-sm text-muted">
        {cart.itemCount} {cart.itemCount === 1 ? "عنصر" : "عناصر"}
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_22rem]">
        {/* Lines */}
        <div className="space-y-4">
          {cart.items.map((line) => (
            <div key={line.id} className="glass-card card-glow-red flex gap-4 p-4">
              <Link
                href={`/products/${line.slug}`}
                className="product-art h-24 w-24 shrink-0 rounded-xl text-4xl"
                aria-hidden
              >
                {line.icon}
              </Link>

              <div className="flex flex-1 flex-col justify-between gap-2 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/products/${line.slug}`}
                      className="font-bold hover:text-primary transition-colors line-clamp-2"
                    >
                      {line.nameAr}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted">
                      {formatCents(line.unitPriceCents)} للوحدة
                    </p>
                    {Object.entries(line.customerInputs).map(([k, v]) => (
                      <p key={k} className="mt-0.5 text-xs text-muted">
                        {INPUT_LABELS[k] ?? k}:{" "}
                        <span className="ltr-inline text-foreground">{v}</span>
                      </p>
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-label={`حذف ${line.nameAr}`}
                    onClick={() => mutate(line.id, 0)}
                    disabled={busyLine === line.id}
                    className="text-muted hover:text-primary transition-colors text-sm shrink-0"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center rounded-lg border border-edge bg-raised/60">
                    <button
                      type="button"
                      aria-label="زيادة الكمية"
                      onClick={() => mutate(line.id, line.quantity + 1)}
                      disabled={busyLine === line.id || line.quantity >= Math.min(line.stock, 20)}
                      className="h-9 w-9 text-muted hover:text-foreground disabled:opacity-40"
                    >
                      +
                    </button>
                    <span className="w-9 text-center text-sm font-bold tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="تقليل الكمية"
                      onClick={() => mutate(line.id, line.quantity - 1)}
                      disabled={busyLine === line.id}
                      className="h-9 w-9 text-muted hover:text-foreground disabled:opacity-40"
                    >
                      −
                    </button>
                  </div>
                  <span className="font-extrabold tabular-nums">
                    {formatCents(line.lineTotalCents)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <aside className="glass-card h-fit p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-extrabold">ملخص الطلب</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">الإجمالي الفرعي</dt>
              <dd className="font-semibold tabular-nums">
                {formatCents(cart.subtotalCents)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">رسوم التوصيل</dt>
              <dd className="font-semibold text-success">مجاني — تسليم رقمي</dd>
            </div>
            <div className="flex justify-between border-t border-edge pt-3 text-base">
              <dt className="font-extrabold">الإجمالي</dt>
              <dd className="font-extrabold tabular-nums">
                {formatCents(cart.totalCents)}
              </dd>
            </div>
          </dl>

          <Link href="/checkout" className="btn-primary mt-6 w-full py-3">
            🔒 إتمام الشراء
          </Link>
          <Link href="/products" className="btn-ghost mt-3 w-full text-sm">
            متابعة التسوق
          </Link>

          <p className="mt-4 text-center text-xs text-muted">
            جلسة مشفّرة · الأسعار تُحسب على الخادم
          </p>
        </aside>
      </div>
    </div>
  );
}
