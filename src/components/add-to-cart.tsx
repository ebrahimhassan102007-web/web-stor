"use client";

import { useState } from "react";
import { useStore } from "./store-provider";

type Field = {
  key: string;
  labelAr: string;
  placeholder: string;
  format: string;
};

/**
 * Add-to-cart with dynamic per-product-type customer inputs (player id /
 * phone / account email). Values are validated client-side for UX and
 * strictly re-validated on the server.
 */
export function AddToCart({
  productId,
  stock,
  fields,
  maxQty,
}: {
  productId: number;
  stock: number;
  fields: Field[];
  maxQty: number;
}) {
  const { refreshCart } = useStore();
  const [quantity, setQuantity] = useState(1);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "busy" | "added" | "error">("idle");
  const [message, setMessage] = useState("");

  const inStock = stock > 0;
  const limit = Math.min(stock, maxQty);

  async function add() {
    if (!inStock || state === "busy") return;
    setState("busy");
    setMessage("");
    try {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity, customerInputs: inputs }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        await refreshCart();
        setState("added");
        setTimeout(() => setState("idle"), 2000);
      } else {
        setState("error");
        setMessage(body?.error ?? "تعذر إضافة المنتج للسلة.");
        setTimeout(() => setState("idle"), 3000);
      }
    } catch {
      setState("error");
      setMessage("خطأ في الاتصال. حاول مرة أخرى.");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.key}>
          <label htmlFor={`field-${f.key}`} className="mb-1.5 block text-sm font-semibold">
            {f.labelAr} <span className="text-primary">*</span>
          </label>
          <input
            id={`field-${f.key}`}
            type="text"
            dir="ltr"
            inputMode={f.format === "egypt_phone" || f.format === "player_id" ? "numeric" : "text"}
            placeholder={f.placeholder}
            maxLength={64}
            value={inputs[f.key] ?? ""}
            onChange={(e) =>
              setInputs((v) => ({ ...v, [f.key]: e.target.value }))
            }
            className="input-dark text-left"
          />
        </div>
      ))}

      <div className="flex items-center gap-3">
        {inStock && (
          <div className="flex items-center rounded-lg border border-edge bg-raised/60">
            <button
              type="button"
              aria-label="زيادة الكمية"
              onClick={() => setQuantity((q) => Math.min(limit, q + 1))}
              className="h-11 w-10 text-lg text-muted hover:text-foreground disabled:opacity-40"
              disabled={quantity >= limit}
            >
              +
            </button>
            <span className="w-10 text-center font-bold tabular-nums" aria-live="polite">
              {quantity}
            </span>
            <button
              type="button"
              aria-label="تقليل الكمية"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="h-11 w-10 text-lg text-muted hover:text-foreground disabled:opacity-40"
              disabled={quantity <= 1}
            >
              −
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={add}
          disabled={!inStock || state === "busy"}
          className="btn-primary flex-1 py-3 text-base"
        >
          {state === "busy"
            ? "جارٍ الإضافة…"
            : state === "added"
              ? "✓ تمت الإضافة للسلة"
              : inStock
                ? "أضف إلى السلة"
                : "غير متوفر حالياً"}
        </button>
      </div>

      {state === "error" && message && (
        <p role="alert" className="text-sm text-primary">
          {message}
        </p>
      )}
    </div>
  );
}
