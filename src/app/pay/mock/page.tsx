"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

/**
 * DEVELOPMENT payment simulator page.
 *
 * Stands in for a hosted payment page (e.g. Stripe Checkout) so the full
 * order → payment → fulfillment pipeline can be exercised without real
 * credentials. The confirm action calls a server endpoint that verifies an
 * HMAC signature and transitions the order — the browser itself proves
 * nothing. The backing mock provider refuses to run in production.
 */
function MockPayInner() {
  const params = useSearchParams();
  const router = useRouter();
  const orderNumber = params.get("order") ?? "";
  const sig = params.get("sig") ?? "";
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const [error, setError] = useState("");

  async function act(action: "confirm" | "cancel") {
    if (busy) return;
    setBusy(action);
    setError("");
    try {
      const res = await fetch("/api/payments/mock/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: orderNumber, sig, action }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        router.push(
          action === "confirm"
            ? `/account/orders/${encodeURIComponent(orderNumber)}`
            : "/products",
        );
        return;
      }
      setError(body?.error ?? "تعذر تنفيذ العملية.");
      setBusy(null);
    } catch {
      setError("خطأ في الاتصال. حاول مرة أخرى.");
      setBusy(null);
    }
  }

  if (!orderNumber || !sig) {
    return (
      <div className="glass-card p-12 text-center">
        <h1 className="text-2xl font-extrabold">رابط دفع غير صالح</h1>
        <Link href="/cart" className="btn-primary mt-6 px-8">العودة للسلة</Link>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="border-b border-edge bg-primary/5 px-6 py-4 text-center">
        <span className="badge-red">وضع تجريبي — لا يتم خصم أموال حقيقية</span>
      </div>
      <div className="p-8 sm:p-12 text-center">
        <p className="text-5xl" aria-hidden>💳</p>
        <h1 className="mt-5 text-2xl font-extrabold">صفحة الدفع التجريبية</h1>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          هذه محاكاة لصفحة دفع خارجية (مثل Stripe Checkout) لأغراض التطوير.
          <br />
          الطلب: <span className="ltr-inline font-mono text-foreground">{orderNumber}</span>
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
          <button
            type="button"
            onClick={() => act("confirm")}
            disabled={busy !== null}
            className="btn-success px-8 py-3"
          >
            {busy === "confirm" ? "جارٍ التأكيد…" : "✓ تأكيد الدفع (تجريبي)"}
          </button>
          <button
            type="button"
            onClick={() => act("cancel")}
            disabled={busy !== null}
            className="btn-ghost px-8 py-3"
          >
            {busy === "cancel" ? "جارٍ الإلغاء…" : "إلغاء الطلب"}
          </button>
        </div>

        <p className="mt-6 text-xs text-muted">
          في الإنتاج، تُستبدل هذه الصفحة ببوابة دفع حقيقية ويُؤكَّد الدفع عبر
          Webhook موقّع يتحقق منه الخادم.
        </p>
      </div>
    </div>
  );
}

export default function MockPayPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <Suspense>
        <MockPayInner />
      </Suspense>
    </div>
  );
}
