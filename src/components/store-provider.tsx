"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Client-side mirror of server state (cart count + identity).
 * The authoritative state always lives server-side behind HttpOnly cookies;
 * this context only reflects it for the UI. It carries no tokens and no
 * authorization power.
 */
export type UiUser = { name: string; email: string; role: string } | null;

type StoreContextValue = {
  cartCount: number;
  user: UiUser;
  userLoaded: boolean;
  refreshCart: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const StoreContext = createContext<StoreContextValue>({
  cartCount: 0,
  user: null,
  userLoaded: false,
  refreshCart: async () => {},
  refreshUser: async () => {},
});

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [cartCount, setCartCount] = useState(0);
  const [user, setUser] = useState<UiUser>(null);
  const [userLoaded, setUserLoaded] = useState(false);

  const refreshCart = useCallback(async () => {
    try {
      const res = await fetch("/api/cart", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      if (body?.ok) setCartCount(body.data.itemCount ?? 0);
    } catch {
      /* keep previous value */
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      if (body?.ok) setUser(body.data.user ?? null);
    } catch {
      /* keep previous value */
    } finally {
      setUserLoaded(true);
    }
  }, []);

  useEffect(() => {
    // State is set only after the awaited fetches resolve (not synchronously).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshCart();
    void refreshUser();
  }, [refreshCart, refreshUser]);

  const value = useMemo(
    () => ({ cartCount, user, userLoaded, refreshCart, refreshUser }),
    [cartCount, user, userLoaded, refreshCart, refreshUser],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}
