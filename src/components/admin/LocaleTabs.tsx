"use client";

import { Lock } from "lucide-react";
import type { TranslationStatus } from "@/lib/cms/translation-input";

/** Content language being edited in an admin editor. `en` edits the base record. */
export type ContentLocale = "en" | "ru" | "kk";

export type LocaleStatusMap = { ru: TranslationStatus; kk: TranslationStatus };

const TABS: { id: ContentLocale; code: string; label: string }[] = [
  { id: "en", code: "EN", label: "English" },
  { id: "ru", code: "RU", label: "Русский" },
  { id: "kk", code: "KZ", label: "Қазақша" },
];

const DOT_CLASS: Record<TranslationStatus, string> = {
  complete: "bg-emerald-500",
  partial: "bg-amber-400",
  empty: "bg-neutral-300",
};

const STATUS_TEXT: Record<TranslationStatus, string> = {
  complete: "translation complete",
  partial: "translation partial",
  empty: "not translated",
};

interface LocaleTabsProps {
  value: ContentLocale;
  onChange: (locale: ContentLocale) => void;
  status: LocaleStatusMap;
  className?: string;
}

/** EN / RU / KK content-language switch with a completeness dot on each translation tab. */
export function LocaleTabs({ value, onChange, status, className = "" }: LocaleTabsProps) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <span className="text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-500">
        Content language
      </span>
      <div role="tablist" aria-label="Content language" className="inline-flex border border-neutral-300">
        {TABS.map((tab) => {
          const selected = value === tab.id;
          const state = tab.id === "en" ? undefined : status[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              title={state ? `${tab.label}: ${STATUS_TEXT[state]}` : `${tab.label} (base content)`}
              onClick={() => onChange(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-heading uppercase tracking-wider font-semibold transition-colors rounded-none ${
                selected ? "bg-black text-white" : "bg-white text-neutral-600 hover:text-black"
              }`}
            >
              <span>{tab.code}</span>
              {state && (
                <>
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT_CLASS[state]}`} />
                  <span className="sr-only">({STATUS_TEXT[state]})</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {value !== "en" && (
        <span className="text-[11px] text-neutral-500">
          Empty fields fall back to English on the storefront.
        </span>
      )}
    </div>
  );
}

/** Note shown next to read-only fields in a RU/KK tab. */
export function SharedAcrossLanguages({ className = "" }: { className?: string }) {
  return (
    <p className={`inline-flex items-center gap-1 text-[11px] text-neutral-500 ${className}`}>
      <Lock className="h-3 w-3" aria-hidden="true" />
      Shared across languages — edit in the EN tab
    </p>
  );
}
