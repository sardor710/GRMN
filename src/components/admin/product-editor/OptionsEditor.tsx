"use client";

import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Trash2, X } from "lucide-react";
import type { OptionDisplay, ProductImage, ProductOption, ProductOptionValue } from "@/lib/cms/types";
import { labelClass, linkButtonClass, newId, smallInputClass } from "./shared";

interface OptionsEditorProps {
  options: ProductOption[];
  images: ProductImage[];
  onChange: (options: ProductOption[]) => void;
}

const DISPLAY_LABELS: Record<OptionDisplay, string> = {
  buttons: "Buttons",
  swatch: "Swatches (color / image)",
  dropdown: "Dropdown",
};

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const moveItem = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const isHexColor = (v: string | undefined): v is string => Boolean(v && /^#[0-9a-f]{6}$/i.test(v));

export function OptionsEditor({ options, images, onChange }: OptionsEditorProps) {
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});

  const updateOption = (id: string, patch: Partial<ProductOption>) =>
    onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const updateValue = (optionId: string, valueId: string, patch: Partial<ProductOptionValue>) =>
    onChange(
      options.map((o) =>
        o.id === optionId ? { ...o, values: o.values.map((v) => (v.id === valueId ? { ...v, ...patch } : v)) } : o,
      ),
    );

  const renameValue = (option: ProductOption, value: ProductOptionValue, label: string) =>
    updateValue(option.id, value.id, {
      label,
      // keys of hand-made values follow the label (they feed generated SKUs); imported keys stay put
      ...(value.key === value.label ? { key: label } : {}),
    });

  const addOption = () =>
    onChange([...options, { id: newId("opt"), key: "", name: "", display: "buttons", values: [] }]);

  const addValues = (option: ProductOption) => {
    const raw = valueDrafts[option.id] || "";
    const existing = new Set(option.values.map((v) => v.label.trim().toLowerCase()));
    const labels = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !existing.has(s.toLowerCase()));
    if (!labels.length) return;
    updateOption(option.id, {
      values: [...option.values, ...labels.map((label) => ({ id: newId("val"), key: label, label }))],
    });
    setValueDrafts((d) => ({ ...d, [option.id]: "" }));
  };

  return (
    <div className="space-y-3">
      {options.length === 0 && (
        <p className="border border-border bg-white p-3 text-xs text-muted-foreground">
          This is a simple product (one SKU). Add an option such as <strong>Size</strong> or <strong>Color</strong> if it is
          sold in several variants.
        </p>
      )}

      {options.map((option, oIdx) => (
        <div key={option.id} className="border border-border bg-white p-3 space-y-3 rounded-none">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <div>
              <label className={labelClass} htmlFor={`${option.id}-name`}>
                Option {oIdx + 1} name
              </label>
              <input
                id={`${option.id}-name`}
                type="text"
                value={option.name}
                onChange={(e) =>
                  updateOption(option.id, {
                    name: e.target.value,
                    ...(option.key === "" || option.key === slug(option.name) ? { key: slug(e.target.value) } : {}),
                  })
                }
                placeholder="e.g. Size, Groupset, Color"
                className={`mt-1 ${smallInputClass} h-8`}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor={`${option.id}-display`}>
                Show as
              </label>
              <select
                id={`${option.id}-display`}
                value={option.display}
                onChange={(e) => updateOption(option.id, { display: e.target.value as OptionDisplay })}
                className={`mt-1 ${smallInputClass} h-8`}
              >
                {(Object.keys(DISPLAY_LABELS) as OptionDisplay[]).map((d) => (
                  <option key={d} value={d}>
                    {DISPLAY_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onChange(moveItem(options, oIdx, oIdx - 1))}
                disabled={oIdx === 0}
                aria-label={`Move option ${option.name || oIdx + 1} up`}
                className="p-1.5 text-muted-foreground hover:text-black disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onChange(moveItem(options, oIdx, oIdx + 1))}
                disabled={oIdx === options.length - 1}
                aria-label={`Move option ${option.name || oIdx + 1} down`}
                className="p-1.5 text-muted-foreground hover:text-black disabled:opacity-30"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onChange(options.filter((o) => o.id !== option.id))}
                aria-label={`Remove option ${option.name || oIdx + 1}`}
                className="p-1.5 text-muted-foreground hover:text-garmin-error"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Values */}
          <div className="space-y-1.5">
            <span className={labelClass}>Values ({option.values.length})</span>
            {option.values.map((value, vIdx) => (
              <div key={value.id} className="flex flex-wrap items-center gap-1.5 bg-neutral-50 border border-border p-1.5">
                {option.display === "swatch" && (
                  <span
                    aria-hidden="true"
                    className="h-6 w-6 shrink-0 overflow-hidden rounded-garmin-pill border border-border bg-white"
                  >
                    {value.swatchImage ? (
                      // eslint-disable-next-line @next/next/no-img-element -- tiny swatch preview
                      <img src={value.swatchImage} alt="" className="h-full w-full object-cover" />
                    ) : isHexColor(value.swatchColor) ? (
                      <svg viewBox="0 0 1 1" className="h-full w-full">
                        <rect width="1" height="1" fill={value.swatchColor} />
                      </svg>
                    ) : null}
                  </span>
                )}
                <input
                  type="text"
                  value={value.label}
                  onChange={(e) => renameValue(option, value, e.target.value)}
                  aria-label={`${option.name || "Option"} value ${vIdx + 1}`}
                  className={`${smallInputClass} min-w-[120px] flex-1`}
                />
                {option.display === "swatch" && (
                  <>
                    <input
                      type="color"
                      value={isHexColor(value.swatchColor) ? value.swatchColor : "#000000"}
                      onChange={(e) => updateValue(option.id, value.id, { swatchColor: e.target.value })}
                      aria-label={`Swatch color for ${value.label}`}
                      title="Swatch color"
                      className="h-7 w-9 cursor-pointer border border-border bg-white p-0.5"
                    />
                    <select
                      value={value.swatchImage || ""}
                      onChange={(e) => updateValue(option.id, value.id, { swatchImage: e.target.value || undefined })}
                      aria-label={`Swatch image for ${value.label}`}
                      className={`${smallInputClass} w-40`}
                    >
                      <option value="">No swatch photo</option>
                      {value.swatchImage && !images.some((i) => i.src === value.swatchImage) && (
                        <option value={value.swatchImage}>Current image</option>
                      )}
                      {images.map((img, i) => (
                        <option key={img.id} value={img.src}>
                          Photo {i + 1}
                          {img.alt ? ` – ${img.alt.slice(0, 30)}` : ""}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => updateOption(option.id, { values: moveItem(option.values, vIdx, vIdx - 1) })}
                    disabled={vIdx === 0}
                    aria-label={`Move ${value.label} earlier`}
                    className="p-1 text-muted-foreground hover:text-black disabled:opacity-30"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateOption(option.id, { values: moveItem(option.values, vIdx, vIdx + 1) })}
                    disabled={vIdx === option.values.length - 1}
                    aria-label={`Move ${value.label} later`}
                    className="p-1 text-muted-foreground hover:text-black disabled:opacity-30"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateOption(option.id, { values: option.values.filter((v) => v.id !== value.id) })}
                    aria-label={`Remove value ${value.label}`}
                    className="p-1 text-muted-foreground hover:text-garmin-error"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <div className="flex gap-1.5">
              <input
                type="text"
                value={valueDrafts[option.id] || ""}
                onChange={(e) => setValueDrafts((d) => ({ ...d, [option.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addValues(option);
                  }
                }}
                placeholder="Add values — e.g. 42, Biggest (comma separates, Enter adds)"
                aria-label={`New value for ${option.name || "option"}`}
                className={`${smallInputClass} flex-1`}
              />
              <button type="button" onClick={() => addValues(option)} className={linkButtonClass}>
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
          </div>
        </div>
      ))}

      <button type="button" onClick={addOption} className={linkButtonClass}>
        <Plus className="h-3.5 w-3.5" />
        Add option
      </button>
    </div>
  );
}
