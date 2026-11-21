"use client";

import type { ProductOptionDTO } from "@/contracts/catalog-browse";
import type { OptionValueState } from "@/lib/variant-availability";
import { cn } from "@/lib/utils";

const strike = "pointer-events-none absolute inset-0 bg-[linear-gradient(to_top_right,transparent_calc(50%-1px),#9ca3af,transparent_calc(50%+1px))]";

/**
 * Garmin-style option pickers for the Postgres product page. Values with no in-stock variant stay visible
 * but are struck through, greyed and disabled (garmin.com behaviour).
 */
export function CommerceVariantPicker({ groups, onSelect }: { groups: { option: ProductOptionDTO; values: OptionValueState[] }[]; onSelect: (optionKey: string, label: string) => void }) {
  return (
    <div className="mt-2">
      {groups.map(({ option, values }) => {
        const selected = values.find(v => v.selected);
        return (
          <div key={option.key} className="mt-6" role="group" aria-label={option.name}>
            <p className="text-[14px] font-medium text-black">
              {option.name}
              {option.display === "swatch" && selected && <span className="ml-2 font-normal text-neutral-600">{selected.label}</span>}
            </p>
            {option.display === "dropdown" ? (
              <select value={selected?.label ?? ""} onChange={e => onSelect(option.key, e.target.value)} aria-label={option.name}
                className="mt-2 w-full max-w-[360px] rounded-none border border-neutral-300 bg-white px-3 py-2 text-[14px] text-black focus:border-black focus:outline-none">
                {values.map(value => (
                  <option key={value.label} value={value.label} disabled={!value.available && !value.selected}>
                    {value.label}{value.available ? "" : " (out of stock)"}
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {values.map(value => {
                  const meta = option.values.find(v => v.label === value.label);
                  const disabled = !value.available;
                  const label = disabled ? `${value.label} (out of stock)` : value.label;
                  if (option.display === "swatch") {
                    return (
                      <button key={value.label} type="button" title={label} aria-label={label} aria-pressed={value.selected} disabled={disabled}
                        onClick={() => onSelect(option.key, value.label)}
                        className={cn("relative grid h-16 w-16 place-items-center border bg-white transition-colors disabled:cursor-not-allowed",
                          value.selected ? "border-2 border-black" : "border-neutral-200 enabled:hover:border-neutral-500", disabled && "opacity-40")}>
                        {meta?.swatchImage ? (
                          // eslint-disable-next-line @next/next/no-img-element -- garmin.com swatch thumbnails are not optimized locally
                          <img src={meta.swatchImage} alt="" className="h-full w-full object-contain p-1" />
                        ) : (
                          <span className="h-9 w-9 rounded-full border border-neutral-300 bg-[var(--swatch)]" style={{ ["--swatch" as string]: meta?.swatchColor || "#e5e5e5" }} />
                        )}
                        {disabled && <span className={strike} />}
                      </button>
                    );
                  }
                  return (
                    <button key={value.label} type="button" aria-pressed={value.selected} aria-label={label} disabled={disabled}
                      onClick={() => onSelect(option.key, value.label)}
                      className={cn("relative border px-4 py-2 text-[13px] uppercase tracking-[0.04em] transition-colors disabled:cursor-not-allowed",
                        value.selected ? "border-black bg-black text-white" : "border-neutral-300 bg-white text-black enabled:hover:border-black",
                        disabled && !value.selected && "text-neutral-400 line-through", disabled && value.selected && "bg-neutral-500 border-neutral-500")}>
                      {value.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
