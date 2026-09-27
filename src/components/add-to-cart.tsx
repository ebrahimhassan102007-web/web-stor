"use client";

import { useState } from "react";
import { useCart } from "./cart-provider";

export function AddToCart({
  productId,
  stock,
  compact = false,
}: {
  productId: number;
  stock: number;
  compact?: boolean;
}) {
  const { refresh } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState<"idle" | "busy" | "added" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const inStock = stock > 0;
  const maxQty = Math.min(stock, 99);

  async function add() {
    if (!inStock || state === "busy") return;
    setState("busy");
    setMessage("");
    try {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        await refresh();
        setState("added");
        setTimeout(() => setState("idle"), 1800);
      } else {
        setState("error");
        setMessage(body?.error ?? "Could not add to cart.");
        setTimeout(() => setState("idle"), 2500);
      }
    } catch {
      setState("error");
      setMessage("Network error. Please try again.");
      setTimeout(() => setState("idle"), 2500);
    }
  }

  return (
    <div className={compact ? "" : "space-y-3"}>
      <div className="flex items-center gap-3">
        {!compact && inStock && (
          <div className="flex items-center rounded-lg border border-edge bg-raised/60">
            <button
              type="button"
              aria-label="Decrease quantity"
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
              aria-label="Increase quantity"
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
            ? "Adding…"
            : state === "added"
              ? "✓ Added to cart"
              : inStock
                ? "Add to Cart"
                : "Out of Stock"}
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
