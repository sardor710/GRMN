"use client";

import { useCallback, useSyncExternalStore } from "react";

// A small per-browser preference (e.g. Grouped vs All SKUs) kept in localStorage. Reads and writes are
// wrapped in try/catch (private windows, blocked storage: the choice then lasts for this page view only);
// the server render always uses the fallback.
const listeners = new Set<() => void>();
const memory = new Map<string, string>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
};

function read(key: string): string | null {
  try { return window.localStorage.getItem(key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; }
}

export function usePersistentChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (value: T) => void] {
  const getSnapshot = () => {
    const stored = read(key);
    return stored !== null && (allowed as readonly string[]).includes(stored) ? (stored as T) : fallback;
  };
  const value = useSyncExternalStore(subscribe, getSnapshot, () => fallback);
  const set = useCallback((next: T) => {
    memory.set(key, next);
    try { window.localStorage.setItem(key, next); } catch { /* storage unavailable */ }
    listeners.forEach((listener) => listener());
  }, [key]);
  return [value, set];
}
