"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import type { CartDTO } from "@/contracts/commerce";
import { CART_SESSION_EVENT, cartBadgeCount, createCartClient, createCartController, LEGACY_CART_KEY, type CartFetcher, type CartState } from "@/lib/cart-client";

// Task 13A: in PostgreSQL mode the cart lives on the server (/api/cart); the state machine is
// createCartController (one-time import of the stored cart, merge after sign-in, version handling).
// Where the server cart is closed (legacy mode, 503) the original browser-only cart keeps working.

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  image?: string;
}

/** `variantId` selects an exact server variant; otherwise `id` is sent as the product key. */
type AddItem = Omit<CartItem, "qty"> & { variantId?: string };

interface CartContextValue {
  mode: CartState["mode"];
  server: CartDTO | null;
  error: string | null;
  busy: boolean;
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (item: AddItem, qty?: number) => Promise<void>;
  setQty: (id: string, qty: number) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  acknowledge: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

const readLocal = (): CartItem[] => {
  try { const raw = localStorage.getItem(LEGACY_CART_KEY); return raw ? (JSON.parse(raw) as CartItem[]) : []; } catch { return []; }
};

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CartState>({ mode: "loading", server: null, error: null, busy: false });
  // The browser-only cart (legacy mode); only used and persisted while mode is "local".
  const [items, setItems] = useState<CartItem[]>(() => typeof window === "undefined" ? [] : readLocal());
  const controller = useMemo(() => {
    const fetcher: CartFetcher = (url, init) => fetch(url, { ...init, credentials: "same-origin" });
    const storage = {
      get: (key: string) => { try { return localStorage.getItem(key); } catch { return null; } },
      remove: (key: string) => { try { localStorage.removeItem(key); } catch { /* ignore */ } },
    };
    return createCartController({ client: createCartClient(fetcher), storage, onChange: setState });
  }, []);

  useEffect(() => {
    void controller.start();
    const resync = () => { void controller.refresh(); };
    window.addEventListener(CART_SESSION_EVENT, resync);
    return () => window.removeEventListener(CART_SESSION_EVENT, resync);
  }, [controller]);

  useEffect(() => {
    if (state.mode !== "local") return;
    try { localStorage.setItem(LEGACY_CART_KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items, state.mode]);

  const add = useCallback(async (item: AddItem, qty = 1) => {
    if (await controller.add({ ...(item.variantId ? { variantId: item.variantId } : { productKey: item.id }), quantity: qty })) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) return prev.map((i) => (i.id === item.id ? { ...i, qty: i.qty + qty } : i));
      return [...prev, { id: item.id, name: item.name, price: item.price, image: item.image, qty }];
    });
  }, [controller]);

  const setQty = useCallback(async (id: string, qty: number) => {
    if (await controller.setQuantity(id, qty)) return;
    setItems((prev) => qty <= 0 ? prev.filter((i) => i.id !== id) : prev.map((i) => (i.id === id ? { ...i, qty } : i)));
  }, [controller]);

  const remove = useCallback(async (id: string) => {
    if (await controller.remove(id)) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, [controller]);

  const clear = useCallback(async () => {
    if (await controller.clear()) return;
    setItems([]);
  }, [controller]);

  const acknowledge = useCallback(async () => { await controller.acknowledge(); }, [controller]);
  // Re-reads the server cart (Task 14A: after checkout converts it on the server).
  const refresh = useCallback(async () => { await controller.refresh(); }, [controller]);

  const count = cartBadgeCount(state, items);
  const subtotal = items.reduce((n, i) => n + i.qty * i.price, 0);

  return (
    <CartContext.Provider value={{ ...state, items, count, subtotal, add, setQty, remove, clear, acknowledge, refresh }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
