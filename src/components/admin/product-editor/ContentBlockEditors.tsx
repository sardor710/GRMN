"use client";

import { Box, Plus, Trash2 } from "lucide-react";
import type { ProductSpecItem } from "@/lib/cms/types";

// The Specs, Overview and In the box editors. The product tabs and the per-variant content panel
// (VariantContentEditor) both use these, so the two places always edit content the same way.

const addButtonClass =
  "flex items-center gap-1 text-[11px] font-heading uppercase tracking-wider font-bold text-[#007cc3] hover:underline";
const rowClass = "flex items-center gap-2 bg-neutral-50 p-2 border border-neutral-200 rounded-none";
const removeButtonClass = "text-neutral-400 hover:text-rose-600 p-1";

interface SpecsListEditorProps {
  specs: ProductSpecItem[];
  onChange: (specs: ProductSpecItem[]) => void;
  hint: string;
}

/** Flat label/value spec rows with add and remove. */
export function SpecsListEditor({ specs, onChange, hint }: SpecsListEditorProps) {
  const update = (index: number, field: "label" | "value", value: string) =>
    onChange(specs.map((spec, i) => (i === index ? { ...spec, [field]: value } : spec)));
  return (
    <>
      <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
        <p className="text-[13px] text-neutral-500">{hint}</p>
        <button type="button" onClick={() => onChange([...specs, { label: "New Spec", value: "Value" }])} className={addButtonClass}>
          <Plus className="h-3.5 w-3.5" />
          <span>Add Spec Row</span>
        </button>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {specs.map((spec, idx) => (
          <div key={idx} className={rowClass}>
            <input
              type="text"
              value={spec.label}
              onChange={(e) => update(idx, "label", e.target.value)}
              placeholder="e.g. Battery Life"
              aria-label={`Spec label ${idx + 1}`}
              className="w-1/3 h-8 border border-neutral-300 bg-white px-2.5 text-[12px] text-black focus:border-black focus:outline-none font-medium rounded-none"
            />
            <input
              type="text"
              value={spec.value}
              onChange={(e) => update(idx, "value", e.target.value)}
              placeholder="e.g. Up to 16 days"
              aria-label={`Spec value ${idx + 1}`}
              className="flex-1 h-8 border border-neutral-300 bg-white px-2.5 text-[12px] text-neutral-800 focus:border-black focus:outline-none rounded-none"
            />
            <button
              type="button"
              onClick={() => onChange(specs.filter((_, i) => i !== idx))}
              aria-label={`Remove spec row ${idx + 1}`}
              className={removeButtonClass}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

interface InTheBoxEditorProps {
  items: string[];
  onChange: (items: string[]) => void;
}

/** The itemized In the box list with add and remove. */
export function InTheBoxEditor({ items, onChange }: InTheBoxEditorProps) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
        <p className="text-[13px] text-neutral-500">Itemized list of hardware, cables, and packaging contents.</p>
        <button type="button" onClick={() => onChange([...items, "Included Item in Packaging"])} className={addButtonClass}>
          <Plus className="h-3.5 w-3.5" />
          <span>Add Item</span>
        </button>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {items.map((item, idx) => (
          <div key={idx} className={rowClass}>
            <Box className="h-4 w-4 text-[#007cc3] shrink-0" aria-hidden="true" />
            <input
              type="text"
              value={item}
              onChange={(e) => onChange(items.map((current, i) => (i === idx ? e.target.value : current)))}
              placeholder="e.g. USB-C Charging / Data Cable"
              aria-label={`In the box item ${idx + 1}`}
              className="flex-1 h-8 border border-neutral-300 bg-white px-2.5 text-[12px] text-black focus:border-black focus:outline-none rounded-none"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              aria-label={`Remove item ${idx + 1}`}
              className={removeButtonClass}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

interface OverviewHtmlEditorProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/** The Overview tab HTML (sanitized on the server when saved). */
export function OverviewHtmlEditor({ id, label, value, onChange }: OverviewHtmlEditorProps) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600">
          {label}
        </label>
        {value && (
          <button type="button" onClick={() => onChange("")} className="text-[11px] font-medium text-rose-600 hover:underline">
            Clear overview
          </button>
        )}
      </div>
      <textarea
        id={id}
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="<h2>Headline</h2><p>Text…</p> — scripts, styles and event handlers are removed on save"
        className="mt-1 w-full border border-neutral-300 bg-white p-3 font-mono text-[12px] text-black focus:border-black focus:outline-none rounded-none"
      />
      <p className="mt-1 text-[11px] text-neutral-500">{value.length.toLocaleString()} characters · sanitized on save</p>
    </div>
  );
}
