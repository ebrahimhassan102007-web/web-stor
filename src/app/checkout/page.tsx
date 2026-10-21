"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { useI18n } from "@/components/locale-provider";
import { checkoutSchema } from "@/lib/validation";
import { formatCents } from "@/lib/money";
import { fetchCartSummary } from "@/lib/client/cart-load";
import {
  fill,
  locName,
  REGION_CODES,
  type RegionCode,
} from "@/lib/i18n/dictionary";

type CartSummary = {
  items: {
    id: number;
    name: string;
    nameAr: string;
    quantity: number;
    lineTotalCents: number;
    inputType: string;
    inputValue: string | null;
  }[];
  itemCount: number;
  subtotalCents: number;
  totalCents: number;
};

export default function CheckoutPage() {
  const router = useRouter();
  const { refresh } = useCart();
  const { locale, t } = useI18n();
  const [cart, setCart] = useState<CartSummary | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setFormError("");
    try {
      setCart(await fetchCartSummary<CartSummary>());
    } catch {
      setFormError(t.checkout.errLoad);
    }
  }, [t]);

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

    // Client-side validation with the SAME Zod schema the server enforces,
    // with localized messages for the two fields we collect.
    const parsed = checkoutSchema.safeParse(values);
    if (!parsed.success) {
      const raw = parsed.error.flatten().fieldErrors as Record<string, string[]>;
      const localized: Record<string, string[]> = { ...raw };
      if (raw.customerName) localized.customerName = [t.checkout.errName];
      if (raw.email) localized.email = [t.checkout.errEmail];
      setFieldErrors(localized);
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
      setFormError(body?.error ?? t.checkout.errGeneric);
      setSubmitting(false);
    } catch {
      setFormError(t.checkout.errNetwork);
      setSubmitting(false);
    }
  }

  if (!cart) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 text-center text-muted">
        {formError ? (
          <>
            <p role="alert">{formError}</p>
            <button type="button" className="btn-primary mt-4 px-8" onClick={() => void load()}>
              {t.checkout.retry}
            </button>
          </>
        ) : t.checkout.loading}
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="glass-card p-12 text-center">
          <p className="text-5xl" aria-hidden>🛒</p>
          <h1 className="mt-5 text-2xl font-bold">{t.checkout.nothingTitle}</h1>
          <p className="mt-2 text-sm text-muted">{t.checkout.nothingText}</p>
          <Link href="/products" className="btn-primary mt-6 px-8">
            {t.cart.browse}
          </Link>
        </div>
      </div>
    );
  }

  const FIELDS = [
    {
      name: "customerName",
      label: t.checkout.fullName,
      placeholder: t.checkout.namePlaceholder,
      autoComplete: "name",
      type: "text",
    },
    {
      name: "email",
      label: t.checkout.email,
      placeholder: t.checkout.emailPlaceholder,
      autoComplete: "email",
      type: "email",
    },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {t.checkout.title} <span className="text-primary">{t.checkout.titleAccent}</span>
      </h1>
      <p className="mt-2 flex items-center gap-2 text-sm text-muted flex-wrap">
        <span className="badge-green">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> {t.checkout.encrypted}
        </span>
        {t.checkout.demoNote}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_24rem]">
        {/* Delivery form */}
        <form onSubmit={submit} noValidate className="glass-card p-6 sm:p-8">
          <h2 className="text-lg font-bold">📧 {t.checkout.detailsTitle}</h2>

          {formError && (
            <p role="alert" className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
              {formError}
            </p>
          )}

          <div className="mt-6 grid gap-5">
            {FIELDS.map((f) => (
              <div key={f.name}>
                <label
                  htmlFor={f.name}
                  className="mb-1.5 block text-sm font-medium"
                >
                  {f.label}
                </label>
                <input
                  id={f.name}
                  name={f.name}
                  type={f.type}
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
                {f.name === "email" && !fieldErrors.email && (
                  <p className="mt-1.5 text-xs text-muted">{t.checkout.emailHint}</p>
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
              ? t.checkout.placing
              : fill(t.checkout.placeOrder, {
                  total: formatCents(cart.totalCents, locale),
                })}
          </button>

          <p className="mt-4 text-center text-xs text-muted">
            {t.checkout.footnote}
          </p>
        </form>

        {/* Order summary */}
        <aside className="glass-card h-fit p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-bold">{t.checkout.yourOrder}</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {cart.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="text-muted">
                  {locName(item, locale)}{" "}
                  <span className="text-foreground font-medium">
                    ×{item.quantity}
                  </span>
                  {item.inputValue && item.inputType === "player-id" && (
                    <span className="block text-xs text-success">
                      🎮 {t.cart.sentToPlayer}{" "}
                      <span dir="ltr" className="font-mono">{item.inputValue}</span>
                    </span>
                  )}
                  {item.inputValue && item.inputType === "region" && (
                    <span className="block text-xs text-success">
                      🌐 {t.cart.regionTag}{" "}
                      {REGION_CODES.includes(item.inputValue as RegionCode)
                        ? t.regions[item.inputValue as RegionCode]
                        : item.inputValue}
                    </span>
                  )}
                </span>
                <span className="font-medium tabular-nums shrink-0">
                  {formatCents(item.lineTotalCents, locale)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-5 space-y-3 border-t border-edge pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t.cart.subtotal}</dt>
              <dd className="tabular-nums">{formatCents(cart.subtotalCents, locale)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t.cart.delivery}</dt>
              <dd className="text-success font-medium">{t.cart.instantFree}</dd>
            </div>
            <div className="flex justify-between border-t border-edge pt-3 text-base font-bold">
              <dt>{t.cart.total}</dt>
              <dd className="tabular-nums">{formatCents(cart.totalCents, locale)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
