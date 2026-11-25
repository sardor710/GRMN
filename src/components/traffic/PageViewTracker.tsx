"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Owner 2026-11-25: one beacon to /api/t per storefront page view, on the first load and on every client-side
// navigation (plan docs/plans/2026-11-25-traffic-analytics-xl.md). The server decides visits and sources and
// sets the grmn_vid / grmn_sid cookies; nothing is sent to any third party.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALES = new Set(["en", "ru", "kk"]);

export function PageViewTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const last = useRef<string | null>(null);
  const previousUrl = useRef<string | null>(null);

  useEffect(() => {
    const key = `${pathname}?${search}`;
    if (last.current === key) return; // React strict mode runs effects twice in development
    last.current = key;
    const url = window.location.href;
    const productId = document.querySelector<HTMLElement>("[data-grmn-product]")?.dataset.grmnProduct;
    const lang = document.documentElement.lang;
    const body = JSON.stringify({
      v: 1, url: url.slice(0, 2048),
      // The first view carries where the visitor came from; later views come from our own pages.
      referrer: (previousUrl.current ?? document.referrer).slice(0, 2048),
      ...(productId && UUID.test(productId) ? { productId } : {}),
      ...(LOCALES.has(lang) ? { locale: lang } : {}),
    });
    previousUrl.current = url;
    try {
      const sent = typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/t", new Blob([body], { type: "text/plain" }));
      if (!sent) void fetch("/api/t", { method: "POST", body, keepalive: true, credentials: "same-origin", headers: { "content-type": "text/plain" } }).catch(() => {});
    } catch { /* analytics never breaks the page */ }
  }, [pathname, search]);

  return null;
}
