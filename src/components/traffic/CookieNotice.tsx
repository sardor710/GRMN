"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

// Owner 2026-11-25: short notice for the first-party visit cookies (Admin ▸ Traffic). Informational; "OK"
// hides it for good on this browser.
const KEY = "grmn_cookie_ok", CHANGED = "grmn-cookie-ok";
const read = () => { try { return window.localStorage.getItem(KEY) === "1"; } catch { return true; } };
const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGED, notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener(CHANGED, notify); };
};

export function CookieNotice() {
  const t = useTranslations("CookieNotice");
  // The server render and hydration treat it as accepted, so the bar only appears after mount.
  const accepted = useSyncExternalStore(subscribe, read, () => true);
  if (accepted) return null;
  const dismiss = () => {
    try { window.localStorage.setItem(KEY, "1"); } catch { /* private mode */ }
    window.dispatchEvent(new Event(CHANGED));
  };
  return (
    <div role="region" aria-label={t("label")} className="fixed inset-x-0 bottom-0 z-50 border-t border-garmin-control bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-5 text-black">{t("text")}</p>
        <button type="button" onClick={dismiss} className="shrink-0 bg-black px-6 py-2.5 text-sm font-bold text-white hover:bg-[#333]">
          {t("ok")}
        </button>
      </div>
    </div>
  );
}
