"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { formatCents } from "@/lib/money";
import { fetchCartSummary } from "@/lib/client/cart-load";

type CartLine = {
  id: number;
  productId: number;
  name: string;
  slug: string;
  icon: string;
  unitPriceCents: number;
  quantity: number;
  stock: number;
  lineTotalCents: number;
};

type CartSummary = {
  items: CartLine[];
  itemCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
};

export default function CartPage() {
  const { refresh } = useCart();
  const [cart, setCart] = useState<CartSummary | null>(null);
  const [busyLine, setBusyLine] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setCart(await fetchCartSummary<CartSummary>());
    } catch {
      // Covers network/HTTP failures and 200 responses carrying { ok: false }.
      setError("Could not load your cart. Please try again.");
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
        await refresh();
      } else {
        setError(body?.error ?? "Could not update the cart.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyLine(null);
    }
  }

  if (!cart) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 text-center text-muted">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              type="button"
              className="btn-primary mt-4 px-8"
              onClick={() => void load()}
            >
              Try again
            </button>
          </>
        ) : (
          "Loading your cart…"
        )}
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="glass-card p-12 text-center">
          <p className="text-5xl" aria-hidden>🛒</p>
          <h1 className="mt-5 text-2xl font-bold">Your cart is empty</h1>
          <p className="mt-2 text-sm text-muted">
            Browse the catalog and find something worth securing.
          </p>
          <Link href="/products" className="btn-primary mt-6 px-8">
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">
        Shopping <span className="text-primary">Cart</span>
      </h1>
      <p className="mt-1 text-sm text-muted">
        {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
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
                      {line.name}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted">
                      {formatCents(line.unitPriceCents)} each
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${line.name}`}
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
                      aria-label="Decrease quantity"
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
                      aria-label="Increase quantity"
                      onClick={() => mutate(line.id, line.quantity + 1)}
                      disabled={busyLine === line.id || line.quantity >= Math.min(line.stock, 99)}
                      className="h-9 w-9 text-muted hover:text-foreground disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <span className="font-bold tabular-nums">
                    {formatCents(line.lineTotalCents)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <aside className="glass-card h-fit p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-bold">Order Summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="font-medium tabular-nums">
                {formatCents(cart.subtotalCents)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Shipping</dt>
              <dd className="font-medium tabular-nums">
                {cart.shippingCents === 0 ? (
                  <span className="text-success">Free</span>
                ) : (
                  formatCents(cart.shippingCents)
                )}
              </dd>
            </div>
            <div className="flex justify-between border-t border-edge pt-3 text-base">
              <dt className="font-bold">Total</dt>
              <dd className="font-bold tabular-nums">
                {formatCents(cart.totalCents)}
              </dd>
            </div>
          </dl>

          <Link href="/checkout" className="btn-primary mt-6 w-full py-3">
            🔒 Secure Checkout
          </Link>
          <Link href="/products" className="btn-ghost mt-3 w-full text-sm">
            Continue shopping
          </Link>

          <p className="mt-4 text-center text-xs text-muted">
            Encrypted session · no card data stored
          </p>
        </aside>
      </div>
    </div>
  );
}
