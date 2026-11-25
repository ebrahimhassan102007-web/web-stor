"use client";

import { csrfFetch } from "@/lib/security/csrf-client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { useI18n } from "@/components/locale-provider";
import { checkoutSchema } from "@/lib/validation";
import { formatCents } from "@/lib/money";
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
  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscountCents, setPromoDiscountCents] = useState(0);
  const [promoMessage, setPromoMessage] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"demo" | "wallet">("demo");
  const checkoutKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await csrfFetch("/api/cart", { cache: "no-store" });
      const body = await res.json();
      if (body?.ok) setCart(body.data);
    } catch {
      setFormError(t.checkout.errLoad);
    }
  }, [t]);

  useEffect(() => {
    // State is set only after the awaited fetch resolves (not synchronously).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function applyPromo() {
    if (!cart || !promoInput.trim()) return;
    setPromoMessage("");
    try {
      const response = await csrfFetch("/api/promo/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: promoInput, subtotalCents: cart.subtotalCents }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) { setPromoCode(""); setPromoDiscountCents(0); setPromoMessage(locale === "ar" ? "كود الخصم غير متاح أو غير مستوفٍ للشروط." : "This promo code is unavailable or its conditions are not met."); return; }
      setPromoCode(result.data.code);
      setPromoDiscountCents(result.data.discountCents);
      setPromoMessage(locale === "ar" ? "تم تطبيق كود الخصم." : "Promo code applied.");
    } catch { setPromoMessage(locale === "ar" ? "تعذر التحقق من الكود." : "Could not validate the code."); }
  }

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
    checkoutKey.current ??= window.crypto.randomUUID();
    try {
      const checkoutUrl = paymentMethod === "wallet" ? "/api/checkout?payment=wallet" : "/api/checkout";
      const res = await csrfFetch(checkoutUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": checkoutKey.current },
        body: JSON.stringify({ ...parsed.data, paymentMethod, ...(promoCode ? { promoCode } : {}) }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        await refresh();
        router.push(
          `/checkout/success?order=${encodeURIComponent(body.data.orderNumber)}`,
        );
        return;
      }
      if (body?.error === "CHECKOUT_DISABLED") {
        setFormError(t.checkout.disabled);
      } else if (body?.error === "INVALID_FULFILLMENT_TARGET") {
        setFormError(t.add.targetInvalid);
      } else if (body?.error === "RATE_LIMITED") {
        setFormError(t.checkout.errRateLimited);
      } else if (body?.error === "INSUFFICIENT_STOCK") {
        const name = body?.details?.productName?.[0] ?? "";
        setFormError(fill(t.checkout.errStock, { name }));
      } else if (body?.error === "INSUFFICIENT_WALLET_FUNDS") {
        setFormError(locale === "ar" ? "رصيد المحفظة غير كافٍ لإتمام الطلب." : "Your wallet balance is insufficient for this order.");
      } else if (body?.error === "PROMO_UNAVAILABLE") {
        setFormError(locale === "ar" ? "تعذر تطبيق كود الخصم عند إتمام الطلب." : "The promo code could not be applied at checkout.");
      } else if (body?.error === "CART_EMPTY") {
        setFormError(t.checkout.nothingText);
      } else {
        const details = body?.details as Record<string, string[]> | undefined;
        if (details) {
          const localized: Record<string, string[]> = { ...details };
          if (details.customerName) localized.customerName = [t.checkout.errName];
          if (details.email) localized.email = [t.checkout.errEmail];
          setFieldErrors(localized);
        }
        setFormError(t.checkout.errGeneric);
      }
      setSubmitting(false);
    } catch {
      setFormError(t.checkout.errNetwork);
      setSubmitting(false);
    }
  }

  if (!cart) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 text-center text-muted">
        {t.checkout.loading}
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="glass-card relative isolate overflow-hidden p-12 text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(34rem_14rem_at_50%_-10%,var(--ambient-1),transparent_70%)]"
          />
          <span
            aria-hidden="true"
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-champagne/25 bg-[var(--hover-fill)] text-champagne"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <path d="M3 3h1.6c.5 0 .94.34 1.07.82l.4 1.48M7.5 14.5h10.7c1.1-2.3 2.08-4.68 2.9-7.1A60 60 0 0 0 4.6 5.6M7.5 14.5 6.07 5.3M7.5 14.5l-.7 2.5h12M9 20a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm9.5 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
          </span>
          <h1 className="title-luxe mt-5 text-2xl">{t.checkout.nothingTitle}</h1>
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
      <p className="eyebrow mb-3">{t.checkout.encrypted}</p>
      <h1 className="title-luxe text-3xl">
        {t.checkout.title} <span className="text-gradient-dawn">{t.checkout.titleAccent}</span>
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

          <div className="mt-5 rounded-xl border border-edge p-4">
            <label htmlFor="promo-code" className="mb-2 block text-sm font-semibold">{locale === "ar" ? "كود الخصم" : "Promo code"}</label>
            <div className="flex gap-2"><input id="promo-code" className="input-dark min-w-0 flex-1" maxLength={64} value={promoInput} onChange={(event) => setPromoInput(event.target.value)} /><button type="button" onClick={() => void applyPromo()} className="btn-secondary px-4">{locale === "ar" ? "تطبيق" : "Apply"}</button></div>
            {promoMessage && <p role="status" className="mt-2 text-sm text-muted">{promoMessage}</p>}
          </div>
          <fieldset className="mt-5 rounded-xl border border-edge p-4">
            <legend className="px-1 text-sm font-semibold">{locale === "ar" ? "طريقة الدفع" : "Payment method"}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-edge p-3 text-sm"><input type="radio" name="paymentMethod" checked={paymentMethod === "demo"} onChange={() => setPaymentMethod("demo")} />{locale === "ar" ? "معاينة تجريبية" : "Demo preview"}</label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-edge p-3 text-sm"><input type="radio" name="paymentMethod" checked={paymentMethod === "wallet"} onChange={() => setPaymentMethod("wallet")} />{locale === "ar" ? "رصيد المحفظة" : "Wallet balance"}</label>
            </div>
          </fieldset>
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
                  {item.inputValue && item.inputType === "activation-email" && (
                    <span className="block text-xs text-success" dir="ltr">✉️ {t.product.activationEmailLabel}: {item.inputValue}</span>
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
            {promoDiscountCents > 0 && <div className="flex justify-between text-success"><dt>{locale === "ar" ? "خصم الكود" : "Promo discount"}</dt><dd className="tabular-nums">−{formatCents(promoDiscountCents, locale)}</dd></div>}
            <div className="flex justify-between border-t border-edge pt-3 text-base font-bold">
              <dt>{t.cart.total}</dt>
              <dd className="tabular-nums">{formatCents(Math.max(0, cart.totalCents - promoDiscountCents), locale)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
