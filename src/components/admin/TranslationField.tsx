"use client";

import { fieldLimit } from "@/lib/cms/translation-input";

interface TranslationFieldProps {
  label: string;
  /** Base field name; sets the same max length as the English field. */
  field: string;
  value: string;
  /** English source text, shown as placeholder and under the input. */
  source: string | undefined;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  mono?: boolean;
  compact?: boolean;
}

const labelClass = "block text-xs font-semibold text-neutral-600";

/** One translatable input in a RU/KK tab: English as placeholder, same length limit as the base field. */
export function TranslationField({
  label,
  field,
  value,
  source,
  onChange,
  multiline,
  rows = 4,
  mono,
  compact,
}: TranslationFieldProps) {
  const english = source ?? "";
  const common = {
    value,
    placeholder: english,
    maxLength: fieldLimit(field),
    "aria-label": label,
    className: `mt-1 w-full border border-border bg-white px-3 ${compact ? "text-[12px]" : "text-[13px]"} text-black placeholder:text-neutral-400 focus:border-black focus:outline-none rounded-none ${
      mono ? "font-mono" : ""
    }`,
  };
  return (
    <div>
      {!compact && <label className={labelClass}>{label}</label>}
      {multiline ? (
        <textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} className={`${common.className} py-2`} />
      ) : (
        <input
          type="text"
          {...common}
          onChange={(e) => onChange(e.target.value)}
          className={`${common.className} ${compact ? "h-7" : "h-9"}`}
        />
      )}
      {!compact && english && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          <span className="font-semibold">EN:</span> {english}
        </p>
      )}
    </div>
  );
}
