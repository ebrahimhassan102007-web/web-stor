"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/components/store-provider";
import { formatCents } from "@/lib/money";

type CartSummary = {
  items: { id: number; nameAr: string; quantity: number; lineTotalCents: number }[];
  itemCount: number;
  subtotalCents: number;
  totalCents: number;
};

export default function CheckoutPage() {
  const router = useRouter();
  const { user, userLoaded, refreshCart } = useStore();
  const [cart, setCart] = useState<CartSummary | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // One key per checkout attempt → duplicate submits are idempotent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdempotencyKey(crypto.randomUUID());
  }, []);

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

  async function submit() {
    if (submitting || !idempotencyKey) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        await refreshCart();
        router.push(body.data.redirectUrl ?? "/account");
        return;
      }
      setError(body?.error ?? "تعذر إنشاء الطلب. حاول مرة أخرى.");
      setSubmitting(false);
    } catch {
      setError("خطأ في الاتصال. حاول مرة أخرى.");
      setSubmitting(false);
    }
  }

  /* ---------- Login gate ---------- */
  if (userLoaded && !user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="glass-card p-12 text-center">
          <p className="text-5xl" aria-hidden>🔐</p>
          <h1 className="mt-5 text-2xl font-extrabold">سجّل الدخول أولاً</h1>
          <p className="mt-2 text-sm text-muted">
            المنتجات الرقمية تُسلَّم داخل حسابك — سجّل الدخول أو أنشئ حساباً
            لإتمام الشراء.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <Link href="/login?next=/checkout" className="btn-primary px-8">
              تسجيل الدخول
            </Link>
            <Link href="/register?next=/checkout" className="btn-ghost px-8">
              إنشاء حساب جديد
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!userLoaded || !cart) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="skeleton h-10 w-56" />
        <div className="mt-6 skeleton h-64 w-full" />
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="glass-card p-12 text-center">
          <p className="text-5xl" aria-hidden>🛒</p>
          <h1 className="mt-5 text-2xl font-extrabold">السلة فارغة</h1>
          <p className="mt-2 text-sm text-muted">لا يوجد ما يمكن شراؤه.</p>
          <Link href="/products" className="btn-primary mt-6 px-8">
            تصفح الخدمات
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">
        إتمام <span className="text-primary">الشراء</span>
      </h1>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="badge-green">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> جلسة آمنة
        </span>
        الطلب باسم <span className="font-semibold text-foreground">{user?.name}</span>
        <span className="ltr-inline">({user?.email})</span>
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {error}
        </p>
      )}

      <div className="mt-8 glass-card p-6 sm:p-8">
        <h2 className="text-lg font-extrabold">مراجعة الطلب</h2>
        <ul className="mt-4 divide-y divide-edge text-sm">
          {cart.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 py-3">
              <span className="text-muted">
                {item.nameAr}{" "}
                <span className="text-foreground font-semibold">×{item.quantity}</span>
              </span>
              <span className="font-semibold tabular-nums shrink-0">
                {formatCents(item.lineTotalCents)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-2 border-t border-edge pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">الإجمالي الفرعي</dt>
            <dd className="tabular-nums">{formatCents(cart.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">التسليم</dt>
            <dd className="text-success font-semibold">رقمي — فوري</dd>
          </div>
          <div className="flex justify-between pt-2 text-base font-extrabold">
            <dt>الإجمالي</dt>
            <dd className="tabular-nums">{formatCents(cart.totalCents)}</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="btn-primary mt-8 w-full py-3.5 text-base"
        >
          {submitting ? "جارٍ إنشاء الطلب…" : `المتابعة إلى الدفع · ${formatCents(cart.totalCents)}`}
        </button>

        <p className="mt-4 text-center text-xs text-muted">
          الأسعار والإجماليات تُحسب على الخادم من قاعدة البيانات، ويُؤكَّد
          الدفع على الخادم فقط.
        </p>
      </div>
    </div>
  );
}
