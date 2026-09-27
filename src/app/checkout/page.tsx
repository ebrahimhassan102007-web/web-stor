"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { checkoutSchema } from "@/lib/validation";
import { formatCents } from "@/lib/money";

type CartSummary = {
  items: { id: number; name: string; quantity: number; lineTotalCents: number }[];
  itemCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
};

const FIELDS = [
  { name: "customerName", label: "Full name", placeholder: "Ada Lovelace", autoComplete: "name", half: false },
  { name: "email", label: "Email address", placeholder: "ada@example.com", autoComplete: "email", type: "email", half: false },
  { name: "addressLine1", label: "Address line 1", placeholder: "1 Cipher Street", autoComplete: "address-line1", half: false },
  { name: "addressLine2", label: "Address line 2 (optional)", placeholder: "Apt 4B", autoComplete: "address-line2", half: false },
  { name: "city", label: "City", placeholder: "London", autoComplete: "address-level2", half: true },
  { name: "postalCode", label: "Postal code", placeholder: "EC1A 1BB", autoComplete: "postal-code", half: true },
  { name: "country", label: "Country", placeholder: "United Kingdom", autoComplete: "country-name", half: false },
] as const;

export default function CheckoutPage() {
  const router = useRouter();
  const { refresh } = useCart();
  const [cart, setCart] = useState<CartSummary | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cart", { cache: "no-store" });
      const body = await res.json();
      if (body?.ok) setCart(body.data);
    } catch {
      setFormError("Could not load your cart. Please refresh.");
    }
  }, []);

  useEffect(() => {
    // State is set only after the awaited fetch resolves (not synchronously).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError("");
    setFieldErrors({});

    // Client-side validation with the SAME Zod schema the server enforces.
    const parsed = checkoutSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        await refresh();
        router.push(
          `/checkout/success?order=${encodeURIComponent(body.data.orderNumber)}`,
        );
        return;
      }
      if (body?.details) setFieldErrors(body.details);
      setFormError(body?.error ?? "Checkout failed. Please try again.");
      setSubmitting(false);
    } catch {
      setFormError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (!cart) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 text-center text-muted">
        Loading checkout…
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="glass-card p-12 text-center">
          <p className="text-5xl" aria-hidden>🛒</p>
          <h1 className="mt-5 text-2xl font-bold">Nothing to check out</h1>
          <p className="mt-2 text-sm text-muted">Your cart is empty.</p>
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
        Secure <span className="text-primary">Checkout</span>
      </h1>
      <p className="mt-2 flex items-center gap-2 text-sm text-muted">
        <span className="badge-green">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> Encrypted session
        </span>
        No payment card required for this demo order.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_24rem]">
        {/* Shipping form */}
        <form onSubmit={submit} noValidate className="glass-card p-6 sm:p-8">
          <h2 className="text-lg font-bold">Shipping Details</h2>

          {formError && (
            <p role="alert" className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
              {formError}
            </p>
          )}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.name} className={f.half ? "" : "sm:col-span-2"}>
                <label
                  htmlFor={f.name}
                  className="mb-1.5 block text-sm font-medium"
                >
                  {f.label}
                </label>
                <input
                  id={f.name}
                  name={f.name}
                  type={"type" in f ? f.type : "text"}
                  autoComplete={f.autoComplete}
                  placeholder={f.placeholder}
                  maxLength={256}
                  value={values[f.name] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.name]: e.target.value }))
                  }
                  aria-invalid={Boolean(fieldErrors[f.name])}
                  className={`input-dark ${
                    fieldErrors[f.name]
                      ? "!border-primary/60 !shadow-[0_0_0_3px_rgba(239,68,68,0.12)]"
                      : ""
                  }`}
                />
                {fieldErrors[f.name] && (
                  <p role="alert" className="mt-1.5 text-xs text-primary">
                    {fieldErrors[f.name][0]}
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary mt-8 w-full py-3.5 text-base"
          >
            {submitting
              ? "Placing order…"
              : `🔒 Place Order · ${formatCents(cart.totalCents)}`}
          </button>

          <p className="mt-4 text-center text-xs text-muted">
            Inputs are validated client-side and re-validated server-side.
            Totals are always computed from the database.
          </p>
        </form>

        {/* Order summary */}
        <aside className="glass-card h-fit p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-bold">Your Order</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {cart.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="text-muted">
                  {item.name}{" "}
                  <span className="text-foreground font-medium">
                    ×{item.quantity}
                  </span>
                </span>
                <span className="font-medium tabular-nums shrink-0">
                  {formatCents(item.lineTotalCents)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-5 space-y-3 border-t border-edge pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular-nums">{formatCents(cart.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Shipping</dt>
              <dd className="tabular-nums">
                {cart.shippingCents === 0 ? (
                  <span className="text-success">Free</span>
                ) : (
                  formatCents(cart.shippingCents)
                )}
              </dd>
            </div>
            <div className="flex justify-between border-t border-edge pt-3 text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCents(cart.totalCents)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
