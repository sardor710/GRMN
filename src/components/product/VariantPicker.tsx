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

/**
 * garmin.com option pickers (measured on /p/1613801, 2026-11-19): a bold "Name - Selected" label, 38px text
 * buttons with a 1.6px #ccc border (black and filled when chosen) and 83px photo swatches. A value that does
 * not fit the other choices stays clickable — picking it switches to the variant that has it — and only its
 * photo is faded, as on garmin.com.
 */
export function VariantPicker({ options, variants, selections, onSelect }: VariantPickerProps) {
  return (
    <div>
      {options.map((option) => {
        const available = availableValueIds(variants, selections, option.id);
        const selected = option.values.find((v) => v.id === selections[option.id]);
        return (
          <div key={option.id} className="mt-4" role="group" aria-label={option.name}>
            <p className="text-[14px] font-bold leading-[21px] text-black">
              {option.name}
              {selected && <span className="font-normal"> - {selected.label}</span>}
            </p>

            {option.display === "dropdown" ? (
              <select
                value={selections[option.id] || ""}
                onChange={(e) => onSelect(option.id, e.target.value)}
                className="mt-2 w-full max-w-[360px] border-[1.6px] border-[#ccc] bg-white px-3 py-2 text-[14px] text-black focus:border-black focus:outline-none"
              >
                {option.values.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.label}
                  </option>
                ))}
              </select>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-[10.8px]">
                {option.values.map((value) => {
                  const isSelected = value.id === selections[option.id];
                  const fits = available.has(value.id);
                  if (option.display === "swatch") {
                    return (
                      <li key={value.id}>
                        <button
                          type="button"
                          title={value.label}
                          aria-label={value.label}
                          aria-pressed={isSelected}
                          onClick={() => onSelect(option.id, value.id)}
                          className={cn(
                            "grid h-[83px] w-[83px] place-items-center border-[1.6px] bg-white",
                            isSelected ? "border-black" : "border-[#ccc] hover:border-black",
                          )}
                        >
                          {value.swatchImage ? (
                            // eslint-disable-next-line @next/next/no-img-element -- variant photo thumbnails (remote or /uploads)
                            <img
                              src={value.swatchImage}
                              alt=""
                              className={cn("h-20 w-20 object-contain", !fits && !isSelected && "opacity-30")}
                            />
                          ) : (
                            <span
                              className={cn(
                                "h-12 w-12 rounded-full border border-[#ccc] bg-[var(--swatch)]",
                                !fits && !isSelected && "opacity-30",
                              )}
                              style={{ ["--swatch" as string]: value.swatchColor || "#e5e5e5" }}
                            />
                          )}
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={value.id}>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSelect(option.id, value.id)}
                        className={cn(
                          "h-[38px] min-w-[82px] border-[1.6px] px-[17.5px] text-[14px] leading-[21px] transition-colors",
                          isSelected ? "border-black bg-black text-white" : "border-[#ccc] bg-white text-black hover:border-black",
                        )}
                      >
                        {value.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
