"use client";

import { useState } from "react";
import { useCart } from "./cart-provider";
import { useI18n } from "./locale-provider";
import { REGION_CODES, type RegionCode } from "@/lib/i18n/dictionary";

export function AddToCart({
  productId,
  stock,
  inputType = "none",
  compact = false,
}: {
  productId: number;
  stock: number;
  /** "player-id" shows an account-id field, "region" a region picker. */
  inputType?: string;
  compact?: boolean;
}) {
  const { refresh } = useCart();
  const { t } = useI18n();
  const [quantity, setQuantity] = useState(1);
  const [playerId, setPlayerId] = useState("");
  const [region, setRegion] = useState<RegionCode>("global");
  const [state, setState] = useState<"idle" | "busy" | "added" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const inStock = stock > 0;
  const maxQty = Math.min(stock, 99);

  const inputValue =
    inputType === "player-id"
      ? playerId.trim() || undefined
      : inputType === "region"
        ? region
        : undefined;

  async function add() {
    if (!inStock || state === "busy") return;
    setState("busy");
    setMessage("");
    try {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity, inputValue }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        await refresh();
        setState("added");
        setTimeout(() => setState("idle"), 1800);
      } else {
        setState("error");
        setMessage(body?.error ?? t.add.errAdd);
        setTimeout(() => setState("idle"), 2500);
      }
    } catch {
      setState("error");
      setMessage(t.add.errNetwork);
      setTimeout(() => setState("idle"), 2500);
    }
  }

  return (
    <div className={compact ? "" : "space-y-4"}>
      {/* Delivery input (top-ups & gift cards) */}
      {!compact && inStock && inputType === "player-id" && (
        <div>
          <label htmlFor={`player-id-${productId}`} className="mb-1.5 block text-sm font-medium">
            🎮 {t.product.playerIdLabel}
          </label>
          <input
            id={`player-id-${productId}`}
            type="text"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            maxLength={64}
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            placeholder={t.product.playerIdPlaceholder}
            className="input-dark"
          />
          <p className="mt-1.5 text-xs text-muted">{t.product.playerIdHint}</p>
        </div>
      )}

      {!compact && inStock && inputType === "region" && (
        <div>
          <label htmlFor={`region-${productId}`} className="mb-1.5 block text-sm font-medium">
            🌐 {t.product.regionLabel}
          </label>
          <select
            id={`region-${productId}`}
            value={region}
            onChange={(e) => setRegion(e.target.value as RegionCode)}
            className="input-dark cursor-pointer"
          >
            {REGION_CODES.map((code) => (
              <option key={code} value={code}>
                {t.regions[code]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-muted">{t.product.regionHint}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        {!compact && inStock && (
          <div className="flex items-center rounded-lg border border-edge bg-raised/60">
            <button
              type="button"
              aria-label={t.add.decrease}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="h-11 w-10 text-lg text-muted hover:text-foreground disabled:opacity-40"
              disabled={quantity <= 1}
            >
              −
            </button>
            <span className="w-10 text-center font-semibold tabular-nums">
              {quantity}
            </span>
            <button
              type="button"
              aria-label={t.add.increase}
              onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
              className="h-11 w-10 text-lg text-muted hover:text-foreground disabled:opacity-40"
              disabled={quantity >= maxQty}
            >
              +
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={add}
          disabled={!inStock || state === "busy"}
          className={`btn-primary ${compact ? "px-4 py-2 text-sm" : "flex-1 py-3 text-base"}`}
        >
          {state === "busy"
            ? t.add.adding
            : state === "added"
              ? t.add.added
              : inStock
                ? t.add.addToCart
                : t.add.outOfStock}
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
