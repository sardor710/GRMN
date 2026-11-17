"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface CartItem {
  /** Product id */
  id: string;
  name: string;
  price: number;
  qty: number;
  image?: string;
  /** Variant SKU when the product has options */
  sku?: string;
  /** Human label of the chosen variant, e.g. "43 mm / Black" */
  variantLabel?: string;
}

/** One cart line per product + variant. Old saved carts (no sku) keep using the product id. */
export function lineKeyOf(item: Pick<CartItem, "id" | "sku">): string {
  return item.sku ? `${item.id}::${item.sku}` : item.id;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "garmin-clone-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items]);

  const add = useCallback((item: Omit<CartItem, "qty">, qty = 1) => {
    setItems((prev) => {
      const key = lineKeyOf(item);
      const existing = prev.find((i) => lineKeyOf(i) === key);
      if (existing) {
        return prev.map((i) => (lineKeyOf(i) === key ? { ...i, qty: i.qty + qty } : i));
      }
      return [...prev, { ...item, qty }];
    });
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => lineKeyOf(i) !== key)
        : prev.map((i) => (lineKeyOf(i) === key ? { ...i, qty } : i)),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => lineKeyOf(i) !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = items.reduce((n, i) => n + i.qty, 0);
  const subtotal = items.reduce((n, i) => n + i.qty * i.price, 0);

  return (
    <CartContext.Provider value={{ items, count, subtotal, add, setQty, remove, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
