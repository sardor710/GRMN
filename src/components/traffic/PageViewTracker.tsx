"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Owner 2026-11-25: one beacon to /api/t per storefront page view, on the first load and on every client-side
// navigation (plan docs/plans/2026-11-25-traffic-analytics-xl.md). The server decides visits and sources and
// sets the grmn_vid / grmn_sid cookies; nothing is sent to any third party.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALES = new Set(["en", "ru", "kk"]);

// Beacons go out one after another: the first one's response sets the visit cookies, and a quick second
// page (a tap before that response on a slow phone) must carry them, or it would count as a new visitor.
let queue: Promise<unknown> = Promise.resolve();
function send(body: string) {
  queue = queue.then(() => fetch("/api/t", { method: "POST", body, keepalive: true, credentials: "same-origin", headers: { "content-type": "text/plain" } }).catch(() => undefined));
}

export function PageViewTracker() {
  // A page view is a new path: query-only changes (variant pick, compare bar, filters) are the same page.
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  const previousUrl = useRef<string | null>(null);

  useEffect(() => {
    const key = pathname;
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
    try { send(body); } catch { /* analytics never breaks the page */ }
  }, [pathname]);

  return null;
}
