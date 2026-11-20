"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Tracks a CSS media query. SSR-safe: the server and the first (hydrating) client render both report `false`
 * (mobile-first), so there is no hydration mismatch; React then re-renders with the real value right after hydration.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
