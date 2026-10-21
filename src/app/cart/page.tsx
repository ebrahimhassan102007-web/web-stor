"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { useI18n } from "@/components/locale-provider";
import { formatCents } from "@/lib/money";
import {
  fill,
  locName,
  REGION_CODES,
  type RegionCode,
} from "@/lib/i18n/dictionary";

type CartLine = {
  id: number;
  productId: number;
  name: string;
  nameAr: string;
  slug: string;
  icon: string;
  unitPriceCents: number;
  quantity: number;
  stock: number;
  lineTotalCents: number;
  inputType: string;
  inputValue: string | null;
};

type CartSummary = {
  items: CartLine[];
  itemCount: number;
  subtotalCents: number;
  totalCents: number;
};

export default function CartPage() {
  const { refresh } = useCart();
  const { locale, t } = useI18n();
  const [cart, setCart] = useState<CartSummary | null>(null);
  const [busyLine, setBusyLine] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cart", { cache: "no-store" });
      const body = await res.json();
      if (body?.ok) setCart(body.data);
    } catch {
      setError(t.cart.errLoad);
    }
  }, [t]);

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
        await refresh();
      } else {
        setError(body?.error ?? t.cart.errUpdate);
      }
    } catch {
      setError(t.cart.errNetwork);
    } finally {
      setBusyLine(null);
    }
  }

  if (!cart) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 text-center text-muted">
        {t.cart.loading}
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="glass-card p-12 text-center">
          <p className="text-5xl" aria-hidden>🛒</p>
          <h1 className="mt-5 text-2xl font-bold">{t.cart.emptyTitle}</h1>
          <p className="mt-2 text-sm text-muted">{t.cart.emptyText}</p>
          <Link href="/products" className="btn-primary mt-6 px-8">
            {t.cart.browse}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {t.cart.title} <span className="text-primary">{t.cart.titleAccent}</span>
      </h1>
      <p className="mt-1 text-sm text-muted">
        {cart.itemCount === 1
          ? t.cart.itemsCountOne
          : fill(t.cart.itemsCount, { count: cart.itemCount })}
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
                      className="font-semibold hover:text-primary transition-colors line-clamp-2"
                    >
                      {locName(line, locale)}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted">
                      {formatCents(line.unitPriceCents, locale)} {t.cart.each}
                    </p>
                    {line.inputValue && line.inputType === "player-id" && (
                      <p className="mt-1 text-xs text-success font-medium">
                        🎮 {t.cart.sentToPlayer}{" "}
                        <span dir="ltr" className="font-mono">{line.inputValue}</span>
                      </p>
                    )}
                    {line.inputValue && line.inputType === "region" && (
                      <p className="mt-1 text-xs text-success font-medium">
                        🌐 {t.cart.regionTag}{" "}
                        {REGION_CODES.includes(line.inputValue as RegionCode)
                          ? t.regions[line.inputValue as RegionCode]
                          : line.inputValue}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={fill(t.cart.remove, { name: locName(line, locale) })}
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
                      aria-label={t.add.decrease}
                      onClick={() => mutate(line.id, line.quantity - 1)}
                      disabled={busyLine === line.id}
                      className="h-9 w-9 text-muted hover:text-foreground disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-9 text-center text-sm font-semibold tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={t.add.increase}
                      onClick={() => mutate(line.id, line.quantity + 1)}
                      disabled={busyLine === line.id || line.quantity >= Math.min(line.stock, 99)}
                      className="h-9 w-9 text-muted hover:text-foreground disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <span className="font-bold tabular-nums">
                    {formatCents(line.lineTotalCents, locale)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <aside className="glass-card h-fit p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-bold">{t.cart.summary}</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t.cart.subtotal}</dt>
              <dd className="font-medium tabular-nums">
                {formatCents(cart.subtotalCents, locale)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t.cart.delivery}</dt>
              <dd className="font-medium text-success">{t.cart.instantFree}</dd>
            </div>
            <div className="flex justify-between border-t border-edge pt-3 text-base">
              <dt className="font-bold">{t.cart.total}</dt>
              <dd className="font-bold tabular-nums">
                {formatCents(cart.totalCents, locale)}
              </dd>
            </div>
          </dl>

          <Link href="/checkout" className="btn-primary mt-6 w-full py-3">
            {t.cart.checkoutBtn}
          </Link>
          <Link href="/products" className="btn-ghost mt-3 w-full text-sm">
            {t.cart.continueShopping}
          </Link>

          <p className="mt-4 text-center text-xs text-muted">{t.cart.note}</p>
        </aside>
      </div>
    </div>
  );
}
