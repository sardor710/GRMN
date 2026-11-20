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
 * garmin.com option pickers (ProductBuyBox.spec.md): a 14/21 "Name - Selected" label (name 700, value 400), 39px
 * text buttons with a 2px #CCC border and no min-width (black and filled when chosen), 12px apart, and 84px photo
 * swatches (64px below 1024) with an 80px image, 10.8px apart. A value that does
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
          <div key={option.id} className="my-4" role="group" aria-label={option.name}>
            <p className="mb-2 text-[14px] font-bold leading-[21px] text-black">
              {option.name}
              {selected && <span className="font-normal"> - {selected.label}</span>}
            </p>

            {option.display === "dropdown" ? (
              <select
                value={selections[option.id] || ""}
                onChange={(e) => onSelect(option.id, e.target.value)}
                className="g-select max-w-[360px]"
              >
                {option.values.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.label}
                  </option>
                ))}
              </select>
            ) : (
              <ul className={cn("flex flex-wrap", option.display === "swatch" ? "max-w-[570px] gap-[10.8px]" : "gap-3")}>
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
                            "grid h-16 w-16 place-items-center border-2 bg-white transition-[border-color] duration-500 lg:h-[84px] lg:w-[84px]",
                            isSelected ? "border-black" : "border-garmin-option hover:border-black",
                          )}
                        >
                          {value.swatchImage ? (
                            // eslint-disable-next-line @next/next/no-img-element -- variant photo thumbnails (remote or /uploads)
                            <img
                              src={value.swatchImage}
                              alt=""
                              className={cn("h-[60px] w-[60px] object-contain lg:h-20 lg:w-20", !fits && !isSelected && "opacity-30")}
                            />
                          ) : (
                            <span
                              className={cn(
                                "h-12 w-12 rounded-full border border-garmin-option bg-[var(--swatch)]",
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
                          "h-[39px] border-2 px-[17.5px] py-[7px] text-[14px] leading-[21px] transition-colors",
                          isSelected ? "border-black bg-black text-white" : "border-garmin-option bg-white text-black hover:border-black",
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
