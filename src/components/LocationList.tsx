"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { GARMIN_LOCATIONS, type GarminLocation } from "@/lib/locations";
import { useLocalizeHref } from "@/i18n/useLocalizeHref";

/**
 * Owner 2026-11-20: the country list of garmin.com's "Select a location" page. Choosing another
 * country asks first (it leaves Garmin Kazakhstan) and opens that distributor's site in a new tab.
 */
export function LocationList() {
  const t = useTranslations("Locations");
  const localize = useLocalizeHref();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<GarminLocation | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (target && !dialog.open) dialog.showModal();
    if (!target && dialog.open) dialog.close();
  }, [target]);

  const open = () => {
    if (target) window.open(target.url, "_blank", "noopener,noreferrer");
    setTarget(null);
  };

  return (
    <>
      <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {GARMIN_LOCATIONS.map((location) => {
          const label = (
            <>
              {location.native && <span>{location.native}</span>}
              {location.native && <span className="mx-1.5 text-neutral-400" aria-hidden="true">|</span>}
              <span>{location.name}</span>
              {location.current && <span className="ml-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{t("current")}</span>}
            </>
          );
          return (
            <li key={location.name} className="border-b border-neutral-200">
              {location.current ? (
                <a href={localize("/")} aria-current="page" className="block py-5 text-[14px] font-semibold text-black hover:underline">
                  {label}
                </a>
              ) : (
                <a
                  href={location.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    // Modified clicks (new tab/window) keep the browser's own behaviour.
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    setTarget(location);
                  }}
                  className="block py-5 text-[14px] text-neutral-800 hover:text-black hover:underline"
                >
                  {label}
                </a>
              )}
            </li>
          );
        })}
      </ul>

      <dialog
        ref={dialogRef}
        onClose={() => setTarget(null)}
        onClick={(event) => { if (event.target === dialogRef.current) setTarget(null); }}
        aria-labelledby="leave-site-title"
        className="m-auto w-[min(92vw,460px)] rounded-none border-0 bg-white p-0 text-black shadow-2xl backdrop:bg-black/60"
      >
        {target && (
          <div className="p-6 sm:p-8">
            <h2 id="leave-site-title" className="g-heading text-[22px] leading-tight">{t("dialogTitle")}</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-neutral-700">
              {t("dialogBody")}
            </p>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setTarget(null)}
                className="border border-neutral-300 bg-white px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-black hover:border-black"
              >
                {t("stay")}
              </button>
              <button
                type="button"
                autoFocus
                onClick={open}
                className="border border-black bg-black px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800"
              >
                {t("continue")}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
