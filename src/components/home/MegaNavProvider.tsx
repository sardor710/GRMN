"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { NavItem } from "@/lib/homepage-nav";

// Owner 2026-11-22: the top menu built on the server from Admin ▸ Categories (src/server/catalog/mega-nav.ts).
// null = no categories (or the database is unavailable): the header falls back to the built-in menu.
const MegaNavContext = createContext<NavItem[] | null>(null);

export function MegaNavProvider({ items, children }: { items: NavItem[] | null; children: ReactNode }) {
  return <MegaNavContext.Provider value={items}>{children}</MegaNavContext.Provider>;
}

export const useMegaNav = (): NavItem[] | null => useContext(MegaNavContext);
