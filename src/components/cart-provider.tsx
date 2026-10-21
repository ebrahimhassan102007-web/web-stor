"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchCartSummary } from "@/lib/client/cart-load";

/**
 * Lightweight client-side cart state (item count only).
 * The source of truth always lives server-side, keyed by the HttpOnly
 * signed session cookie — this context just mirrors the count for the UI.
 */
type CartContextValue = {
  count: number;
  refresh: () => Promise<void>;
};

const CartContext = createContext<CartContextValue>({
  count: 0,
  refresh: async () => {},
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const summary = await fetchCartSummary<{ itemCount?: number }>();
      setCount(summary.itemCount ?? 0);
    } catch {
      // Network/API hiccup (including `{ ok: false }`) — keep the last count.
    }
  }, []);

  useEffect(() => {
    // State is set only after the awaited fetch resolves (not synchronously).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ count, refresh }), [count, refresh]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
