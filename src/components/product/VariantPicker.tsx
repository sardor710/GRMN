"use client";

import type { ProductOption, ProductVariant } from "@/lib/cms/types";
import { availableValueIds } from "@/lib/cms/product-variants";
import { cn } from "@/lib/utils";

interface VariantPickerProps {
  options: ProductOption[];
  variants: ProductVariant[];
  selections: Record<string, string>;
  onSelect: (optionId: string, valueId: string) => void;
}

/** Garmin-style option pickers: buttons, swatches (image or color) or a dropdown, per option. */
export function VariantPicker({ options, variants, selections, onSelect }: VariantPickerProps) {
  return (
    <div className="mt-2">
      {options.map((option) => {
        const available = availableValueIds(variants, selections, option.id);
        const selected = option.values.find((v) => v.id === selections[option.id]);
        return (
          <div key={option.id} className="mt-6" role="group" aria-label={option.name}>
            <p className="text-[14px] font-medium text-black">
              {option.name}
              {option.display === "swatch" && selected && (
                <span className="ml-2 font-normal text-neutral-600">{selected.label}</span>
              )}
            </p>

            {option.display === "dropdown" ? (
              <select
                value={selections[option.id] || ""}
                onChange={(e) => onSelect(option.id, e.target.value)}
                className="mt-2 w-full max-w-[360px] border border-neutral-300 bg-white px-3 py-2 text-[14px] text-black focus:border-black focus:outline-none"
              >
                {option.values.map((value) => (
                  <option key={value.id} value={value.id} disabled={!available.has(value.id)}>
                    {value.label}
                    {!available.has(value.id) ? " (unavailable)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {option.values.map((value) => {
                  const isSelected = value.id === selections[option.id];
                  const isAvailable = available.has(value.id);
                  if (option.display === "swatch") {
                    return (
                      <button
                        key={value.id}
                        type="button"
                        title={value.label}
                        aria-label={value.label}
                        aria-pressed={isSelected}
                        onClick={() => onSelect(option.id, value.id)}
                        className={cn(
                          "relative grid h-16 w-16 place-items-center border bg-white transition-colors",
                          isSelected ? "border-2 border-black" : "border-neutral-200 hover:border-neutral-500",
                          !isAvailable && "opacity-40",
                        )}
                      >
                        {value.swatchImage ? (
                          // eslint-disable-next-line @next/next/no-img-element -- remote Garmin swatch thumbnails
                          <img src={value.swatchImage} alt="" className="h-full w-full object-contain p-1" />
                        ) : (
                          <span
                            className="h-9 w-9 rounded-full border border-neutral-300 bg-[var(--swatch)]"
                            style={{ ["--swatch" as string]: value.swatchColor || "#e5e5e5" }}
                          />
                        )}
                        {!isAvailable && (
                          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top_right,transparent_calc(50%-1px),#9ca3af,transparent_calc(50%+1px))]" />
                        )}
                      </button>
                    );
                  }
                  return (
                    <button
                      key={value.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onSelect(option.id, value.id)}
                      className={cn(
                        "border px-4 py-2 text-[13px] uppercase tracking-[0.04em] transition-colors",
                        isSelected
                          ? "border-black bg-black text-white"
                          : "border-neutral-300 bg-white text-black hover:border-black",
                        !isAvailable && !isSelected && "border-dashed text-neutral-400",
                      )}
                    >
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
